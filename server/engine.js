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
import { validate, extractFirstFencedBlock } from './lib/validate.js';
import { runTests } from './lib/test-runner.js';
import { buildWorkerPrompt } from './prompts/build.js';
import { APPROVAL_TIMEOUT_MS, ETA_TOK_PER_SEC, ETA_OVERHEAD_SEC } from './config.js';

let session = null; // active session
let approvalWaiter = null; // {rows, resolve} while a routing plan awaits the operator

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

/**
 * Start a session lazily. If one exists but has no prompt yet, fill it in. If a
 * NEW, different prompt arrives while a session is still active, the previous
 * flow was abandoned (Claude never called sisyphus_complete) — start fresh so
 * stats don't accumulate across runs.
 */
export function ensureSession(prompt) {
  if (!session) return startSession(prompt || '');
  if (prompt && !session.prompt) {
    session.prompt = prompt;
    store.updateSessionPrompt(session.sessionId, prompt);
  } else if (prompt && session.prompt && prompt !== session.prompt) {
    log.warn('previous session was not completed — starting a fresh one');
    return startSession(prompt);
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
    gateJson: task.gate ? JSON.stringify(task.gate) : null,
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
    tests: Array.isArray(t.tests) ? t.tests : [],
    estTokens: Number(t.estTokens) || 0,
    confidence: t.confidence != null ? Math.max(0, Math.min(100, Number(t.confidence) || 0)) : null,
    etaSec: null,
    gate: null,
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
    t.etaSec = computeEta(t, best);
    setState(t, 'awaiting_approval', { phoneId: best.phoneId });
  }

  emitPlan(taskObjs, keep);

  // Routing must be approved by the operator on the dashboard before any
  // dispatch. Blocks here until POST /api/session/approve (or auto-approves
  // after APPROVAL_TIMEOUT_MS so a headless run never deadlocks).
  const { overrides, auto } = await waitForApproval(taskObjs, online);
  if (auto) {
    logReasoning(`No operator action within ${Math.round(APPROVAL_TIMEOUT_MS / 1000)}s — routing plan auto-approved.`);
  }
  let reassigned = false;
  for (const t of taskObjs) {
    if (overrides[t.id] === 'claude') {
      const q = queues.get(t.phoneId);
      const i = q ? q.indexOf(t) : -1;
      if (i >= 0) q.splice(i, 1);
      t.assign = 'claude'; // move it out of the "on phones" plan column
      reassignToClaude(t);
      reassigned = true;
    }
  }
  // Re-emit the plan so operator reassignments show under "Claude keeps".
  if (reassigned) emitPlan(taskObjs, keep);
  emit('approval_resolved', { overrides, auto });

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

// --- routing approval -----------------------------------------------------
function computeEta(task, phone) {
  const agg = session?.phoneAgg.get(phone.phoneId);
  const runtime = registry.pickEndpoint(phone)?.runtime || 'cpu';
  const observed = agg && agg.tasks > 0 ? agg.tokPerSecSum / agg.tasks : 0;
  const tps = observed > 0 ? observed : ETA_TOK_PER_SEC[runtime] || ETA_TOK_PER_SEC.cpu;
  const est = task.estTokens > 0 ? task.estTokens : 400;
  return Math.max(1, Math.round(est / tps + ETA_OVERHEAD_SEC));
}

function approvalRows(taskObjs, online) {
  const byId = new Map(online.map((p) => [p.phoneId, p]));
  return taskObjs.map((t) => {
    const endpoint = byId.has(t.phoneId) ? registry.pickEndpoint(byId.get(t.phoneId)) : null;
    return {
      taskId: t.id,
      title: t.title,
      file: t.file,
      phoneId: t.phoneId,
      phoneName: t.phoneName,
      model: endpoint?.model || null,
      runtime: endpoint?.runtime || null,
      etaSec: t.etaSec,
      confidence: t.confidence,
      estTokens: t.estTokens || null,
      tests: (t.tests || []).length,
    };
  });
}

function waitForApproval(taskObjs, online) {
  const rows = approvalRows(taskObjs, online);
  emit('approval_pending', { tasks: rows, timeoutMs: APPROVAL_TIMEOUT_MS });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      approvalWaiter = null;
      resolve({ overrides: {}, auto: true });
    }, APPROVAL_TIMEOUT_MS);
    approvalWaiter = {
      rows,
      resolve: (overrides) => {
        clearTimeout(timer);
        approvalWaiter = null;
        resolve({ overrides: overrides || {}, auto: false });
      },
    };
  });
}

