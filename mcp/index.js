#!/usr/bin/env node
// Sisyphus MCP server (stdio). A thin client over HTTP to the orchestrator on
// :4100. Exactly four tools: status, log, delegate, complete. Names/contracts
// are stable — see docs/architecture.md.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const ORCH = process.env.SISYPHUS_ORCH || 'http://127.0.0.1:4100';
const HTTP_TIMEOUT_MS = 150_000; // delegate blocks until all phone tasks settle

async function call(path, { method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
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

// 3) delegate — register plan + dispatch to phones in parallel; BLOCKS until done.
server.registerTool(
  'sisyphus_delegate',
  {
    title: 'Sisyphus: delegate leaf tasks to phones',
    description:
      'Dispatch self-contained, single-file coding tasks to the phone fleet IN PARALLEL and block until all finish. Only delegate work that is: one self-contained file; spec expressible in <15 lines; needs no wider-codebase knowledge beyond signatures you paste; not security/auth/schema/architecture; low blast radius. Provide exact filenames, numbered requirements in `spec`, verbatim `signatures`, and `checks` regexes the output must match. Pass `keep` for tasks you are handling yourself so the plan shows both sides. Returns each task with its status, generated code (review before integrating!), tokens, phone, runtime, and whether it fell back to you.',
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
    const r = await call('/api/session/delegate', { method: 'POST', body: { tasks, keep, prompt } });
    if (r.error) return text(`delegate failed: ${r.error}\nProceed to do these tasks yourself.`);
    const summary = r.results
      .map(
        (t) =>
          `• ${t.title} [${t.file}] → ${t.status}${t.fallback ? ' (FELL BACK — do this yourself)' : ` on ${t.phoneName}/${t.runtime}, ${t.tokensOut} tok`}`
      )
      .join('\n');
    return text(
      `Delegation complete.\n${summary}\n\nFull results (review the code before integrating):\n` +
        JSON.stringify(r.results, null, 2)
    );
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
