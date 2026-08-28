// Serves the Termux phone scripts with the orchestrator base URL templated in,
// and normalized to LF so they run under Termux even if edited on Windows.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { PORT } from '../config.js';
import { lanIp } from '../lib/netip.js';

const PHONE_DIR = path.join(import.meta.dirname, '..', '..', 'phone');

function serveScript(file) {
  return (_req, res) => {
    let src;
    try {
      src = fs.readFileSync(path.join(PHONE_DIR, file), 'utf8');
    } catch {
      return res.status(404).type('text/plain').send(`# ${file} not found`);
    }
    const base = `http://${lanIp()}:${PORT}`;
    const out = src.replace(/__ORCH_BASE__/g, base).replace(/\r\n/g, '\n');
    res.type('text/plain; charset=utf-8').send(out);
  };
}

export const scriptsRouter = express.Router();
scriptsRouter.get('/setup.sh', serveScript('setup.sh'));
scriptsRouter.get('/telemetry.sh', serveScript('telemetry.sh'));
