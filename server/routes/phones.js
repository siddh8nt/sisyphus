import express from 'express';
import * as registry from '../registry.js';

export const phonesRouter = express.Router();

// Register (or re-register) an endpoint. Idempotent by (name, runtime).
phonesRouter.post('/register', (req, res) => {
  try {
    const { name, ip, port, model, runtime, hw } = req.body || {};
    const result = registry.register({ name, ip, port, model, runtime, hw });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Heartbeat carries live telemetry. :id is the logical phoneId.
phonesRouter.post('/:id/heartbeat', (req, res) => {
  const ok = registry.heartbeat(req.params.id, req.body || {});
  if (!ok) return res.status(404).json({ error: 'unknown phone' });
  res.json({ ok: true });
});

// List all logical phones with status + telemetry.
phonesRouter.get('/', (_req, res) => {
  res.json(registry.list());
});
