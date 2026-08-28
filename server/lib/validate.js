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
 * @returns {{ok:boolean, code?:string, error?:string}}
 */
export function validate(rawText, file, checks = []) {
  const fenceCount = (String(rawText).match(/```/g) || []).length;
  if (fenceCount === 0) return { ok: false, error: 'no fenced code block in output' };
  if (fenceCount % 2 !== 0) return { ok: false, error: 'unbalanced code fences' };

  const code = extractFirstFencedBlock(rawText);
  if (!code || !code.trim()) return { ok: false, error: 'empty code block' };
  if (PROSE_MARKERS.test(code.trim())) return { ok: false, error: 'prose inside code block' };

  const syn = syntaxCheck(code, file);
  if (syn) return { ok: false, error: syn };

  for (const c of checks || []) {
    let re;
    try {
      re = new RegExp(c);
    } catch {
      continue; // ignore malformed check regexes
    }
    if (!re.test(code)) return { ok: false, error: `required pattern not found: /${c}/` };
  }

  return { ok: true, code };
}
