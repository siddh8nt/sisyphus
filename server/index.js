// Sisyphus Orchestrator entry point. HTTP + WebSocket on :4100.
import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { PORT, WEB_DIST } from './config.js';
import { log } from './lib/log.js';
import { attachBus, setSnapshotProvider } from './bus.js';
import * as registry from './registry.js';
import * as engine from './engine.js';
import { phonesRouter } from './routes/phones.js';
import { sessionRouter, sessionsReadRouter, devRouter } from './routes/session.js';
import { configRouter } from './routes/config.js';
import { scriptsRouter } from './routes/scripts.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // --- API ---------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    const phones = registry.list();
    res.json({ ok: true, phones: phones.length, online: phones.filter((p) => p.status === 'online').length });
  });

  // Status summary for the MCP sisyphus_status tool (fleshed out in Phase 3).
  app.get('/api/status', (_req, res) => {
    const phones = registry.list();
    res.json({
      online: phones.filter((p) => p.status === 'online').length,
      phones: phones.map((p) => ({
        name: p.name,
        status: p.status,
        activeRuntime: p.activeRuntime,
        runtimes: p.endpoints.map((e) => e.runtime),
        models: [...new Set(p.endpoints.map((e) => e.model).filter(Boolean))],
        healthy: p.endpoints.some((e) => e.healthy),
      })),
    });
  });

  app.use('/api/phones', phonesRouter);
  app.use('/api/session', sessionRouter);
  app.use('/api/sessions', sessionsReadRouter);
  app.use('/api/dev', devRouter);
  app.use('/api/config', configRouter);

  // Phone scripts served at root, templated with the laptop IP. Must come
  // before the static/SPA handler so they aren't swallowed by the fallback.
  app.use('/', scriptsRouter);

  // --- Static web (dashboard) — present after Phase 4 build --------------
  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    // SPA fallback for dashboard + worker views (but not /api or /ws).
    app.get(/^\/(?!api\/|ws\b).*/, (_req, res) => {
      res.sendFile('index.html', { root: WEB_DIST });
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .type('html')
        .send(
          '<h1>Sisyphus orchestrator running</h1><p>Dashboard not built yet (Phase 4). ' +
            'API is live at <code>/api/phones</code>. WS at <code>/ws</code>.</p>'
        );
    });
  }

  return app;
}

// A crashing orchestrator mid-`/sisyphus` is a showstopper: one unhandled
// rejection (a dead WS socket, an abandoned MCP call, a SQLite throw) would
// otherwise take the whole hub — and its in-memory phone registry — down.
// Log and keep serving instead; individual requests are still guarded upstream.
function installCrashGuards() {
  process.on('unhandledRejection', (reason) => {
    log.err('unhandledRejection (kept alive):', reason?.stack || reason);
  });
  process.on('uncaughtException', (err) => {
    log.err('uncaughtException (kept alive):', err?.stack || err);
  });
}

export function startServer() {
  installCrashGuards();
  const app = createApp();
  const server = http.createServer(app);
  attachBus(server);
  // Snapshot includes any routing plan still awaiting approval, so a dashboard
  // opened mid-wait renders the approval table immediately.
  setSnapshotProvider(() => ({ ...registry.snapshot(), approval: engine.pendingApproval() }));
  registry.startRegistry();
  server.listen(PORT, () => {
    log.ok(`orchestrator listening on http://localhost:${PORT}`);
  });
  return server;
}

// Run when invoked directly (node server/index.js), not when imported.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
