# Sisyphus — Architecture (source of truth for interfaces)

Keep this file in sync with the code **in the same turn** as any interface change.

## Component diagram

```
┌────────────────────── Laptop (Windows 11) ─────────────────────┐
│  Claude Code (Opus)                                            │
│   └─ /sisyphus skill ──MCP(stdio)──► Sisyphus MCP server       │
│                                        │ (thin HTTP client)    │
│                                        ▼ HTTP localhost        │
│                            Sisyphus Orchestrator :4100         │
│                            Express + ws + better-sqlite3       │
│                             • phone registry & heartbeats      │
│                             • task engine (queue/dispatch/     │
│                               validate/retry/fallback)         │
│                             • WS event bus (all UI realtime)   │
│                             • serves dashboard + worker view   │
│                             • SQLite: tasks, sessions, stats   │
└───────┬──────────────────────────┬─────────────────────────────┘
        │ Wi-Fi LAN (laptop hotspot at demo)
        ▼                          ▼
  Phone browser              Termux on each phone
  • /            dashboard   • Ollama :11434 (CPU, qwen2.5-coder:3b)
  • /worker/:id  worker view • llama-server :8080 (NPU, Hexagon)
                             • telemetry.sh → heartbeat every 3s
```

## Ports
- Orchestrator: **4100** (HTTP + WebSocket same port, WS path `/ws`).
- Phone CPU (Ollama): **11434**.
- Phone NPU (llama-server): **8080**.
- Mock phones (CPU): **11501, 11502, 11503**. Mock NPU endpoint: **11511**.

## Phone registry

An **endpoint** is one HTTP model server. A **logical phone** groups endpoints by
`name`. One physical phone may register two endpoints (NPU + CPU). Per task, the
orchestrator prefers the NPU endpoint when healthy, else CPU.

### REST
- `POST /api/phones/register`
  body: `{ name, ip, port, model, runtime: "npu"|"cpu", hw? }`
  → `{ phoneId, endpointId }`
  Idempotent by `(name, runtime)`.
- `POST /api/phones/:id/heartbeat`  (`:id` = endpointId)
  body: `{ battery, batteryTempC, cpuLoad, memUsedMB, memTotalMB }`
  Sent by `telemetry.sh` every 3s. Endpoint `online` if heartbeat < 10s old.
- `GET /api/phones` → array of logical phones:
  `{ phoneId, name, status, activeRuntime, endpoints: [{endpointId, runtime, ip, port, model, healthy, status}], telemetry, sessionTotals: {tasksCompleted, tokensIn, tokensOut, avgTokPerSec} }`

### Health check
On register and every ~5s, orchestrator does `GET http://ip:port/api/tags`
(Ollama) or `GET http://ip:port/v1/models` (OpenAI-compatible NPU). Marks the
endpoint `healthy`/`unhealthy`. `status` = `online` requires recent heartbeat AND
a healthy model endpoint.

## Task lifecycle (emit a WS `task_state` on every transition)

```
planned → queued → dispatched → generating → validating → completed
                        ▲                          │
                        └──── retrying ◄───────────┘   (once)
any state → failed → fallback_claude
```
Claude-kept tasks: `planned → claude_working → completed`.

## WebSocket event bus — single channel `/ws`, JSON

Envelope: `{ type, ts, sessionId, payload }`. Types:
- `session_started` — `{ prompt }`
- `session_completed` — `{ summary, stats }`
- `reasoning` — `{ source: "claude"|"sisyphus", text }`
- `plan` — `{ tasks: [{ taskId, title, assign, rationale, file }] }`
  (`assign` = phoneId | `"claude"`)
- `task_state` — `{ taskId, state, phoneId?, runtime?, detail? }`
- `token` — `{ taskId, phoneId, text }` (streamed output chunk)
- `task_result` — `{ taskId, status, runtime, phoneId?, tokensIn, tokensOut, durationMs, tokPerSec, fallback }`
- `phone_update` — `{ phoneId, status, activeRuntime, telemetry, sessionTotals }`

Clients: dashboard subscribes to all; worker view filters by its phoneId. On
connect the server sends a `hello` snapshot: current phones + active session.

## Task engine
- Dispatch: phone tasks fan out **in parallel**, one in-flight task per phone.
  More tasks than phones → FIFO queue per phone, assign to least-loaded first.
