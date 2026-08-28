// Builds the deterministic worker prompt (system + user) from a task spec.
import fs from 'node:fs';
import path from 'node:path';

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, 'worker.md'), 'utf8').trim();

/**
 * @param {{title, file, language, spec, checks?, signatures?, allowImports?}} task
 * @param {string} [validatorError] appended on a retry so the model can self-correct
 */
export function buildWorkerPrompt(task, validatorError) {
  const lines = [];
  lines.push(`Target filename: ${task.file}`);
  if (task.language) lines.push(`Language: ${task.language}`);
  lines.push('');
  lines.push('Requirements:');
  const reqs = String(task.spec || task.title || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  reqs.forEach((r, i) => lines.push(`${i + 1}. ${r.replace(/^\d+[.)]\s*/, '')}`));
  if (task.signatures) {
    lines.push('');
    lines.push('It must match these interfaces exactly:');
    lines.push(task.signatures);
  }
  lines.push('');
  lines.push(
    task.allowImports
      ? `Do not import anything beyond: ${task.allowImports}.`
      : 'Do not import anything beyond the language standard library.'
  );
  lines.push('Output the complete file as a single fenced code block.');

  if (validatorError) {
    lines.push('');
    lines.push(`Your previous attempt was rejected: ${validatorError}`);
    lines.push('Fix it and output the corrected complete file.');
  }

  return { system: SYSTEM, user: lines.join('\n') };
}
