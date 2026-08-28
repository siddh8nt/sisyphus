// Task engine: sessions, parallel dispatch (one in-flight per phone, least-loaded
// first), the lifecycle state machine, validation-driven retry, and Claude
// fallback. Adapter-agnostic — it talks to worker-client, which hides Ollama vs
// OpenAI. All state transitions emit WS events; stats persist to SQLite.
import { shortId } from './lib/ids.js';
import { store } from './db/index.js';
import { emit, setSession, getSession } from './bus.js';
import { log } from './lib/log.js';
import * as registry from './registry.js';
import { generate } from './lib/worker-client.js';
import { validate } from './lib/validate.js';
import { buildWorkerPrompt } from './prompts/build.js';

let session = null; // active session

// --- reasoning + session -------------------------------------------------
export function logReasoning(text, source = 'sisyphus') {
  emit('reasoning', { source, text });
  return { ok: true };
}

export function startSession(prompt) {
  const sessionId = shortId();
  session = {
    sessionId,
    prompt,
    startedAt: Date.now(),
    tasks: new Map(),
    keep: [],
    phoneAgg: new Map(), // phoneId -> {tasks, tokensIn, tokensOut, tokPerSecSum}
  };
  store.insertSession(sessionId, prompt);
  setSession(sessionId);
  emit('session_started', { prompt });
  log.ok('session started', sessionId, JSON.stringify(prompt).slice(0, 60));
  return { sessionId };
}

export function getActiveSession() {
  return session;
}

/** Start a session lazily; if one exists but has no prompt yet, fill it in. */
export function ensureSession(prompt) {
  if (!session) return startSession(prompt || '');
  if (prompt && !session.prompt) {
    session.prompt = prompt;
    store.updateSessionPrompt(session.sessionId, prompt);
  }
  return { sessionId: session.sessionId };
}

// --- state machine helper ------------------------------------------------
function setState(task, state, extra = {}) {
  task.state = state;
  if (extra.phoneId !== undefined) task.phoneId = extra.phoneId;
  if (extra.runtime !== undefined) task.runtime = extra.runtime;
  emit('task_state', {
    taskId: task.id,
    state,
    phoneId: task.phoneId ?? undefined,
    runtime: task.runtime ?? undefined,
    detail: extra.detail,
  });
  persist(task);
}

function persist(task) {
  if (!session) return;
  store.upsertTask({
    id: task.id,
    sessionId: session.sessionId,
    title: task.title,
    file: task.file,
    language: task.language,
    assign: task.assign,
    phoneId: task.phoneId,
    phoneName: task.phoneName,
    runtime: task.runtime,
    state: task.state,
    status: task.status,
    tokensIn: task.tokensIn,
    tokensOut: task.tokensOut,
    durationMs: task.durationMs,
    tokPerSec: task.tokPerSec,
    fallback: task.fallback,
    code: task.code,
    createdAt: task.createdAt,
  });
}

// --- delegate ------------------------------------------------------------
export async function delegate({ tasks = [], keep = [], prompt } = {}) {
  ensureSession(prompt);
  session.keep = keep;

  const taskObjs = tasks.map((t) => ({
    id: shortId(),
    title: t.title,
    file: t.file,
    language: t.language || null,
    spec: t.spec || '',
    checks: t.checks || [],
    signatures: t.signatures || null,
    allowImports: t.allowImports || null,
    assign: null,
    phoneId: null,
    phoneName: null,
    runtime: null,
    state: 'planned',
    status: 'pending',
    tokensIn: 0,
    tokensOut: 0,
    durationMs: 0,
    tokPerSec: 0,
    fallback: false,
    code: null,
    createdAt: Date.now(),
  }));
  for (const t of taskObjs) {
    session.tasks.set(t.id, t);
    persist(t);
  }

  const online = registry.onlinePhones().filter((p) => registry.pickEndpoint(p));

  if (online.length === 0) {
    logReasoning('No phones online with a usable runtime — Claude will do all delegated tasks.');
    for (const t of taskObjs) failToFallback(t);
    emitPlan(taskObjs, keep);
    return taskObjs.map(result);
  }

  // Assign least-loaded: build per-phone queues.
  const load = new Map(online.map((p) => [p.phoneId, 0]));
  const queues = new Map(online.map((p) => [p.phoneId, []]));
  for (const t of taskObjs) {
    let best = online[0];
    for (const p of online) if (load.get(p.phoneId) < load.get(best.phoneId)) best = p;
    load.set(best.phoneId, load.get(best.phoneId) + 1);
    queues.get(best.phoneId).push(t);
    t.assign = best.phoneId;
    t.phoneId = best.phoneId;
    t.phoneName = best.name;
    persist(t);
  }

  emitPlan(taskObjs, keep);

  // Run each phone's queue sequentially; phones run concurrently.
  await Promise.all(
    online.map(async (phone) => {
      for (const t of queues.get(phone.phoneId)) {
        await runTask(t, phone);
      }
    })
  );

  return taskObjs.map(result);
}

function emitPlan(taskObjs, keep) {
  emit('plan', {
    tasks: [
      ...taskObjs.map((t) => ({
        taskId: t.id,
        title: t.title,
        assign: t.assign || 'claude',
        rationale: t.spec?.split('\n')[0] || '',
        file: t.file,
      })),
      ...keep.map((k) => ({
        taskId: 'keep_' + shortId(),
        title: k.title,
        assign: 'claude',
        rationale: k.rationale || '',
        file: k.file || null,
      })),
    ],
  });
}

