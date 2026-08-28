// The single realtime channel. Every UI (dashboard + worker views) subscribes to
// the same WebSocket at /ws. All messages share the envelope {type, ts, sessionId, payload}.
import { WebSocketServer } from 'ws';
import { log } from './lib/log.js';

let wss = null;
let currentSessionId = null;
let snapshotProvider = () => ({ phones: [], session: null });

/** Attach a WS server (path /ws) to an existing http.Server. */
export function attachBus(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (ws) => {
    // Send a hello snapshot so a freshly-opened UI is immediately correct.
    send(ws, { type: 'hello', ts: Date.now(), sessionId: currentSessionId, payload: snapshotProvider() });
    ws.on('error', (e) => log.debug('ws client error', e.message));
  });
  log.ok('ws bus attached at /ws');
  return wss;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      log.debug('ws send failed', e.message);
    }
  }
}

/** Broadcast an event to every connected client. */
export function emit(type, payload) {
  const msg = { type, ts: Date.now(), sessionId: currentSessionId, payload };
  if (!wss) return msg;
  for (const client of wss.clients) send(client, msg);
  return msg;
}

export function setSession(id) {
  currentSessionId = id;
}

export function getSession() {
  return currentSessionId;
}

export function setSnapshotProvider(fn) {
  snapshotProvider = fn;
}

export function clientCount() {
  return wss ? wss.clients.size : 0;
}
