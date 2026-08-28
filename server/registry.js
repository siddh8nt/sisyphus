// Phone registry. An *endpoint* is one HTTP model server; a *logical phone*
// groups endpoints by name. One physical phone may have an NPU + a CPU endpoint.
// Endpoints, telemetry, and heartbeats live in memory here (not SQLite).
import {
  HEARTBEAT_TIMEOUT_MS,
  HEALTHCHECK_INTERVAL_MS,
  HEALTHCHECK_TIMEOUT_MS,
  OFFLINE_SWEEP_MS,
} from './config.js';
import { shortId, phoneIdFromName } from './lib/ids.js';
import { store } from './db/index.js';
import { emit, getSession } from './bus.js';
import { log } from './lib/log.js';

/** @type {Map<string, LogicalPhone>} */
const phones = new Map();

// --- registration --------------------------------------------------------
export function register({ name, ip, port, model, runtime, hw }) {
  if (!name || !ip || !port || !runtime) {
    throw new Error('register requires name, ip, port, runtime');
  }
  runtime = runtime === 'npu' ? 'npu' : 'cpu';
  const phoneId = phoneIdFromName(name);

  let phone = phones.get(phoneId);
  if (!phone) {
    phone = {
      phoneId,
      name,
      firstSeen: Date.now(),
      endpoints: new Map(),
      telemetry: null,
      lastHeartbeat: 0,
    };
    phones.set(phoneId, phone);
    store.upsertPhone(phoneId, name);
  }

  // Idempotent by (name, runtime): reuse the existing endpoint of that runtime.
  let endpoint = [...phone.endpoints.values()].find((e) => e.runtime === runtime);
  if (!endpoint) {
    endpoint = { endpointId: shortId(), phoneId, name, runtime };
    phone.endpoints.set(endpoint.endpointId, endpoint);
  }
  Object.assign(endpoint, {
    ip,
    port: Number(port),
    model: model || null,
    hw: hw || endpoint.hw || null,
    healthy: false,
    lastCheck: 0,
    registeredAt: Date.now(),
  });

  log.ok(`registered ${name} [${runtime}] ${ip}:${port} -> ${phoneId}`);
  healthCheckEndpoint(endpoint).finally(() => emitPhone(phone));
  emitPhone(phone);
  return { phoneId, endpointId: endpoint.endpointId };
}

// --- heartbeat -----------------------------------------------------------
export function heartbeat(phoneId, telemetry) {
  const phone = phones.get(phoneId);
  if (!phone) return false;
  phone.telemetry = { ...telemetry, ts: Date.now() };
  phone.lastHeartbeat = Date.now();
  emitPhone(phone);
  return true;
}

// --- health checks -------------------------------------------------------
async function healthCheckEndpoint(endpoint) {
  const url =
    endpoint.runtime === 'npu'
      ? `http://${endpoint.ip}:${endpoint.port}/v1/models`
      : `http://${endpoint.ip}:${endpoint.port}/api/tags`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTHCHECK_TIMEOUT_MS);
  const before = endpoint.healthy;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    endpoint.healthy = res.ok;
  } catch {
    endpoint.healthy = false;
  } finally {
    clearTimeout(timer);
    endpoint.lastCheck = Date.now();
  }
  return endpoint.healthy !== before; // changed?
}

async function healthCheckAll() {
  for (const phone of phones.values()) {
    let changed = false;
    for (const ep of phone.endpoints.values()) {
      if (await healthCheckEndpoint(ep)) changed = true;
    }
    if (changed) emitPhone(phone);
  }
}

// --- status derivation ---------------------------------------------------
export function isOnline(phone) {
  return Date.now() - phone.lastHeartbeat < HEARTBEAT_TIMEOUT_MS;
}

/** NPU preferred when healthy, else CPU when healthy, else the runtime we know about. */
export function activeRuntime(phone) {
  const eps = [...phone.endpoints.values()];
  const npu = eps.find((e) => e.runtime === 'npu');
  const cpu = eps.find((e) => e.runtime === 'cpu');
  if (npu?.healthy) return 'npu';
  if (cpu?.healthy) return 'cpu';
  if (npu) return 'npu';
  if (cpu) return 'cpu';
  return null;
}

/** Endpoint to dispatch a task to (NPU-first with CPU fallback), or null. */
export function pickEndpoint(phone) {
  const eps = [...phone.endpoints.values()];
  const npu = eps.find((e) => e.runtime === 'npu');
  const cpu = eps.find((e) => e.runtime === 'cpu');
  if (npu?.healthy) return npu;
  if (cpu?.healthy) return cpu;
  return null;
}

// --- serialization -------------------------------------------------------
function sessionTotals(phoneId) {
  const sid = getSession();
  const zero = { tasksCompleted: 0, tokensIn: 0, tokensOut: 0, avgTokPerSec: 0 };
  if (!sid) return zero;
  const row = store.phoneStatsForSession(phoneId, sid);
  if (!row) return zero;
  return {
    tasksCompleted: row.tasks_completed,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    avgTokPerSec: row.avg_tok_per_sec,
  };
}

export function serialize(phone) {
  return {
    phoneId: phone.phoneId,
    name: phone.name,
    status: isOnline(phone) ? 'online' : 'offline',
    activeRuntime: activeRuntime(phone),
    endpoints: [...phone.endpoints.values()].map((e) => ({
      endpointId: e.endpointId,
      runtime: e.runtime,
      ip: e.ip,
      port: e.port,
      model: e.model,
      healthy: !!e.healthy,
      status: isOnline(phone) && e.healthy ? 'online' : 'offline',
    })),
    telemetry: phone.telemetry,
    sessionTotals: sessionTotals(phone.phoneId),
  };
}

export function list() {
  return [...phones.values()].map(serialize);
}

export function getPhone(phoneId) {
  return phones.get(phoneId);
}

export function snapshot() {
  return { phones: list(), session: getSession() };
}

function emitPhone(phone) {
  emit('phone_update', serialize(phone));
}

// --- lifecycle -----------------------------------------------------------
let healthTimer = null;
let sweepTimer = null;
const lastStatus = new Map(); // phoneId -> 'online'|'offline'

export function startRegistry() {
  healthTimer = setInterval(() => healthCheckAll().catch(() => {}), HEALTHCHECK_INTERVAL_MS);
  sweepTimer = setInterval(() => {
    for (const phone of phones.values()) {
      const s = isOnline(phone) ? 'online' : 'offline';
      if (lastStatus.get(phone.phoneId) !== s) {
        lastStatus.set(phone.phoneId, s);
        emitPhone(phone); // status flipped — push it
      }
    }
  }, OFFLINE_SWEEP_MS);
  log.ok('registry started (health + offline sweep)');
}

export function stopRegistry() {
  clearInterval(healthTimer);
  clearInterval(sweepTimer);
}

/**
 * @typedef {Object} LogicalPhone
 * @property {string} phoneId
 * @property {string} name
 * @property {number} firstSeen
 * @property {Map<string, any>} endpoints
 * @property {any} telemetry
 * @property {number} lastHeartbeat
 */
