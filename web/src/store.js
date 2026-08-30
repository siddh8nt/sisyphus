// Tiny external store fed by the WebSocket bus. No extra deps — useSyncExternalStore.
import { useSyncExternalStore } from 'react';

const MAX_OUTPUT = 8000; // cap streamed text per task
const MAX_REASONING = 200;

let state = {
  connected: false,
  phones: [],
  session: null, // {id, prompt, startedAt, completed}
  reasoning: [], // {source, text, ts}
  plan: null, // {tasks:[...]}
  approval: null, // {tasks:[...rows], timeoutMs, requestedAt, resolved, auto?}
  tasks: {}, // taskId -> {taskId, title, file, state, phoneId, phoneName, runtime, detail, ...result}
  outputs: {}, // taskId -> streamed text
  stats: null, // final session stats
  telemetry: {}, // phoneId -> [{temp, cpu, ts}] ring buffer (last 60)
};

const MAX_TELEM = 60;

const listeners = new Set();
function commit(next) {
  state = next;
  for (const l of listeners) l();
}
export function getState() {
  return state;
}
function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useStore() {
  return useSyncExternalStore(subscribe, getState, getState);
}

function resetSession(id, prompt, ts) {
  return {
    ...state,
    session: { id, prompt, startedAt: ts, completed: false },
    reasoning: [],
    plan: null,
    approval: null,
    tasks: {},
    outputs: {},
    stats: null,
  };
}

function reduce(msg) {
  const { type, payload, ts } = msg;
  switch (type) {
    case 'hello': {
      const next = {
        ...state,
        phones: payload.phones || [],
        // A dashboard opened mid-wait still renders the pending approval table.
        approval: payload.approval
          ? { ...payload.approval, requestedAt: ts, resolved: false }
          : state.approval,
      };
      // Restore the active session so a UI opened/reloaded mid-run (esp. a worker
      // view) shows its tasks + gate logs instead of a blank READY state.
      if (payload.session) {
        next.session = payload.session;
        if (payload.plan) next.plan = payload.plan;
        if (Array.isArray(payload.tasks) && payload.tasks.length) {
          next.tasks = Object.fromEntries(payload.tasks.map((t) => [t.taskId, t]));
        }
        if (payload.outputs) next.outputs = { ...state.outputs, ...payload.outputs };
      }
      return next;
    }
    case 'phone_update': {
      const phones = state.phones.slice();
      const i = phones.findIndex((p) => p.phoneId === payload.phoneId);
      if (i >= 0) phones[i] = payload;
      else phones.push(payload);
      let telemetry = state.telemetry;
      if (payload.telemetry) {
        const hist = (state.telemetry[payload.phoneId] || []).concat({
          temp: payload.telemetry.batteryTempC,
          cpu: payload.telemetry.cpuLoad,
          ts,
        }).slice(-MAX_TELEM);
        telemetry = { ...state.telemetry, [payload.phoneId]: hist };
      }
      return { ...state, phones, telemetry };
    }
    case 'session_started':
      return resetSession(msg.sessionId, payload.prompt, ts);
    case 'reasoning': {
      const reasoning = [...state.reasoning, { source: payload.source, text: payload.text, ts }].slice(-MAX_REASONING);
      return { ...state, reasoning };
    }
    case 'plan':
      return { ...state, plan: payload };
    case 'approval_pending':
      return { ...state, approval: { ...payload, requestedAt: ts, resolved: false } };
    case 'approval_resolved':
      return {
        ...state,
        approval: state.approval
          ? { ...state.approval, resolved: true, auto: payload.auto, overrides: payload.overrides }
          : null,
      };
    case 'task_gate': {
      const prev = state.tasks[payload.taskId] || { taskId: payload.taskId };
      const tasks = { ...state.tasks, [payload.taskId]: { ...prev, gate: payload.gate } };
      return { ...state, tasks };
    }
    case 'task_state': {
      const prev = state.tasks[payload.taskId] || { taskId: payload.taskId };
      const tasks = { ...state.tasks, [payload.taskId]: { ...prev, ...payload } };
      return { ...state, tasks };
    }
    case 'token': {
      const cur = state.outputs[payload.taskId] || '';
      const outputs = { ...state.outputs, [payload.taskId]: (cur + payload.text).slice(-MAX_OUTPUT) };
      return { ...state, outputs };
    }
    case 'task_result': {
      const prev = state.tasks[payload.taskId] || { taskId: payload.taskId };
      const tasks = { ...state.tasks, [payload.taskId]: { ...prev, ...payload, result: true } };
      return { ...state, tasks };
    }
    case 'session_completed':
      return { ...state, stats: payload.stats, session: state.session ? { ...state.session, completed: true, summary: payload.summary } : null };
    default:
      return state;
  }
}

let ws = null;
let reconnectTimer = null;
export function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws`;
  ws = new WebSocket(url);
  ws.onopen = () => commit({ ...state, connected: true });
  ws.onclose = () => {
    commit({ ...state, connected: false });
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWs, 1000);
  };
  ws.onerror = () => ws && ws.close();
  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    commit(reduce(msg));
  };
}
