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
- `POST /api/phones/:id/heartbeat`  (`:id` = **phoneId** — telemetry is a
  physical-phone property; `setup.sh` gets the phoneId from register)
  body: `{ battery, batteryTempC, cpuLoad, memUsedMB, memTotalMB }`
  Sent by `telemetry.sh` every 3s. Logical phone `online` if heartbeat < 10s old.
  Which runtime is usable is decided by per-endpoint health checks, not heartbeats.
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
- `task_result` — `{ taskId, status, runtime, phoneId?, tokensIn, tokensOut, durationMs, tokPerSec, fallback, savedUsd, savedInr }`
  (`savedUsd`/`savedInr` = cloud cost avoided by this task; 0 unless gate-passed on-device — see §Cloud-savings metric)
- `phone_update` — the **full serialized logical phone** (superset of
  `{ phoneId, name, status, activeRuntime, endpoints[], telemetry, sessionTotals }`).
  Emitted on register, heartbeat, health change, and status flip.

Clients: dashboard subscribes to all; worker view filters by its phoneId. On
connect the server sends a `hello` snapshot: current phones + active session +
`pricing` (the `CLOUD_PRICING` object, so any UI can live-derive ₹ saved).

## Cloud-savings metric (deliberately conservative — a floor, not a stretch)
Every **output token of a gate-passed on-device task** is a token the cloud
agent would otherwise have had to *generate* itself, so it is billed at the
cloud **output** rate only: `savedUsd = tokensOut × outputUsdPerMTok / 1e6`,
`savedInr = savedUsd × usdToInr`. Real-but-excluded savings (so the number is
defensible): input-side costs (specs, context re-reads) and the fact that
applied code never re-enters Claude's context as input tokens on later turns.
Rates live in `server/config.js` `CLOUD_PRICING` (env-overridable:
`SISYPHUS_CLOUD_MODEL`, `SISYPHUS_USD_PER_MTOK_OUT`, `SISYPHUS_USD_INR`);
as of 2026-08-30: claude-opus-5 output $25/MTok, $1 = ₹95.4. Per-task fields
ride `task_result` + the hello snapshot; session totals (`cloudCostSavedUSD`,
`cloudCostSavedINR`, `pricing`) land in `session_completed` stats. UI: a gold
"CLOUD SPEND AVOIDED" banner (₹ + $ + tokens + a fun-fact line, ladder in
`web/src/lib/cost.js`) pops onto the top of the Orchestration tab on the first
rupee; each task card and the worker view show `₹ saved` beside tok/s.

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

## Deterministic gate (validation + baked-in tests)
Replaces "Claude reads and reviews every snippet": the hub certifies outputs
mechanically, and Claude only pulls a snippet into context when the gate fails.
1. Extract the **first** fenced code block.
2. Reject if empty, or prose markers present ("Here is", "Sure,"), or unbalanced fences.
3. Syntax check by extension: `.js/.mjs` → `node --check` (temp file);
   `.json` → `JSON.parse`; `.html/.css` → basic well-formedness heuristics;
   others → skip.
4. Task-specific `checks` (array of regex strings) must all match.
5. Task-specific `tests` (baked in by Claude at delegation time,
   `[{name, code}]`, JS targets only): `server/lib/test-runner.js` writes the
   generated module + a harness to a temp dir and runs them in a **child Node
   process** (20s overall / 5s per test). Each test body is
   `async (mod, assert)` — `mod` = imported module, `assert` = node:assert/strict.
Every check emits a row `{kind: structure|syntax|regex|test, name, ok, detail?,
durationMs?}`; the full log goes out as WS `task_gate`, persists to
`tasks.gate_json`, and renders on the worker view (web + kiosk app).
On failure → **one** retry with the failing checks appended to the prompt.
On second failure → `failed`, return `fallback:true` with the last code attempt
(Claude does it; attributed to cloud).

## Routing approval (dashboard human-in-the-loop)
`delegate` assigns tasks least-loaded, then emits `approval_pending` with the
routing table `[{taskId, title, file, phoneName, model, runtime, etaSec,
confidence, estTokens, tests}]` and **blocks** until
`POST /api/session/approve {overrides}` from the Orchestration tab (or
auto-approves after 120s so headless runs never deadlock). `overrides` maps
taskId → `'claude'` for rows the operator toggled; those tasks are marked
`reassigned` (`fallback:true`) and returned to Claude without dispatching.
ETA = `estTokens / tok-per-sec` (session-observed per phone, else per-runtime
defaults) + fixed overhead. The pending table also rides the WS `hello`
snapshot so a dashboard opened mid-wait still shows it.

## MCP server (`mcp/`) — stdio, thin HTTP client to :4100
Six tools (stable names/contracts):
1. `sisyphus_status()` → `{ phones:[{name, runtimes, models, healthy}], online }`.
2. `sisyphus_log(text)` → emits `reasoning{source:"claude"}`. → `{ ok }`.
3. `sisyphus_delegate({ tasks:[{title,file,language,spec,checks?,tests?,estTokens?,confidence?}], keep?:[{title,rationale}] })`
   → registers plan, waits for operator approval, dispatches in parallel,
   **blocks** until all settle, returns
   `[{ taskId, title, status, gate, tokensOut, phoneName, runtime, fallback, reassigned? , code? }]`
   — `code` present **only** for gate-failed / fallback / reassigned tasks.
4. `sisyphus_apply({ taskIds? })` → writes gate-passed tasks' files into the
   project (cwd of the MCP process) without returning contents. Path-traversal
   guarded.
5. `sisyphus_fetch({ taskId })` → one task's full code + gate/test log, for
   deliberate inspection only.
6. `sisyphus_complete({ summary, filesChanged })` → finalizes stats, emits
   `session_completed`. → `{ stats }`.

MCP → orchestrator HTTP: `POST /api/session/start`, `POST /api/session/log`,
`POST /api/session/delegate` (blocking), `POST /api/session/approve`,
`GET /api/session/tasks`, `POST /api/session/complete`, `GET /api/status`.

## `/sisyphus` skill (repo root `.claude/skills/sisyphus/SKILL.md`, paired with root `.mcp.json`)
Flow: status → decompose (capacity-budgeted) → log reasoning → delegate
(precise specs + baked-in tests + estTokens/confidence) → operator approves
routing on the dashboard → do kept + reassigned work → `sisyphus_apply` the
gate-passed files (never read them) → salvage/rewrite gate-failed ones →
complete → print summary table. Offload criteria: single self-contained file;
spec < 15 lines; output ≤ ~120 lines; no wider-codebase knowledge beyond
pasted signatures; not security/auth/schema/architecture; low blast radius;
correctness mechanically checkable via `checks` + `tests`.

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
   code, gate_json, created_at, updated_at)`
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
