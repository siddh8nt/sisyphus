// Baked-in test runner: the deterministic half of the gate that replaces
// "Claude reads every snippet". Each delegated task may carry `tests`
// [{name, code}] authored by Claude at delegation time; `code` is the body of
// an async function (mod, assert) run against the generated module. The whole
// harness runs in a throwaway child Node process inside a temp dir — a hung or
// crashing generated module cannot take the hub down, and a timeout kills it.
// Only JS targets are executed; other extensions report a skipped row so the
// gate log stays honest about what actually ran.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TEST_RUN_TIMEOUT_MS, PER_TEST_TIMEOUT_MS } from '../config.js';

const RESULT_MARKER = '__SISYPHUS_TESTS__';
const JS_EXTS = new Set(['.js', '.mjs', '.cjs']);

const looksCjs = (code) =>
  /\b(module\.exports|exports\.[\w$]+\s*=|require\s*\()/.test(code) && !/^\s*(export|import)\s/m.test(code);

function harnessSource() {
  // Kept as a template so the harness ships zero deps and reads its inputs
  // from tests.json next to it. AsyncFunction lets test bodies use await.
  return `import assert from 'node:assert/strict';
import fs from 'node:fs';
const { modFile, tests, perTestTimeoutMs } = JSON.parse(fs.readFileSync(new URL('./tests.json', import.meta.url), 'utf8'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const results = [];
let mod = null;
let importError = null;
try {
  mod = await import(new URL('./' + modFile, import.meta.url).href);
  if (mod && mod.default != null && typeof mod.default === 'object') mod = { ...mod.default, ...mod };
} catch (e) {
  importError = String((e && e.stack) || e).split('\\n').slice(0, 4).join(' | ');
}
for (const t of tests) {
  if (importError) {
    results.push({ name: t.name, ok: false, detail: 'module failed to load: ' + importError });
    continue;
  }
  const started = Date.now();
  try {
    const fn = new AsyncFunction('mod', 'assert', t.code);
    await Promise.race([
      fn(mod, assert),
      new Promise((_, rej) => setTimeout(() => rej(new Error('test timed out (' + perTestTimeoutMs + 'ms)')), perTestTimeoutMs)),
    ]);
    results.push({ name: t.name, ok: true, durationMs: Date.now() - started });
  } catch (e) {
    results.push({
      name: t.name,
      ok: false,
      detail: String((e && e.message) || e).slice(0, 500),
      durationMs: Date.now() - started,
    });
  }
}
console.log('${RESULT_MARKER}' + JSON.stringify(results));
`;
}

/**
 * Run a task's baked-in tests against generated code.
 * @param {string} code   generated file contents (already fence-extracted)
 * @param {string} file   target filename (extension decides runnability)
 * @param {Array<{name:string, code:string}>} tests
 * @returns {Promise<{passed:boolean, results:Array<{kind:'test',name:string,ok:boolean,detail?:string,durationMs?:number}>}>}
 */
export async function runTests(code, file, tests) {
  const list = (tests || []).filter((t) => t && t.name && t.code);
  if (list.length === 0) return { passed: true, results: [] };

  const ext = path.extname(String(file || '')).toLowerCase();
  if (!JS_EXTS.has(ext)) {
    return {
      passed: true,
      results: list.map((t) => ({
        kind: 'test',
        name: t.name,
        ok: true,
        detail: 'skipped — unit tests only execute for JS targets',
      })),
    };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sisyphus-gate-'));
  try {
    // .mjs/.cjs sidestep package-type ambiguity: the generated code is written
    // under the module system it was actually authored in.
    const modFile = ext === '.cjs' || looksCjs(code) ? 'mod.cjs' : 'mod.mjs';
    fs.writeFileSync(path.join(dir, modFile), code);
    fs.writeFileSync(
      path.join(dir, 'tests.json'),
      JSON.stringify({ modFile, tests: list, perTestTimeoutMs: PER_TEST_TIMEOUT_MS })
    );
    fs.writeFileSync(path.join(dir, 'harness.mjs'), harnessSource());

    const { stdout, stderr, timedOut } = await runChild(dir);
    const line = stdout.split('\n').find((l) => l.startsWith(RESULT_MARKER));
    if (line) {
      const results = JSON.parse(line.slice(RESULT_MARKER.length)).map((r) => ({ kind: 'test', ...r }));
      return { passed: results.every((r) => r.ok), results };
    }
    const why = timedOut
      ? `test harness timed out (${TEST_RUN_TIMEOUT_MS}ms)`
      : `test harness crashed: ${(stderr || stdout || 'no output').trim().split('\n').slice(-3).join(' | ').slice(0, 500)}`;
    return { passed: false, results: list.map((t) => ({ kind: 'test', name: t.name, ok: false, detail: why })) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runChild(dir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(dir, 'harness.mjs')], { cwd: dir });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, TEST_RUN_TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(killer);
      resolve({ stdout, stderr: stderr + '\n' + e.message, timedOut });
    });
    child.on('close', () => {
      clearTimeout(killer);
      resolve({ stdout, stderr, timedOut });
    });
  });
}