/** Dashboard approval endpoint. overrides: {taskId: 'claude'} reroutes to Claude. */
export function approvePlan(overrides = {}) {
  if (!approvalWaiter) return { error: 'no routing plan awaiting approval' };
  const rerouted = Object.values(overrides).filter((v) => v === 'claude').length;
  logReasoning(
    rerouted > 0
      ? `Operator approved the routing plan (${rerouted} task(s) rerouted to Claude).`
      : 'Operator approved the routing plan.'
  );
  approvalWaiter.resolve(overrides);
  return { ok: true };
}

/** Pending approval table (for the WS hello snapshot), or null. */
export function pendingApproval() {
  return approvalWaiter ? { tasks: approvalWaiter.rows, timeoutMs: APPROVAL_TIMEOUT_MS } : null;
}

/**
 * Current-session snapshot for the WS `hello` so a UI opened or reloaded
 * mid/post-run (esp. a worker view) renders the tasks + gate log it missed,
 * instead of falling back to READY. Rebuilds the plan + per-task view state; the
 * final code stands in for the streamed output pane.
 */
export function sessionSnapshot() {
  if (!session) return { session: null, plan: null, tasks: [], outputs: {} };
  const list = [...session.tasks.values()];
  const outputs = {};
  const tasks = list.map((t) => {
    if (t.code) outputs[t.id] = t.code;
    return {
      taskId: t.id,
      title: t.title,
      file: t.file,
      state: t.state,
      status: t.status,
      phoneId: t.phoneId,
      phoneName: t.phoneName,
      runtime: t.runtime,
      gate: t.gate || undefined,
      tokensOut: t.tokensOut || 0,
      tokPerSec: t.tokPerSec || 0,
      durationMs: t.durationMs || 0,
      fallback: !!t.fallback,
      result: ['completed', 'failed', 'fallback_claude'].includes(t.state) || undefined,
    };
  });
  const plan = {
    tasks: [
      ...list.map((t) => ({
        taskId: t.id,
        title: t.title,
        assign: t.assign || 'claude',
        rationale: t.spec?.split('\n')[0] || '',
        file: t.file,
      })),
      ...session.keep.map((k) => ({ taskId: 'keep_' + k.title, title: k.title, assign: 'claude', rationale: k.rationale || '' })),
    ],
  };
  return {
    session: { id: session.sessionId, prompt: session.prompt, startedAt: session.startedAt, completed: !!session.completed },
    plan,
    tasks,
    outputs,
  };
}

