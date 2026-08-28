// One worker client, two adapters behind a common interface. The task engine
// does not care which adapter a phone endpoint uses.
//   - Ollama   (runtime "cpu"): POST /api/chat, NDJSON stream
//   - OpenAI   (runtime "npu"): POST /v1/chat/completions, SSE stream
// Streamed tokens are relayed via onToken. 120s hard timeout.
import { MODEL_CALL_TIMEOUT_MS, WORKER_SAMPLING } from '../config.js';

/**
 * @param {object} p
 * @param {{runtime, ip, port, model}} p.endpoint
 * @param {string} p.system
 * @param {string} p.user
 * @param {(text:string)=>void} [p.onToken]
 * @returns {Promise<{text, tokensIn, tokensOut, durationMs}>}
 */
export async function generate({ endpoint, system, user, onToken = () => {} }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODEL_CALL_TIMEOUT_MS);
  const started = Date.now();
  try {
    const run = endpoint.runtime === 'npu' ? runOpenAI : runOllama;
    const out = await run(endpoint, system, user, onToken, ctrl.signal);
    return { ...out, durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

// --- shared line-buffered stream reader ----------------------------------
async function* readLines(res) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      yield line;
    }
  }
  if (buf.length) yield buf;
}

// --- Ollama adapter (NDJSON) ---------------------------------------------
async function runOllama(endpoint, system, user, onToken, signal) {
  const res = await fetch(`http://${endpoint.ip}:${endpoint.port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: endpoint.model || undefined,
      stream: true,
      options: WORKER_SAMPLING,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  let text = '';
  let tokensIn = 0;
  let tokensOut = 0;
  for await (const line of readLines(res)) {
    const s = line.trim();
    if (!s) continue;
    let obj;
    try {
      obj = JSON.parse(s);
    } catch {
      continue;
    }
    const chunk = obj.message?.content || '';
    if (chunk) {
      text += chunk;
      onToken(chunk);
    }
    if (obj.done) {
      tokensIn = obj.prompt_eval_count || 0;
      tokensOut = obj.eval_count || 0;
    }
  }
  return { text, tokensIn, tokensOut };
}

// --- OpenAI-compatible adapter (SSE) -------------------------------------
async function runOpenAI(endpoint, system, user, onToken, signal) {
  const res = await fetch(`http://${endpoint.ip}:${endpoint.port}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: endpoint.model || 'local',
      stream: true,
      stream_options: { include_usage: true },
      temperature: WORKER_SAMPLING.temperature,
      max_tokens: WORKER_SAMPLING.num_predict,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  let text = '';
  let tokensIn = 0;
  let tokensOut = 0;
  for await (const line of readLines(res)) {
    const s = line.trim();
    if (!s.startsWith('data:')) continue;
    const data = s.slice(5).trim();
    if (data === '[DONE]') break;
    let obj;
    try {
      obj = JSON.parse(data);
    } catch {
      continue;
    }
    const chunk = obj.choices?.[0]?.delta?.content || '';
    if (chunk) {
      text += chunk;
      onToken(chunk);
    }
    if (obj.usage) {
      tokensIn = obj.usage.prompt_tokens || 0;
      tokensOut = obj.usage.completion_tokens || 0;
    }
  }
  // Fallback token estimate if the server omitted usage.
  if (!tokensOut) tokensOut = Math.round(text.length / 4);
  return { text, tokensIn, tokensOut };
}