// --- run one task through the lifecycle ----------------------------------
async function runTask(task, phone) {
  setState(task, 'queued', { phoneId: phone.phoneId });

  let endpoint = registry.pickEndpoint(phone);
  if (endpoint && endpoint.runtime === 'cpu' && registry.hasUnhealthyNpu(phone)) {
    logReasoning(`NPU endpoint on ${phone.name} is unavailable — routing this task to CPU.`);
  }
  setState(task, 'dispatched', { phoneId: phone.phoneId, runtime: endpoint?.runtime });

  let validatorError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    endpoint = registry.pickEndpoint(phone); // re-pick (health may have changed)
    if (!endpoint) break;
    task.runtime = endpoint.runtime;

    try {
      setState(task, 'generating', { phoneId: phone.phoneId, runtime: endpoint.runtime });
      const { system, user } = buildWorkerPrompt(task, validatorError);
      const out = await generate({
        endpoint,
        system,
        user,
        onToken: (text) => emit('token', { taskId: task.id, phoneId: phone.phoneId, text }),
      });

      setState(task, 'validating', { phoneId: phone.phoneId });
      const v = validate(out.text, task.file, task.checks);

      if (v.ok) {
        task.code = v.code;
        task.tokensIn = out.tokensIn;
        task.tokensOut = out.tokensOut;
        task.durationMs = out.durationMs;
        task.tokPerSec = out.durationMs > 0 ? +(out.tokensOut / (out.durationMs / 1000)).toFixed(1) : 0;
        task.status = 'completed';
        task.fallback = false;
        setState(task, 'completed', { phoneId: phone.phoneId, runtime: endpoint.runtime });
        recordStats(task);
        emitResult(task);
        return;
      }

      if (attempt === 0) {
        logReasoning(`Task "${task.title}" failed validation on ${phone.name}: ${v.error}. Retrying once.`);
        setState(task, 'retrying', { phoneId: phone.phoneId, detail: v.error });
        validatorError = v.error;
        setState(task, 'dispatched', { phoneId: phone.phoneId, runtime: endpoint.runtime });
        continue;
      }
      break; // second failure → fallback
    } catch (err) {
      const msg = err?.name === 'AbortError' ? 'timed out (120s)' : err.message;
      if (attempt === 0) {
        logReasoning(`${phone.name} error on "${task.title}": ${msg}. Retrying once.`);
        setState(task, 'retrying', { phoneId: phone.phoneId, detail: msg });
        validatorError = `generation error: ${msg}`;
        setState(task, 'dispatched', { phoneId: phone.phoneId, runtime: endpoint?.runtime });
        continue;
      }
      break;
    }
  }

  logReasoning(`Task "${task.title}" could not be completed on device — handing back to Claude.`);
  failToFallback(task);
  emitResult(task);
}

function failToFallback(task) {
  task.status = 'failed';
  task.fallback = true;
  setState(task, 'failed', { phoneId: task.phoneId });
  setState(task, 'fallback_claude', { phoneId: task.phoneId });
}

// --- stats ---------------------------------------------------------------
function recordStats(task) {
  if (!session) return;
  const agg = session.phoneAgg.get(task.phoneId) || { tasks: 0, tokensIn: 0, tokensOut: 0, tokPerSecSum: 0 };
  agg.tasks += 1;
  agg.tokensIn += task.tokensIn;
  agg.tokensOut += task.tokensOut;
  agg.tokPerSecSum += task.tokPerSec;
  session.phoneAgg.set(task.phoneId, agg);
  store.upsertPhoneStats({
    phoneId: task.phoneId,
    sessionId: session.sessionId,
    tasksCompleted: agg.tasks,
    tokensIn: agg.tokensIn,
    tokensOut: agg.tokensOut,
    avgTokPerSec: +(agg.tokPerSecSum / agg.tasks).toFixed(1),
  });
}

function emitResult(task) {
  emit('task_result', {
    taskId: task.id,
    status: task.status,
    runtime: task.runtime,
    phoneId: task.phoneId,
    phoneName: task.phoneName,
    tokensIn: task.tokensIn,
    tokensOut: task.tokensOut,
    durationMs: task.durationMs,
    tokPerSec: task.tokPerSec,
    fallback: task.fallback,
  });
}

function result(task) {
  return {
    taskId: task.id,
    title: task.title,
    file: task.file,
    status: task.status,
    code: task.code || undefined,
    tokensOut: task.tokensOut,
    phoneName: task.phoneName,
    runtime: task.runtime,
    fallback: task.fallback,
  };
}

// --- complete ------------------------------------------------------------
export function completeSession(summary, filesChanged = []) {
  if (!session) return { error: 'no active session' };
  const tasks = [...session.tasks.values()];
  const onDevice = tasks.filter((t) => t.status === 'completed' && !t.fallback);
  const fellBack = tasks.filter((t) => t.fallback);
  const npuTasks = onDevice.filter((t) => t.runtime === 'npu');
  const cloudTokensSaved = onDevice.reduce((s, t) => s + (t.tokensOut || 0), 0);
  const stats = {
    tasksTotal: tasks.length + session.keep.length,
    tasksOnDevice: onDevice.length,
    tasksCloud: fellBack.length + session.keep.length,
    npuTasks: npuTasks.length,
    cloudTokensSaved,
    wallClockMs: Date.now() - session.startedAt,
    filesChanged,
  };
  store.completeSession(session.sessionId, summary, stats);
  emit('session_completed', { summary, stats });
  log.ok('session complete', session.sessionId, JSON.stringify(stats));
  const done = { stats, sessionId: session.sessionId };
  session = null; // clear so the next delegate/log starts a fresh session
  return done;
}
