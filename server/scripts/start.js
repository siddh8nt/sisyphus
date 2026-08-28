// `npm start` entry. Builds the dashboard only if there's web source and no
// dist/ yet; otherwise starts the orchestrator immediately. Always ends by
// running the server, so `npm start` works in every phase.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WEB_DIST } from '../config.js';
import { log } from '../lib/log.js';
import { startServer } from '../index.js';

const webDir = path.join(import.meta.dirname, '..', '..', 'web');
const webEntry = path.join(webDir, 'index.html');
const distIndex = path.join(WEB_DIST, 'index.html');

if (!fs.existsSync(distIndex) && fs.existsSync(webEntry)) {
  log.info('dashboard not built — running `vite build` once...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['--workspace', 'web', 'run', 'build'], {
    cwd: path.join(import.meta.dirname, '..', '..'),
    stdio: 'inherit',
  });
  if (r.status !== 0) log.warn('web build failed — starting server without dashboard');
}

startServer();
