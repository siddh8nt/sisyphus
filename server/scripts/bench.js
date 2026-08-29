// Controlled NPU-vs-CPU benchmark: same phone, same prompt, same sampling
// params, run back-to-back (sequential, so neither runtime steals the
// other's CPU/NPU cycles). Prints tok/s, time-to-first-token, and the
// speedup ratio — this is the pitch stat, not a demo-time script.
//   node server/scripts/bench.js <phoneName> [--host http://127.0.0.1:4100]
import { generate } from '../lib/worker-client.js';
import { buildWorkerPrompt } from '../prompts/build.js';

const name = process.argv[2];
if (!name) {
  console.error('usage: node server/scripts/bench.js <phoneName> [--host http://127.0.0.1:4100]');
  process.exit(1);
}
const hostFlagIdx = process.argv.indexOf('--host');
const host = hostFlagIdx >= 0 ? process.argv[hostFlagIdx + 1] : 'http://127.0.0.1:4100';

const task = {
  title: 'debounce utility',
  file: 'debounce.js',
  language: 'javascript',
  spec: [
    'Write a function debounce(fn, waitMs) that returns a debounced version of fn.',
    'Calling the debounced function repeatedly should only invoke fn once, after',
    'waitMs of inactivity. The debounced function should forward all arguments',
    'and preserve `this`.',
    'Export it with module.exports = { debounce };',
  ].join('\n'),
  checks: ['module.exports'],
};
const { system, user } = buildWorkerPrompt(task);

async function run(endpoint) {
  let firstTokenAt = null;
  const started = Date.now();
  const out = await generate({
    endpoint,
    system,
    user,
    onToken: () => {
      if (firstTokenAt === null) firstTokenAt = Date.now();
    },
  });
  const ttftMs = firstTokenAt ? firstTokenAt - started : null;
  const tokPerSec = out.durationMs > 0 ? +(out.tokensOut / (out.durationMs / 1000)).toFixed(2) : 0;
  return { ...out, ttftMs, tokPerSec };
}

async function main() {
  const res = await fetch(`${host}/api/phones`);
  const phones = await res.json();
  const phone = phones.find((p) => p.name === name);
  if (!phone) {
    console.error(`phone "${name}" not found. Known: ${phones.map((p) => p.name).join(', ')}`);
    process.exit(1);
  }
  const npu = phone.endpoints.find((e) => e.runtime === 'npu' && e.healthy);
  const cpu = phone.endpoints.find((e) => e.runtime === 'cpu' && e.healthy);
  if (!npu || !cpu) {
    console.error(`${name} needs BOTH endpoints healthy for a fair bench (npu=${!!npu} cpu=${!!cpu})`);
    process.exit(1);
  }

  console.log(`Benchmarking ${name} — identical prompt, sequential runs\n`);

  console.log('Running on NPU (Hexagon)...');
  const npuResult = await run(npu);
  console.log(
    `  NPU: ${npuResult.tokensOut} tok out, ${npuResult.durationMs}ms total, ` +
      `ttft=${npuResult.ttftMs}ms, ${npuResult.tokPerSec} tok/s`
  );

  console.log('Running on CPU (Ollama)...');
  const cpuResult = await run(cpu);
  console.log(
    `  CPU: ${cpuResult.tokensOut} tok out, ${cpuResult.durationMs}ms total, ` +
      `ttft=${cpuResult.ttftMs}ms, ${cpuResult.tokPerSec} tok/s`
  );

  const speedup = cpuResult.tokPerSec > 0 ? +(npuResult.tokPerSec / cpuResult.tokPerSec).toFixed(2) : null;
  console.log(`\nNPU is ${speedup}x the decode speed of CPU on ${name} (same prompt, same sampling).`);
}

main().catch((e) => {
  console.error('bench failed:', e.message);
  process.exit(1);
});
