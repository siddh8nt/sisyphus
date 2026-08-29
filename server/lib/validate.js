// Validation pipeline: extract the fenced block, reject prose/empty, syntax-check
// by extension, then run task-specific `checks` regexes. Returns {ok, code?, error?}.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PROSE_MARKERS = /^(here is|here's|sure|certainly|of course|below is|this is)\b/i;

export function extractFirstFencedBlock(text) {
  const m = String(text).match(/```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)```/);
  return m ? m[1].replace(/\s+$/, '') : null;
}

function ext(file) {
  return path.extname(String(file || '')).toLowerCase();
}

function syntaxCheck(code, file) {
  const e = ext(file);
  if (e === '.js' || e === '.mjs' || e === '.cjs') {
    const tmp = path.join(os.tmpdir(), `sisyphus-${Date.now()}-${Math.random().toString(36).slice(2)}${e === '.cjs' ? '.cjs' : '.mjs'}`);
    try {
      fs.writeFileSync(tmp, code);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
      if (r.status !== 0) return `JS syntax error: ${(r.stderr || '').split('\n').find((l) => l.includes('Error')) || 'node --check failed'}`;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    return null;
  }
  if (e === '.json') {
    try {
      JSON.parse(code);
    } catch (err) {
      return `JSON parse error: ${err.message}`;
    }
    return null;
  }
  if (e === '.css') {
    const open = (code.match(/{/g) || []).length;
    const close = (code.match(/}/g) || []).length;
    if (open !== close) return `CSS looks malformed: ${open} '{' vs ${close} '}'`;
    return null;
  }
  if (e === '.html' || e === '.htm') {
    const lt = (code.match(/</g) || []).length;
    const gt = (code.match(/>/g) || []).length;
    if (lt === 0 || lt !== gt) return `HTML looks malformed: ${lt} '<' vs ${gt} '>'`;
    return null;
  }
  return null; // unknown extension: skip syntax check
}

/**
 * @param {string} rawText  full model response
 * @param {string} file     target filename (drives syntax check)
 * @param {string[]} [checks] regex strings that must all match
 * @returns {{ok:boolean, code?:string, error?:string, checks:Array<{kind:string,name:string,ok:boolean,detail?:string}>}}
 *   `checks` is the per-check log the deterministic gate shows in the worker
 *   view: one row per structural/syntax/regex check, pass or fail.
 */
export function validate(rawText, file, checks = []) {
  const rows = [];
  const fail = (error) => ({ ok: false, error, checks: rows });

  const fenceCount = (String(rawText).match(/```/g) || []).length;
  let structureError = null;
  if (fenceCount === 0) structureError = 'no fenced code block in output';
  else if (fenceCount % 2 !== 0) structureError = 'unbalanced code fences';

  const code = structureError ? null : extractFirstFencedBlock(rawText);
  if (!structureError && (!code || !code.trim())) structureError = 'empty code block';
  if (!structureError && PROSE_MARKERS.test(code.trim())) structureError = 'prose inside code block';

  rows.push({ kind: 'structure', name: 'single fenced code block', ok: !structureError, detail: structureError || undefined });
  if (structureError) return fail(structureError);

  const syn = syntaxCheck(code, file);
  rows.push({ kind: 'syntax', name: `syntax (${path.extname(String(file || '')) || 'unknown'})`, ok: !syn, detail: syn || undefined });

  for (const c of checks || []) {
    let re;
    try {
      re = new RegExp(c);
    } catch {
      continue; // ignore malformed check regexes
    }
    rows.push({
      kind: 'regex',
      name: `pattern /${c}/`,
      ok: re.test(code),
      detail: re.test(code) ? undefined : 'required pattern not found',
    });
  }

  const firstFail = rows.find((r) => !r.ok);
  if (firstFail) return { ok: false, error: firstFail.detail ? `${firstFail.name}: ${firstFail.detail}` : firstFail.name, code, checks: rows };
  return { ok: true, code, checks: rows };
}
