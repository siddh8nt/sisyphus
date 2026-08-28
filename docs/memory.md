# Sisyphus — Engineering Memory (append-only)

Read the last ~30 lines at the start of every session. Date-stamped. Decisions +
why, bugs + fix, gotchas that must not be rediscovered.

---

## 2026-08-29 — Phase 0 kickoff
- **Env:** Windows 11, PowerShell. Node v24.13.0, npm 11.6.2, git 2.53, gh 2.95
  authenticated as `siddh8nt`. Workspace: `.../sisyphus iqoo/sisyphus/`
  (under OneDrive, path contains a space — quote everything).
- **Decision:** monorepo via npm workspaces (`server`, `mcp`, `web`). Server is
  plain ESM JS + JSDoc (no TS build); `web` uses Vite (TS/JSX allowed).
- **Decision:** Tailwind v3.4 (stable PostCSS flow), not v4 — simpler, predictable
  config for a hackathon timeline.
- **Decision:** pinned dep set only (§4 of build prompt): server = express, ws,
  better-sqlite3, qrcode; mcp = @modelcontextprotocol/sdk; web = vite, react,
  react-dom, tailwindcss + postcss/autoprefixer. `better-sqlite3` ships Windows
  prebuilds for Node 24 — watch for a rebuild if install fails.
- **Decision:** endpoint vs logical-phone model. `POST /register` returns both
  `phoneId` (stable per name) and `endpointId`. Heartbeats target endpointId.
  This cleanly supports one physical phone registering NPU + CPU endpoints.
- **Decision:** mock NPU endpoint on port 11511 so NPU-preference + fallback are
  testable in Phase 1–2, long before real Hexagon bring-up (Phase 6.5).
- **Gotcha to watch:** OneDrive can lock files / slow installs. node_modules is
  gitignored. Fallback plan: relocate to `C:\dev\sisyphus`.

## 2026-08-29 — Phase 0 install gotchas (RESOLVED)
- **better-sqlite3 native build failed on Node 24.** Pinned `11.8.1` has no
  prebuilt binary for Node 24 (ABI 137) → node-gyp tried to compile → no MSVC on
  this laptop → fail. **Fix:** bumped to `better-sqlite3@^13.0.3`, which ships a
  Node 24 Windows prebuild. Installs clean, loads, runs. (Node 24's built-in
  `node:sqlite` also works and is a zero-dep fallback if a future Node bumps ABI
  before better-sqlite3 catches up — but we stay on better-sqlite3 per the spec.)
  Lesson: on a fresh/newer Node, always take the latest better-sqlite3.
- **MCP SDK not hoisted to root node_modules.** `@modelcontextprotocol/sdk@1.30.0`
  installs into `mcp/node_modules` (workspace-local), so importing it from repo
  root fails — must run MCP code from the `mcp/` workspace. Normal for npm
  workspaces; not a bug. Import path: `@modelcontextprotocol/sdk/server/mcp.js`
  and `.../server/stdio.js`.
- Resolved versions: vite 6.4.3, react 18.3.1, tailwind 3.4.19, ws 8.21.3,
  express 4.22.2, qrcode 1.5.4, better-sqlite3 13.0.3, mcp-sdk 1.30.0.
- `npm install` at root: 293 packages, 0 vulnerabilities, clean.

## 2026-08-29 — Phase 1 built + PASSED
- Orchestrator (Express + ws on :4100), registry (endpoint→logical-phone grouping
  by name), heartbeats, per-endpoint health checks, SQLite, WS bus, mock fleet,
  ws-tap. All acceptance checks green.
- **Verified live:** 4 endpoints (mock-1 cpu+npu, mock-2, mock-3) → 3 logical
  phones; mock-1 activeRuntime resolves to `npu` (NPU-first works); killed a
  standalone mock-solo → flipped `offline` within 10s while others stayed online;
  ws-tap saw `hello` + `phone_update` w/ live telemetry.
- **Decisions:** heartbeat targets **phoneId** (not endpointId) — telemetry is a
  physical-phone property; NPU endpoints (no Termux) never heartbeat, their
  liveness is health-check-only. `phone_update` payload = full serialized phone
  (superset), simplest for the UI. Offline is a 2s sweep comparing lastHeartbeat
  age vs 10s threshold; emits phone_update only on status flip.
- **Gotcha:** killing a process by CommandLine `-like '*mock-solo*'` over-matches
  transient shells — for targeted kills prefer port-based lookup. Server+fleet
  survived; only the intended standalone died.
- Offline phones remain listed in /api/phones (as `offline`) — intentional; a
  dropped phone should stay visible for the demo's reliability story.
- Left orchestrator (bg75udfml) + fleet (bia8tpebv) RUNNING for Phase 2 dev.

## 2026-08-29 — Phase 2 built + PASSED
- Task engine: worker-client (Ollama NDJSON + OpenAI SSE adapters, line-buffered
  stream reader, 120s AbortController timeout), validate.js (fence extract, prose
  reject, node --check / JSON.parse / brace+angle heuristics, checks regexes),
  engine.js (session, least-loaded parallel dispatch, lifecycle state machine,
  one retry with validator error appended, Claude fallback, stats→SQLite),
  session/dev routes.
- **Verified live vs mock fleet:** 3 tasks all hit `generating` at the SAME ts on
  3 phones (2.1s wall vs ~5s serial) → real concurrency. formatDate ran on
  mock-1 NPU endpoint (NPU-first). Impossible-check task: generating→validating→
  fail→"Retrying once"→dispatched→generating→validating→fail→"handing back to
  Claude"→failed→fallback_claude, task_result fallback=true. SQLite persisted
  state/status/runtime/tokens_in/out/tok_per_sec/code for all tasks.
- **Gotchas:**
  * Don't hand-write JSON payloads in bash heredocs — backslash escapes (\.card)
    become invalid JSON escapes and body-parser 400s with an HTML error page that
    looks like a missing route. Use a Node test script (fetch + JSON.stringify).
  * Node fetch `response.body` is async-iterable in Node 24 — for-await works for
    stream parsing; buffer partial lines across chunks.
  * dev/delegate starts a fresh session each call (by design) — so session-level
    stats reflect only that call's tasks.
- Restart discipline: server holds the registry in memory, so restarting the
  orchestrator REQUIRES restarting the mock fleet (mocks don't auto re-register
  on heartbeat 404). Kill both by listening port, not by CommandLine match.
- Running now: orchestrator bwovcea78, fleet bqw0mbq25.
