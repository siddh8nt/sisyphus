import express from 'express';
import * as engine from '../engine.js';
import { store } from '../db/index.js';

export const sessionRouter = express.Router();

// --- MCP-facing session lifecycle ---------------------------------------
sessionRouter.post('/start', (req, res) => {
  const { prompt } = req.body || {};
  res.json(engine.startSession(prompt || ''));
});

sessionRouter.post('/log', (req, res) => {
  const { text, source, prompt } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  engine.ensureSession(prompt); // first log starts the session (with the user's prompt)
  res.json(engine.logReasoning(text, source || 'claude'));
});

// Blocking: resolves only when all delegated tasks have settled.
sessionRouter.post('/delegate', async (req, res) => {
  try {
    const results = await engine.delegate(req.body || {});
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dashboard: approve the pending routing plan. overrides maps taskId ->
// 'claude' for rows the operator toggled to Claude; everything else dispatches
// to its assigned phone.
sessionRouter.post('/approve', (req, res) => {
  const { overrides } = req.body || {};
  const r = engine.approvePlan(overrides || {});
  if (r.error) return res.status(409).json(r);
  res.json(r);
});

// MCP: full task dump (code + gate) for sisyphus_apply / sisyphus_fetch.
sessionRouter.get('/tasks', (_req, res) => {
  res.json({ tasks: engine.listSessionTasks() });
});

sessionRouter.post('/complete', (req, res) => {
  const { summary, filesChanged } = req.body || {};
  res.json(engine.completeSession(summary || '', filesChanged || []));
});

// --- History read API ----------------------------------------------------
export const sessionsReadRouter = express.Router();

sessionsReadRouter.get('/', (_req, res) => {
  const rows = store.listSessions(50).map((s) => ({
    ...s,
    stats: s.stats_json ? JSON.parse(s.stats_json) : null,
  }));
  res.json(rows);
});

sessionsReadRouter.get('/:id', (req, res) => {
  const s = store.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json({
    ...s,
    stats: s.stats_json ? JSON.parse(s.stats_json) : null,
    tasks: store.listTasksForSession(req.params.id),
  });
});

// --- Dev-only: exercise the engine without MCP --------------------------
export const devRouter = express.Router();

devRouter.post('/delegate', async (req, res) => {
  try {
    const { prompt, tasks, keep } = req.body || {};
    engine.startSession(prompt || '(dev delegate)');
    const results = await engine.delegate({ tasks: tasks || [], keep: keep || [] });
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
