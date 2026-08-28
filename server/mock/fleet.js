// Starts a fleet of 3 mock phones (CPU on 11501-11503). One of them ("mock-1")
// ALSO exposes a mock NPU (OpenAI-compatible) endpoint on 11511, so NPU
// preference, runtime badges, and NPU->CPU fallback are all testable long
// before real Hexagon bring-up. `npm run mock-fleet`.
import { startMockPhone } from './phone.js';

const proxy = process.argv.includes('--proxy')
  ? process.argv[process.argv.indexOf('--proxy') + 1]
  : null;

const CPU = [
  { name: 'mock-1', port: 11501 },
  { name: 'mock-2', port: 11502 },
  { name: 'mock-3', port: 11503 },
];

console.log(`\nSisyphus mock fleet — 3 phones${proxy ? ` (proxy -> ${proxy})` : ' (canned mode)'}`);

const started = [];
for (const p of CPU) {
  started.push(await startMockPhone({ ...p, runtime: 'cpu', proxy }));
}
// mock-1 gets a second, NPU endpoint (same logical phone, grouped by name).
started.push(await startMockPhone({ name: 'mock-1', port: 11511, runtime: 'npu' }));

console.log(`\nFleet up: ${started.length} endpoints. Ctrl+C to stop.\n`);

process.on('SIGINT', () => {
  console.log('\nstopping mock fleet');
  for (const s of started) s.server.close();
  process.exit(0);
});
