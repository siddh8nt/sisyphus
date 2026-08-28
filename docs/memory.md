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

## 2026-08-29 — Phase 3 built (MCP + skill + demo app)
- MCP stdio server (mcp/index.js): 4 tools status/log/delegate/complete, thin
  HTTP client to :4100. Uses McpServer.registerTool + zod. zod pinned ^3.25 (mcp
  workspace resolves 3.25.76 matching SDK; root has zod 4.x from elsewhere but
  MCP code resolves the workspace copy — fine since ESM resolves from file dir).
- ensureSession(prompt): first sisyphus_log/delegate starts the session; prompt
  passed on first log so History labels it correctly. Added store.updateSessionPrompt.
- Demo Habit Tracker (demo/target-app/): express server.js + habits.json seed +
  public/{index.html,app.js,styles.css}. Runs, serves 4 habits. Pre-wired
  .mcp.json (node ../../mcp/index.js) + .claude/skills/sisyphus/SKILL.md.
- DEMO_SCRIPT.md: seed prompt = streak-stats feature → 3 phone (dateUtil, stat
  card css, unit test) + 2 kept (stats endpoint math, UI wiring).
- **Verified** by driving the REAL MCP server over stdio, launched exactly as
  .mcp.json does (cwd=demo/target-app, args ../../mcp/index.js): full
  status→log→delegate→complete with the real decomposition; 3 phone tasks
  returned valid code in parallel (dateUtil on NPU w/ BOTH functions), stats
  correct.
- **BUG FOUND + FIXED:** completeSession didn't clear the active session, so
  ensureSession reused a stale completed session across MCP connections →
  tasksTotal/wallClock accumulated (saw 7 tasks / 4.7min). Fix: set `session=null`
  at end of completeSession. Re-verified: 5/3/1/153, 3.9s. LESSON: always reset
  session state on completion.
- **Mock upgrade:** cannedAnswer now reads "Target filename:" + all requested
  `function X` names and emits a matching stub per function, a node:test file for
  test targets, and a class-named CSS block — so multi-fn utils/tests pass their
  checks (fair stand-in, not gaming hidden checks).
- Running: orchestrator b01bvhfrp, fleet bbbaecdjk.

## 2026-08-29 — Phase 4 built + PASSED (dashboard)
- Vite+React+Tailwind dashboard, 4 tabs, dark, mobile-first. Built (vite build,
  167KB js/52KB gz) → served statically by orchestrator at / with SPA fallback
  (regex excludes /api and /ws). Path routing (no react-router): /worker/:id →
  WorkerView, else tabbed dashboard.
- Store: tiny external store via useSyncExternalStore fed by /ws; reduces
  hello/phone_update/session_started/reasoning/plan/task_state/token/task_result/
  session_completed. Keeps a 60-sample telemetry ring buffer per phone for sparklines.
- New server route GET /api/config/onboarding → {ip, joinUrl, setupCmd, mcpAddCmd,
  mcpSnippet, qrDataUrl(qrcode.toDataURL)}. lib/netip.js picks LAN IPv4 (prefers
  192.168.137.x hotspot range). Current LAN detected: 10.66.12.147.
- **Verified live** in the in-app Browser pane by firing a 6-task session:
  Orchestration showed reasoning feed (CLAUDE badge), plan split 6-on-phones/1-kept,
  6 task cards w/ streamed code + NPU/CPU badges + per-task tokens/tok-s, scoreboard
  246 saved/4.3s; least-loaded queue put 2 rounds across 3 phones (2 NPU tasks on
  mock-1). Vitals: 3 phones live telemetry + temp/cpu sparkline toggle. History:
  both sessions, expandable task table w/ runtime badges. Worker view: idle READY +
  telemetry. Mobile 375px: single-column nav. Zero console errors.
- **Gotcha:** the in-app Browser pane can't composite screenshots unless it's
  displayed on the user's screen, and clicks can hang while hidden. read_page
  (a11y tree) works regardless and is the reliable verification path here.
- Running: orchestrator bb2gd3uiu, fleet bdkjtn2q1.