- Worker client: one module, two adapters behind a common interface:
  - **Ollama adapter** — `POST /api/chat`, `stream:true`,
    `options:{temperature:0.2, num_ctx:4096, num_predict:1200}`.
    Tokens from final chunk `prompt_eval_count` / `eval_count`.
  - **OpenAI adapter** — `POST /v1/chat/completions`, `stream:true`, same
    sampling (`temperature`, `max_tokens:1200`). Tokens from final `usage`.
  Both relay streamed tokens to the WS bus. 120s hard timeout. The task engine
  is adapter-agnostic.
- Prompt template: `server/prompts/worker.md`.
- Validation pipeline (see §Validation below).
- Session stats persisted in SQLite (see §Schema).

## Validation pipeline
1. Extract the **first** fenced code block.
2. Reject if empty, or prose markers present ("Here is", "Sure,"), or unbalanced fences.
3. Syntax check by extension: `.js/.mjs` → `node --check` (temp file);
   `.json` → `JSON.parse`; `.html/.css` → basic well-formedness heuristics;
   others → skip.
4. Task-specific `checks` (array of regex strings) must all match.
On failure → **one** retry with validator error appended to the prompt.
On second failure → `failed`, return `fallback:true` (Claude does it; attributed
to cloud).

## MCP server (`mcp/`) — stdio, thin HTTP client to :4100
Four tools (stable names/contracts):
1. `sisyphus_status()` → `{ phones:[{name, runtimes, models, healthy}], online }`.
2. `sisyphus_log(text)` → emits `reasoning{source:"claude"}`. → `{ ok }`.
3. `sisyphus_delegate({ tasks:[{title,file,language,spec,checks?}], keep?:[{title,rationale}] })`
   → registers plan, dispatches in parallel, **blocks** until all settle,
   returns `[{ taskId, title, status, code?, tokensOut, phoneName, runtime, fallback }]`.
4. `sisyphus_complete({ summary, filesChanged })` → finalizes stats, emits
   `session_completed`. → `{ stats }`.

MCP → orchestrator HTTP: `POST /api/session/start`, `POST /api/session/log`,
`POST /api/session/delegate` (blocking), `POST /api/session/complete`,
`GET /api/status`.

## `/sisyphus` skill (in demo project `.claude/skills/sisyphus/SKILL.md`)
See §3 of OPUS_BUILD_PROMPT. Flow: status → decompose → log reasoning →
delegate (precise specs) → do kept work → review snippets → integrate →
complete → print summary table. Offload criteria: single self-contained file;
spec < 15 lines; no wider-codebase knowledge beyond pasted signatures; not
security/auth/schema/architecture; low blast radius.

## Dashboard (`web/`) — 4 tabs, mobile-first, dark
Configure · Orchestration · Phone Vitals · History. Built with Vite+React+Tailwind,
`vite build` → served statically by orchestrator at `/`.

## Worker view (`/worker/:phoneId`)
Served by orchestrator. Big name + task title, streaming monospace pane,
telemetry strip, live token counter + tok/s, idle "READY" state. PWA-friendly meta.

## SQLite schema (`server/db/schema.sql`)
- `sessions(id, prompt, started_at, completed_at, summary, stats_json)`
- `tasks(id, session_id, title, file, language, assign, phone_id, runtime,
   state, status, tokens_in, tokens_out, duration_ms, tok_per_sec, fallback,
   code, created_at, updated_at)`
- `phones(id, name, first_seen)` — logical phones (stable id by name)
- `phone_stats(phone_id, session_id, tasks_completed, tokens_in, tokens_out,
   avg_tok_per_sec)`
(Endpoints, live telemetry, heartbeats live in memory, not SQLite.)

## Phone-side kit (`phone/`)
- `setup.sh` — Termux one-liner installs ollama+termux-api, pulls model, serves
  on 0.0.0.0:11434, wake-lock, registers CPU endpoint, launches telemetry.
- `telemetry.sh` — POSIX sh loop, heartbeat every 3s, degrades gracefully.
- Served templated at `/setup.sh` and `/telemetry.sh` (orchestrator IP injected).
- `npu/deploy-npu.ps1`, `npu/start-npu.ps1` — adb deploy of llama.cpp Hexagon
  bundle + model, start llama-server on 0.0.0.0:8080, register NPU endpoint.