function reassignToClaude(task) {
  task.status = 'reassigned';
  task.fallback = true;
  setState(task, 'fallback_claude', { phoneId: task.phoneId, detail: 'rerouted to Claude by the operator' });
  emitResult(task);
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

      // Deterministic gate: structure/syntax/regex checks, then the task's
      // baked-in unit tests. Claude never reviews gate-passed code — the gate
      // IS the review; Claude only pulls code into context when this fails.
      setState(task, 'validating', { phoneId: phone.phoneId });
      const v = validate(out.text, task.file, task.checks);
      task.code = v.code || extractFirstFencedBlock(out.text) || task.code;
      let gate = { passed: v.ok, checks: v.checks };

      if (v.ok && (task.tests || []).length > 0) {
        setState(task, 'testing', { phoneId: phone.phoneId, runtime: endpoint.runtime });
        const tr = await runTests(v.code, task.file, task.tests);
        gate = { passed: tr.passed, checks: [...v.checks, ...tr.results] };
      }

      task.gate = gate;
      emit('task_gate', { taskId: task.id, phoneId: phone.phoneId, gate });

      if (gate.passed) {
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

      const gateError = describeGateFailure(gate) || v.error || 'gate failed';
      if (attempt === 0) {
        logReasoning(`Task "${task.title}" failed the gate on ${phone.name}: ${gateError}. Retrying once.`);
        setState(task, 'retrying', { phoneId: phone.phoneId, detail: gateError });
        validatorError = gateError;
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

/** Compact one-line summary of the failing gate checks (for retry prompts + logs). */
function describeGateFailure(gate) {
  if (!gate || gate.passed) return null;
  return gate.checks
    .filter((c) => !c.ok)
    .map((c) => (c.detail ? `${c.name}: ${c.detail}` : c.name))
    .join('; ')
    .slice(0, 600);
}

function gateSummary(gate) {
  if (!gate) return null;
  return {
    passed: gate.passed,
    checksPassed: gate.checks.filter((c) => c.ok).length,
    checksTotal: gate.checks.length,
    failed: gate.passed
      ? undefined
      : gate.checks.filter((c) => !c.ok).map((c) => ({ name: c.name, detail: c.detail })),
  };
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
  // Self-describing so a live worker view (which never received title/file via
  // task_state, and may have missed the live task_gate) converges on exactly
  // what the hello-snapshot path shows: clean extracted code + gate + header.
  emit('task_result', {
    taskId: task.id,
    title: task.title,
    file: task.file,
    status: task.status,
    runtime: task.runtime,
    phoneId: task.phoneId,
    phoneName: task.phoneName,
    tokensIn: task.tokensIn,
    tokensOut: task.tokensOut,
    durationMs: task.durationMs,
    tokPerSec: task.tokPerSec,
    fallback: task.fallback,
    code: task.code,
    gate: task.gate || undefined,
  });
}

/**
 * MCP-facing result. Token-efficiency contract: `code` is included ONLY when
 * Claude actually has to look at it (gate failed, fallback, or operator
 * reassignment). Gate-passed code stays on the hub — Claude writes it to disk
 * blind via sisyphus_apply, or pulls it explicitly via sisyphus_fetch.
 */
function result(task) {
  const gateFailed = task.gate ? !task.gate.passed : false;
  const needsCode = task.fallback || gateFailed;
  return {
    taskId: task.id,
    title: task.title,
    file: task.file,
    status: task.status,
    code: needsCode ? task.code || undefined : undefined,
    gate: gateSummary(task.gate),
    tokensOut: task.tokensOut,
    phoneName: task.phoneName,
    runtime: task.runtime,
    fallback: task.fallback,
    reassigned: task.status === 'reassigned' || undefined,
  };
}

/**
 * Full task dump (code + gate) for the active session — or, if the session was
 * already completed, the most recent stored one. Serves sisyphus_apply/fetch.
 */
export function listSessionTasks() {
  const shape = (t) => ({
    taskId: t.id,
    title: t.title,
    file: t.file,
    status: t.status,
    state: t.state,
    phoneName: t.phoneName,
    runtime: t.runtime,
    fallback: !!t.fallback,
    gate: t.gate || null,
    code: t.code || null,
    tokensOut: t.tokensOut || 0,
  });
  if (session) return [...session.tasks.values()].map(shape);
  const last = store.listSessions(1)[0];
  if (!last) return [];
  return store.listTasksForSession(last.id).map((r) =>
    shape({
      id: r.id,
      title: r.title,
      file: r.file,
      status: r.status,
      state: r.state,
      phoneName: r.phone_name,
      runtime: r.runtime,
      fallback: !!r.fallback,
      gate: r.gate_json ? JSON.parse(r.gate_json) : null,
      code: r.code,
      tokensOut: r.tokens_out,
    })
  );
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
