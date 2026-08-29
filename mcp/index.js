#!/usr/bin/env node
// Sisyphus MCP server (stdio). A thin client over HTTP to the orchestrator on
// :4100. Six tools: status, log, delegate, apply, fetch, complete. Names and
// contracts are stable — see docs/architecture.md.
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const ORCH = process.env.SISYPHUS_ORCH || 'http://127.0.0.1:4100';
const HTTP_TIMEOUT_MS = 150_000;
// delegate blocks through operator approval on the dashboard (≤120s) AND all
// phone generation+gate runs — give it much more headroom than the other calls.
const DELEGATE_TIMEOUT_MS = 600_000;

async function call(path, { method = 'GET', body, timeoutMs = HTTP_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ORCH + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` };
    return json;
  } catch (e) {
    return { error: `orchestrator unreachable at ${ORCH} (${e.message})` };
  } finally {
    clearTimeout(timer);
  }
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });

const server = new McpServer({ name: 'sisyphus', version: '0.1.0' });

// 1) status — Claude calls this first.
server.registerTool(
  'sisyphus_status',
  {
    title: 'Sisyphus: fleet status',
    description:
      'List the phones connected to the Sisyphus edge-compute fleet, their models, active runtime (NPU/CPU), and health. Call this FIRST. If no phones are online, proceed with the task normally without delegating.',
    inputSchema: {},
  },
  async () => {
    const s = await call('/api/status');
    if (s.error) return text(`Sisyphus orchestrator not reachable — proceed without offloading.\n(${s.error})`);
    if (!s.phones?.length) return text('No phones registered. Proceed with the task yourself (no offloading available).');
    const lines = s.phones.map(
      (p) =>
        `- ${p.name}: ${p.status}, runtime=${p.activeRuntime || 'none'}, models=[${(p.models || []).join(', ')}], healthy=${p.healthy}`
    );
    return text(`${s.online} phone(s) online of ${s.phones.length}:\n${lines.join('\n')}`);
  }
);

// 2) log — narrate real decomposition reasoning into the Orchestration feed.
server.registerTool(
  'sisyphus_log',
  {
    title: 'Sisyphus: narrate reasoning',
    description:
      'Emit ONE short, genuine reasoning line into the live Orchestration feed (what you observed, what you are offloading and why, what you are keeping and why). On your FIRST call this session, also pass `prompt` = the original user request so the session is labeled correctly.',
    inputSchema: {
      text: z.string().describe('One concise reasoning line.'),
      prompt: z.string().optional().describe("The user's original request (pass on the first call only)."),
    },
  },
  async ({ text: t, prompt }) => {
    const r = await call('/api/session/log', { method: 'POST', body: { text: t, source: 'claude', prompt } });
    return text(r.error ? `(log failed: ${r.error})` : 'logged');
  }
);

// 3) delegate — register plan, wait for operator approval on the dashboard,
// dispatch to phones in parallel, gate every output; BLOCKS until done.
server.registerTool(
  'sisyphus_delegate',
  {
    title: 'Sisyphus: delegate leaf tasks to phones',
    description:
      'Dispatch self-contained, single-file coding tasks to the phone fleet IN PARALLEL. The routing plan first appears on the orchestration dashboard for HUMAN APPROVAL (phone/task/model/ETA/confidence table; the operator may toggle tasks over to you) — the call blocks through approval and generation, so it can take minutes; do not abort it. Only delegate work that is: one self-contained file; spec expressible in <15 lines; needs no wider-codebase knowledge beyond signatures you paste; not security/auth/schema/architecture; low blast radius. Provide exact filenames, numbered requirements in `spec`, verbatim `signatures`, `checks` regexes, and for JS files 1-4 baked-in `tests` the hub executes against the generated module. Every output runs through a deterministic gate (structure, syntax, regex checks, your unit tests) ON THE HUB. Results include code ONLY for tasks whose gate failed or that came back to you — do NOT ask for gate-passed code; write it to disk with sisyphus_apply instead.',
    inputSchema: {
      tasks: z
        .array(
          z.object({
            title: z.string(),
            file: z.string().describe('Target filename, e.g. src/utils/formatDate.js'),
            language: z.string().optional(),
            spec: z.string().describe('Numbered requirements, newline-separated.'),
            signatures: z.string().optional().describe('Exact interface the file must match, verbatim.'),
            allowImports: z.string().optional().describe('Comma list of allowed imports, or omit for stdlib-only.'),
            checks: z.array(z.string()).optional().describe('Regex strings the generated code must all match.'),
            tests: z
              .array(z.object({ name: z.string(), code: z.string() }))
              .optional()
              .describe(
                'Baked-in unit tests the hub runs against the generated module (JS targets only). `code` is the body of `async (mod, assert)`: `mod` is the imported module, `assert` is node:assert/strict. Deterministic, pure, no fs/network. e.g. "assert.equal(mod.formatDate(new Date(0)), \'1970-01-01\')"'
              ),
            estTokens: z.number().optional().describe('Your estimate of output size in tokens (drives the ETA shown to the operator).'),
            confidence: z
              .number()
              .min(0)
              .max(100)
              .optional()
              .describe('Your calibrated 0-100 confidence that a 3B local model completes this correctly.'),
          })
        )
        .describe('Leaf tasks for the phones.'),
      keep: z
        .array(z.object({ title: z.string(), rationale: z.string(), file: z.string().optional() }))
        .optional()
        .describe('Tasks you are keeping for yourself (shown on the plan/scoreboard).'),
      prompt: z.string().optional().describe("The user's original request (if not already logged)."),
    },
  },
  async ({ tasks, keep, prompt }) => {
    const r = await call('/api/session/delegate', {
      method: 'POST',
      body: { tasks, keep, prompt },
      timeoutMs: DELEGATE_TIMEOUT_MS,
    });
    if (r.error) return text(`delegate failed: ${r.error}\nProceed to do these tasks yourself.`);

    const gateLabel = (t) =>
      t.gate ? `gate ${t.gate.passed ? 'PASSED' : 'FAILED'} (${t.gate.checksPassed}/${t.gate.checksTotal})` : 'no gate data';
    const summary = r.results
      .map((t) => {
        if (t.reassigned) return `• ${t.title} [${t.file}] → REASSIGNED to you by the operator — implement it yourself`;
        if (t.fallback) return `• ${t.title} [${t.file}] → FELL BACK (${gateLabel(t)}) — code of the last attempt included below if salvageable`;
        return `• ${t.title} [${t.file}] → ${t.status} on ${t.phoneName}/${t.runtime} · ${gateLabel(t)} · ${t.tokensOut} tok (code withheld — use sisyphus_apply)`;
      })
      .join('\n');

    // Token efficiency: full JSON only for tasks Claude must actually read
    // (gate-failed / fallback / reassigned). Gate-passed tasks stay summaries.
    const needsAttention = r.results.filter((t) => t.fallback || (t.gate && !t.gate.passed));
    const tail =
      needsAttention.length > 0
        ? `\n\nTasks needing your attention (failing gate checks + last code attempt):\n${JSON.stringify(needsAttention, null, 2)}`
        : '';
    return text(
      `Delegation complete (routing was approved on the dashboard).\n${summary}\n\n` +
        `Next: call sisyphus_apply to write all gate-passed files to disk WITHOUT loading their code; ` +
        `implement reassigned/fallback tasks yourself.${tail}`
    );
  }
);

// 3b) apply — write gate-passed outputs to disk without them ever entering
// Claude's context. cwd is the demo project root (set by .mcp.json launch).
server.registerTool(
  'sisyphus_apply',
  {
    title: 'Sisyphus: apply gate-passed code to disk',
    description:
      "Write the gate-passed, completed tasks' generated files into the project (relative to the project root) WITHOUT returning their contents — this is the token-efficient integration path. Call it after sisyphus_delegate. Pass taskIds to apply a subset; omit to apply every gate-passed task. Never applies gate-failed, fallback, or reassigned tasks.",
    inputSchema: {
      taskIds: z.array(z.string()).optional().describe('Subset of taskIds to apply; omit for all gate-passed tasks.'),
    },
  },
  async ({ taskIds }) => {
    const r = await call('/api/session/tasks');
    if (r.error) return text(`apply failed: ${r.error}`);
    const wanted = taskIds ? new Set(taskIds) : null;
    const root = process.cwd();
    const written = [];
    const skipped = [];
    for (const t of r.tasks || []) {
      if (wanted && !wanted.has(t.taskId)) continue;
      const ok = t.status === 'completed' && !t.fallback && t.gate?.passed && t.code;
      if (!ok) {
        if (!wanted || wanted.has(t.taskId)) skipped.push(`${t.file || t.taskId} (${t.status}${t.gate && !t.gate.passed ? ', gate failed' : ''})`);
        continue;
      }
      const target = path.resolve(root, t.file);
      if (!target.startsWith(root + path.sep) && target !== root) {
        skipped.push(`${t.file} (path escapes project root — refused)`);
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const content = t.code.endsWith('\n') ? t.code : t.code + '\n';
      fs.writeFileSync(target, content);
      written.push(`${t.file} (${Buffer.byteLength(content)} bytes, ${t.phoneName}/${t.runtime})`);
    }
    if (written.length === 0 && skipped.length === 0) return text('Nothing to apply — no matching tasks.');
    return text(
      `Applied ${written.length} file(s):\n${written.map((w) => '  ' + w).join('\n') || '  (none)'}` +
        (skipped.length ? `\nSkipped (not gate-passed):\n${skipped.map((s) => '  ' + s).join('\n')}` : '')
    );
  }
);

// 3c) fetch — pull ONE task's code + full gate/test log into context, on demand.
server.registerTool(
  'sisyphus_fetch',
  {
    title: 'Sisyphus: fetch one task (code + gate log)',
    description:
      "Fetch a single task's generated code and its full deterministic-gate log (every check and unit-test result with details). Use ONLY when you genuinely need to inspect a snippet — a failed gate you want to debug, or a gate-passed file the user asked you to review. Do not fetch every task; that defeats the token-efficiency design.",
    inputSchema: { taskId: z.string() },
  },
  async ({ taskId }) => {
    const r = await call('/api/session/tasks');
    if (r.error) return text(`fetch failed: ${r.error}`);
    const t = (r.tasks || []).find((x) => x.taskId === taskId);
    if (!t) return text(`no task ${taskId} in the current/most-recent session`);
    return text(JSON.stringify(t, null, 2));
  }
);

// 4) complete — finalize stats + emit session_completed.
server.registerTool(
  'sisyphus_complete',
  {
    title: 'Sisyphus: complete session',
    description:
      'Close the Sisyphus session after you have integrated all results. Finalizes stats and updates the dashboard. Returns the session stats (on-device vs cloud, NPU-accelerated count, cloud tokens saved, wall-clock).',
    inputSchema: {
      summary: z.string().describe('One-line summary of what was built.'),
      filesChanged: z.array(z.string()).optional(),
    },
  },
  async ({ summary, filesChanged }) => {
    const r = await call('/api/session/complete', { method: 'POST', body: { summary, filesChanged } });
    if (r.error) return text(`complete failed: ${r.error}`);
    return text(`Session closed.\n${JSON.stringify(r.stats, null, 2)}`);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('sisyphus-mcp connected (orchestrator ' + ORCH + ')');
