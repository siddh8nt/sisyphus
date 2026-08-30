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

## 2026-08-29 — Phase 5 built + PASSED (worker view)
- WorkerView (built in Phase 4, verified in Phase 5): picks the phone's active
  task (generating/dispatched/validating/retrying) else last task; big name +
  runtime badge, telemetry strip (battery/temp/cpu/mem), streaming monospace pane
  (cyan caret while generating), live token counter + tok/s, idle "READY".
- PWA: added web/public/manifest.webmanifest + apple-mobile-web-app meta + manifest
  link. Vite copies public/ to dist root; served at /manifest.webmanifest.
- Rebuild note: express.static serves dist from disk per-request, so a `vite build`
  is picked up WITHOUT restarting the orchestrator. Only server-code changes need
  a restart (and thus a fleet restart too).
- Verified: fired a 9-task session; worker for mock-1 tracked its 3 NPU tasks live
  (streamed code + 21.4 tok/s), telemetry rose while busy; idle READY confirmed
  earlier. Telemetry ingestion (POST /heartbeat) already done Phase 1.

## 2026-08-29 — Phase 6 kit built (phone onboarding, awaiting real phone)
- phone/setup.sh (CPU runtime, Termux POSIX sh): idempotent — installs
  ollama+termux-api, wake-lock, starts OLLAMA_HOST=0.0.0.0 ollama serve, pulls
  qwen2.5-coder:3b, detects Wi-Fi IP (ip route/ip addr/ifconfig fallbacks),
  registers runtime=cpu, downloads+launches telemetry.sh. Re-run = reconnect.
- phone/telemetry.sh: POSIX loop, termux-battery-status (% + tempC) + /proc/loadavg
  + /proc/meminfo, POST heartbeat every 3s, degrades if termux-api ungranted.
- server/routes/scripts.js serves GET /setup.sh + /telemetry.sh with __ORCH_BASE__
  replaced by http://<lanIp>:4100 and CRLF stripped. Mounted BEFORE static so the
  SPA fallback doesn't swallow them.
- docs/PHONE_SETUP.md: plain-English onboarding (hotspot, firewall rule for 4100,
  Termux+Termux:API from F-Droid not Play Store, battery perm, paste one-liner).
- **Verified:** /setup.sh + /telemetry.sh serve templated (real IP 10.66.12.147),
  pass `bash -n`, LF-only. Real OnePlus onboarding = Phase 6 acceptance, needs the
  user's phone.
- Running: orchestrator brkoxgdro, fleet byrhcu1it.

## 2026-08-29 — Phase 6.5 NPU research + scripts (plan pivot: iQOO-first)
- **Plan change (user):** skipping the OnePlus dress rehearsal; going straight to
  the iQOO 15 demo phones (arriving later). So iQOO day = first real hardware.
  Mitigation: do all phone-independent NPU prep NOW so onboarding is paste-and-go.
- **Research (current upstream llama.cpp, Aug 2026):**
  * Hexagon backend merged into ggml-org/llama.cpp; docs at
    docs/backend/snapdragon/README.md; scripts scripts/snapdragon/{build,run}.py.
  * Build via Docker toolchain `ghcr.io/snapdragon-toolchain/arm64-android:v0.7`
    (bundles NDK r28b + Hexagon SDK 6.6.0.0). `python scripts/snapdragon/build.py
    --target adb`. No official prebuilt binaries — must build (Docker present on
    laptop: 29.5.2).
  * Build emits per-arch HTP libs: v73(8g2) v75(8g3) v79(8 Elite) **v81(8 Elite
    Gen 5 / SM8850 = iQOO 15)** + libggml-hexagon.so. Our arch = **v81**. Confirmed
    supported. This is the key go/no-go fact.
  * Model quant: **Q4_0** required. Primary Qwen2.5-Coder-3B-Instruct-Q4_0;
    proven fallback Llama-3.2-3B-Instruct-Q4_0 if Qwen hits an unsupported op.
  * On-device contract (from run.py): dir /data/local/tmp/llama.cpp, libs ./lib,
    bins ./bin, models ./gguf; env `LD_LIBRARY_PATH=./lib ADSP_LIBRARY_PATH=./lib
    GGML_HEXAGON_DEVICES=HTP0 GGML_HEXAGON_ARCH=v81`; run `./bin/llama-server -m
    gguf/<model> -ngl 99 -c 4096 --host 0.0.0.0 --port 8080`. NPU acts as "GPU"
    for -ngl. Perf ref: Llama-1B Q4_0 ~169 tok/s prefill / ~51 gen.
- **Built:** docs/NPU_SETUP.md (full recipe + fallback contract + troubleshooting),
  phone/npu/{build-npu,deploy-npu,start-npu}.ps1. deploy pushes bundle+model,
  detects phone Wi-Fi IP over adb, starts llama-server, polls /v1/models,
  registers runtime=npu with SAME name as CPU endpoint (groups into one phone).
  start-npu -Stop = chaos test (kill NPU -> CPU fallback).
- **GOTCHA (Windows PowerShell 5.1):** em dash `—` in a .ps1 string is read as a
  CP1252 curly close-quote (byte 0x94 -> U+201D), which PS treats as a string
  terminator -> parse error. FIX: keep .ps1 files ASCII-only. All 3 scripts now
  parse-clean + ASCII-verified.
- **Pre-flight remaining:** install adb (platform-tools) on the laptop (NOT yet
  installed); build the bundle via Docker + download the Q4_0 model. Both
  phone-independent, can be done anytime before the phones arrive.

## 2026-08-29 — Phase 7 hardening (mock parts DONE)
- **Chaos tests (both PASS):**
  * Kill phone MID-GENERATION (destroy sockets while streaming) → generate throws
    → retry → endpoint dead → Claude fallback in ~0.6s. No hang, no unhandled
    rejection in the orchestrator.
  * Kill NPU endpoint (keep CPU) → health check flips activeRuntime npu→cpu within
    ~6s → task completes on CPU (not cloud), narrated "NPU endpoint on X is
    unavailable — routing this task to CPU." fallback=false.
- **BUG/robustness fix:** abandoned session (Claude never calls sisyphus_complete)
  caused the NEXT flow's stats to accumulate (saw onDevice=4). Fix: ensureSession
  now starts a FRESH session when a new, different prompt arrives while a session
  is still active. Verified self-heal (stale open session → new flow → clean 2/1/1).
- **3 consecutive mock rehearsals FLAWLESS:** each 3 on-device / 2 cloud / 1 NPU /
  153 tok saved / ~3.8s. Satisfies the mock-fleet part of Phase 7 acceptance.
- DEMO_SCRIPT.md expanded: minute-by-minute run sheet, full pre-demo checklist
  (hotspot/firewall/reset habits.json/worker views), contingencies w/ the proven
  chaos stories, reset-between-runs.
- Remaining Phase 7 needs hardware: tune worker prompt vs real outputs, 7B stretch,
  1 flawless real-phone run.
- Running: orchestrator b9hsa5989, fleet bgrp7o7kh.

## 2026-08-29 — adb pre-flight resolved
- User already had Android SDK platform-tools installed:
  C:\Users\siddh\AppData\Local\Android\Sdk\platform-tools\adb.exe (adb v37.0.1,
  1.0.41). Not on PATH. `adb devices` works (empty list, no phone yet).
- Rather than edit system PATH, made deploy-npu.ps1/start-npu.ps1 auto-resolve
  adb: -AdbPath override -> PATH -> %LOCALAPPDATA%\Android\Sdk\platform-tools\
  adb.exe. Verified the resolver finds it. No system change needed.
- Pre-flight remaining before iQOO day: build the NPU bundle (Docker) + download
  the Q4_0 model. Docker present (29.5.2).

## 2026-08-29 — NexaSDK researched: llama.cpp stays primary (decision confirmed)
- NexaSDK is now Qualcomm-official = **GenieX** (github.com/qualcomm/nexa-sdk,
  "community version of Qualcomm GENIE"). Nov-2025 Qualcomm "NexaSDK for Android"
  blog exists.
- Under the hood, GenieX's GGUF-on-NPU path **IS llama.cpp ggml-hexagon** (same
  HTP kernels). It adds a QNN / Qualcomm AI Engine Direct path (AI Hub pre-compiled
  per-chipset bundles, NPU-only, "highest NPU perf").
- **DECISIVE:** README platform table shows the OpenAI-compatible `geniex serve`
  for **Windows ARM64 / Linux / Docker only**. On **Android** the ONLY interface
  is the **Kotlin/Java Android SDK** (embed in an app; sample = Android Studio app
  in qualcomm/ai-hub-apps). No adb-runnable server on Android.
- Sisyphus needs a standalone OpenAI *server* on the phone. llama.cpp llama-server
  gives that via adb with no app. NexaSDK on Android would require building +
  installing a custom Android app that embeds GenieX and serves HTTP — MORE work.
- Also confirms: Q4_0 best for Hexagon; 8 Elite Gen 5 supported.
- **Decision:** keep llama.cpp Hexagon (llama-server) as PRIMARY. NexaSDK/GenieX =
  reference + last-resort Plan B (its QNN/AI-Hub path = perf Plan C, only if we
  ship an on-phone app). Recorded in docs/NPU_SETUP.md.

## 2026-08-29 — SESSION END / STRATEGY LOCKED + MORNING START

### >>> START HERE NEXT SESSION <<<
1. **Fix Docker Desktop** (it crashed on launch): dialog error was
   "initializing Inference manager: remove ...\Docker\run\dockerInference: file
   cannot be accessed" = stale socket from the Model Runner feature. Fix (safe,
   do NOT "Reset to factory defaults"): Quit Docker Desktop -> fully stop its
   processes -> delete stale socket `C:\Users\siddh\AppData\Local\Docker\run\
   dockerInference` -> relaunch -> if it recurs, disable Docker "Model Runner"/
   inference feature (we only need plain Linux containers).
2. **Build the llama.cpp Hexagon NPU bundle** (phone-independent): once Docker is
   up, run `phone/npu/build-npu.ps1`. Then download a Q4_0 coder GGUF into
   `phone/npu/bundle/gguf/` (Qwen2.5-Coder-3B-Instruct-Q4_0; fallback
   Llama-3.2-3B-Instruct-Q4_0). This is the last phone-independent NPU prep.
3. To run/demo the system: `npm start` + `npm run mock-fleet` (background tasks
   were stopped at session end; nothing is running now).
4. When iQOOs arrive: CPU one-liner per phone -> `deploy-npu.ps1 -Name iqoo-N`
   -> benchmark NPU vs CPU -> chaos test (start-npu.ps1 -Stop).

### DECISIONS LOCKED THIS SESSION
- **Architecture UNCHANGED.** Keep Sisyphus as built (laptop Claude Code
  orchestrates a phone fleet). The cloud agent is the THESIS ("mobile edge
  compute for coding agents like Claude Code"), not a flaw. **The proposal
  qualified TOP 25 of thousands** -- do not second-guess the core premise.
  (I raised a "no cloud" concern; user correctly overrode it. Dropped.)
- **NPU runtime = llama.cpp Hexagon (llama-server), primary.** Reasons that are
  NOT sunk cost: (a) only option giving a standalone on-phone OpenAI *server*,
  which a laptop-orchestrated fleet requires; (b) its NPU engine IS the same
  ggml-hexagon GenieX uses for GGUF anyway; (c) drops into the finished
  architecture with scripts already written. GenieX on Android = Kotlin/Java SDK
  embedded in an app only (NO standalone server) -> would require building an
  Android app -> more work.
- **SEQUENCING (user's call, correct):** get EVERYTHING working with llama.cpp
  (CPU + NPU + dashboard + fallback + a real /sisyphus run) FIRST. ONLY THEN, as
  an additive phase, build a **native worker-view Android app + GenieX** for the
  hackathon's phone-first points. Never jeopardize a working demo for the upgrade.

### HACKATHON CONTEXT (why phase-2 native app matters) — iQOO Hackathon 2026
- iQOO x Reskilll, "phone-first" AI hackathon, 30h city battles (Bengaluru Aug29,
  Pune Sep5, Chennai Sep12, Hyderabad Sep26), Grand Finale Bengaluru Oct 9-11
  (48h). Team <=3. Free. (Confirm OUR city/date with user.)
- **Rubric:** End product 30% (jury) | Novelty & impact 20% (jury) | Creative
  phone use camera/voice/on-device-AI 15% (DEVICE TELEMETRY) | Technical depth
  15% (jury) | Office Kit usage 10% (DEVICE TELEMETRY) | Demo & presentation 10%.
  **25% is automated device telemetry - "no way to fake it in your pitch."**
- Hard rules: "The demo MUST run on the iQOO phone." "Local/open-source LLMs on
  the phone NPU." Tracks (7) incl **Developer Tools** (our lane). Office Kit =
  phone<->laptop bridge (screen mirror/clipboard/file/remote), pc.vivoglobal.com.
- IMPLICATION for phase-2: the phone-first 25% (creative phone use + Office Kit)
  + "demo on phone" is why the native app / Office Kit layer is worth building
  AFTER the core is solid. User's phase-2 idea: native worker-view app, GenieX on
  NPU, display web UI on phone via Office Kit. (Note to revisit: "Claude Code on
  phone via Claude app" -- Claude Code != the Claude mobile app; clarify the
  demo-on-phone mechanics when we get there.)

### GENIEX RISK (why it's phase-2, timeboxed) — for the record
NexaSDK = Qualcomm's official GenieX. Risks are TIME/INTEGRATION not capability:
young SDK (v0.3.1, thin/moving docs); Android = app build (Gradle/NDK/signing),
not a drop-in; QNN/AI-Hub path constrains models (Phi-3/Gemma/Whisper, not coder)
and may need self-compiling via AI Hub; new streaming+telemetry app->orchestrator
plumbing; slow on-device debug; one app crash takes down both runtimes (vs clean
separate CPU/NPU processes today). Hedge: keep llama-server for inference even in
the native-app phase; the app can be UI/Office-Kit/telemetry only.

### STATE OF THE BUILD (all green, pushed to github.com/siddh8nt/sisyphus)
Phases 0-5 DONE+verified. Phase 6 kit DONE (real onboarding needs phone). Phase
6.5 research+scripts DONE (adb auto-detected v37.0.1; bundle build blocked on
Docker crash above). Phase 7 mock-hardening DONE (chaos tests pass, self-heal,
3/3 rehearsals). Phase 8 = iQOO day. Latest commit before this note: 2160ebd.

## 2026-08-29 — RULE: Claude is never a repo contributor
- User directive: **do NOT add `Co-Authored-By: Claude ...` (or any Claude
  attribution) to commits.** Claude must never appear as a contributor/co-author
  in this repo. Overrides the default harness convention of adding that trailer.
- Apply to ALL future commits (author stays the user only; no co-author trailer).
- NOTE for next session: earlier commits (Phase 0 .. 3071596) DO contain the
  trailer, so Claude currently shows as a co-author on those. Scrubbing them needs
  a history rewrite + force-push — offered to the user; do only if they confirm.

## 2026-08-29 — AT THE VENUE / LIVE (iQOO phones in hand)
STATE: We are at the hackathon venue with the iQOO 15 phones. Orchestrator
started on the hub laptop. Clock running.
- **Networking:** hotspot was OFF (only Ethernet 10.124.180.123 + venue Wi-Fi
  10.231.240.77). PLAN: turn on Windows Mobile Hotspot (share from Ethernet) ->
  phones join it -> hub reachable at 192.168.137.1:4100. Firewall rule for 4100
  needs ADMIN (not yet added): `netsh advfirewall firewall add rule
  name="Sisyphus" dir=in action=allow protocol=TCP localport=4100`.
- **Onboarding IP:** comes from Configure tab AFTER hotspot is on (will be
  192.168.137.1, NOT the Ethernet 10.124.x that netip picked with hotspot off).
- **Team sync:** wrote docs/VENUE_RUNBOOK.md (self-serve). Model: ONE hub laptop
  runs `npm start`+hotspot; teammates onboard phones in parallel against the hub
  IP with unique `--name iqoo-N`. Owner adds collaborators
  (`gh repo add-collaborator siddh8nt/sisyphus <user>`).

### LOCKED PRIORITY ORDER AT VENUE (floor-first, then climb)
1. **CPU fleet online on all 3 iQOOs FIRST** (proven, fast; the ~2GB model pull
   per phone is the only real wait -> start it, parallelize everything else).
   This is the guaranteed working demo + real on-device LLM (core rubric req).
2. **While models pull (parallel):** install Office Kit (10% telemetry + demo
   runs on phone); kick off Docker fix + NPU bundle build on the hub.
3. **Real `/sisyphus` run** with 3 real phones -> validates core on hardware
   (first time off mocks) + rehearsal.
4. **NPU bring-up** on the iQOOs (headline; technical depth). Timeboxed; CPU is
   the safety net. deploy-npu.ps1 -Name iqoo-N.
5. **Native app (Phase 9)** ONLY if 1-4 solid and time remains (Tier 2 first,
   walking skeleton). Highest risk/lift; do not start here.
- Rationale: app is high-variance; steps 1-3 give a compelling rubric-aligned
  demo you can always fall back to. NPU + app are escalating upside.

### DONE THIS SESSION (venue)
- Orchestrator running (bg task bl73zguda). Firewall attempt = needs admin.
- VENUE_RUNBOOK.md + README pointer committed/pushed.
- NPU bundle build STILL PENDING (Docker crashed earlier; retry per morning-start).

## 2026-08-29 — Teammate machine setup: Node 24 + `npm install --ignore-scripts`
Bringing up a second dev laptop (akshat's) from a fresh clone hit two blockers.
Both are environment-only — no repo code changed. Record so the next teammate
doesn't lose 20 minutes.

1. **`npm install` fails with `gyp ERR! Could not find any Visual Studio
   installation`.** `better-sqlite3@13` sets `"gypfile": false` and ships
   prebuilt binaries in `prebuilds/<platform>-<arch>.node`, but npm 10/11 still
   defaults to `node-gyp rebuild` because a `binding.gyp` is present in the
   tarball. **Fix: `npm install --ignore-scripts`** — the shipped prebuild is
   then used and everything works (esbuild/vite are fine without their install
   script too; `fsevents` is macOS-only). Installing VS Build Tools also works
   but is a multi-GB download you don't need.
2. **Node 22 segfaults.** On Node v22.13.0 the win32-x64 prebuild crashes with an
   access violation (0xC0000005) the moment you construct a `Database`. `require`
   succeeds; `new Database(':memory:')` kills the process. **Node 24 LTS is the
   supported runtime** (matches the hub laptop — Phase 0 bumped better-sqlite3 to
   ^13 for the Node 24 prebuild). `winget install --id OpenJS.NodeJS.LTS` →
   v24.19.0 / npm 11.17.0. Verified fine there.
   - NOTE: root `package.json` still says `"engines": {"node": ">=20"}`, which is
     wrong — better-sqlite3@13 itself declares `>=22`, and 22 crashes in practice.
     Should be `>=24`. Left unchanged pending the hub owner's call (shared file).
   - `docs/VENUE_RUNBOOK.md` / `README.md` said "Node >= 20"; corrected to 24.

**Verified end-to-end on the new machine** (Node 24.19.0, npm 11.17.0, no VS):
orchestrator on :4100, dashboard/worker/setup.sh all 200, 3 mock phones online
(mock-1 with the NPU endpoint), and a full MCP-over-stdio run launched exactly as
`demo/target-app/.mcp.json` does — `sisyphus_status` → `sisyphus_log` →
`sisyphus_delegate` → `sisyphus_complete`. Result matches the documented mock
baseline: **3 on-device / 1 NPU / 153 cloud tokens saved / ~3.8s**.

**Gotcha found while testing (not a bug, but worth knowing):** the mock worker
derives a CSS class name from the spec via
`/\.([a-zA-Z][\w-]*)\s*(?:CSS|component|\{)/`. Writing the spec as
``a `.stats-card` component`` (backticked) defeats that regex, it falls through
to matching `.css` from the filename, and the task fails its `checks` → retry →
Claude fallback. Write CSS specs unbackticked (`a .stats-card component`). Real
phones don't care; this only shapes mock rehearsal numbers.

## 2026-08-29 — NPU bundle BUILT (phase-independent blocker cleared)
On akshat's laptop (teammate dev machine, not the hub). Closes the "START HERE
NEXT SESSION" item that was blocked on the hub's Docker crash.
- **Docker Desktop 4.88.1** installed fresh via winget → daemon came up clean,
  no stale Model Runner socket (the crash was hub-specific, not reproduced here).
- `phone/npu/build-npu.ps1` ran to exit 0: shallow-cloned ggml-org/llama.cpp,
  pulled `ghcr.io/snapdragon-toolchain/arm64-android:v0.7`, cross-compiled (743
  objects, clean), staged install tree → `phone/npu/bundle/`.
- Bundle verified: `bin/llama-server` (ARM aarch64 ELF; small because it links
  the 20 shared .so libs, not static), `lib/libggml-hexagon.so`, and all HTP
  arch libs **v73/v75/v79/v81** — v81 = iQOO 15 / 8 Elite Gen 5 = our target.
- Model: `gguf/Qwen2.5-Coder-3B-Instruct-Q4_0.gguf`, 1,828,486,400 bytes —
  matches HF Content-Length exactly, GGUF magic OK. (Plain Q4_0, NOT the
  Q4_0_4_4/_4_8/_8_8 ARM-CPU repacks — Hexagon HTP wants plain Q4_0.)
- **adb**: installed Google.PlatformTools r37.0.1 via winget (on PATH; deploy
  scripts' `Get-Command adb` resolver finds it). No Android SDK needed.
- Bundle + model are gitignored (`phone/npu/bundle/`); portable — copy to
  whichever laptop has an iQOO on USB, or re-run build-npu.ps1 there.

**NOT done (all need an iQOO on USB, none connected now):** deploy-npu.ps1,
NPU-vs-CPU benchmark, chaos test. A OnePlus 13s (CPH2723, SM8750=8 Elite/v79)
was attached but ONLY for USB internet tethering — deliberately NOT deployed to
(wrong arch + it's the internet uplink). Do not deploy to it.

## 2026-08-29 — FIRST REAL RUN ON 3 iQOO PHONES (off mocks!) + NPU LIVE
On akshat's laptop as the hub (siddh's was down). Hotspot LAPTOP-OT574E8N,
firewall opened, 3 iQOO 15 (SM8850 = Hexagon **v81**) onboarded.

**NPU bring-up SUCCESS on iqoo-1:** deploy-npu.ps1 pushed the bundle+model over
USB (1.83 GB in 58s), llama-server loaded the Q4_0 model with -ngl 99 on HTP0
(v81) and served OpenAI on :8080. Direct test returned valid code in ~2s. NPU +
CPU endpoints grouped under iqoo-1, both healthy, activeRuntime=npu.

**Full parallel delegate through the real MCP server → 3 real phones, 0 fallback:**
- iqoo-1 **NPU**: dateUtil.js, 160 tok, 16.6s, **9.6 tok/s** — correct padStart date fmt
- iqoo-2 CPU: stats-card.css, 54 tok, 12.2s, 4.4 tok/s
- iqoo-3 CPU: dateUtil.test.js, 190 tok, 23.1s, 8.2 tok/s
- Stats: 3 on-device / 1 cloud / 1 NPU / **404 cloud tokens saved** / 23.2s wall.
- REAL qwen2.5-coder output, passed validation (node --check + checks). The test
  file used jest `expect` (small-model quirk) — caught by the review step, not a
  system bug.
**First real NPU-vs-CPU signal: NPU 9.6 tok/s > CPU 4.4-8.2 tok/s.** (Not yet a
controlled bench — different task sizes; run identical-prompt bench next.)

### Bugs found + fixed live (both committed-worthy):
1. **telemetry.sh froze the heartbeat.** `termux-battery-status` BLOCKS on an
   ungranted permission dialog (doesn't error), so `|| true` never fires and the
   loop stalls before its first POST → phone shows offline despite a healthy
   endpoint → task engine won't dispatch to it. FIX: `timeout 2
   termux-battery-status`. Phones now go online (battery/temp 0 until the
   Termux:API APK is installed + permission granted; cpu load 0 too — Android 16
   SELinux blocks /proc/loadavg for the unprivileged Termux app, while
   /proc/meminfo is allowed so MEM is real).
2. **deploy/start-npu.ps1 hung** on `adb shell "nohup ... &"` — adb doesn't
   return while the backgrounded server holds the inherited stdin pipe. Deploy
   stalled after "Starting llama-server" and never registered the NPU endpoint
   (had to register it by hand this time). FIX: add `</dev/null` + wrap the adb
   shell in a Start-Job with a 15s Wait-Job guard so the deploy always proceeds
   to poll+register (llama-server keeps running regardless).

### Known live-demo risk: heartbeat fragility
Android kills backgrounded Termux, stopping telemetry.sh → phone flips offline →
no task dispatch. Keep Termux foreground OR set Termux battery = Unrestricted on
each phone. Re-running the setup one-liner relaunches telemetry (idempotent).

### Telemetry cosmetics (NOT the rubric's device-telemetry 25%, which is Office Kit):
Battery/temp need the **Termux:API APK** (com.termux.api) — only the `termux-api`
CLI package was installed, not the app. Install the APK from the SAME source as
Termux (signatures must match), grant permission. iqoo-1 ground truth via adb:
51%, 32.0C.

### STILL TODO (Phase 6.5 / 8):
- NPU on iqoo-2 + iqoo-3 (deploy-npu.ps1 -Name iqoo-N -Serial <s>; hang fixed).
- Controlled NPU-vs-CPU benchmark (identical prompt) → real pitch stat.
- Chaos test: start-npu.ps1 -Stop mid-run → seamless CPU fallback, narrated.
- Polished human /sisyphus run in Claude Code (demo/target-app) for the demo.
- Mock fleet stopped so the real run used only iQOOs; restart with npm run
  mock-fleet if you want the dashboard populated when phones are away.

## 2026-08-29 — ALL 3 iQOOs ON NPU (Phase 8 hardware acceptance PASSED)
iqoo-2 + iqoo-3 NPU deployed cleanly with the fixed deploy-npu.ps1 (auto IP-detect
+ poll + register, no hang, no manual step). All 3 phones: CPU+NPU both healthy,
activeRuntime=npu.
- iqoo-2 NPU @192.168.137.225:8080, iqoo-3 NPU @192.168.137.105:8080.
- **Full run, all 3 on NPU in parallel, 0 fallback:** iqoo-1 160 / iqoo-2 70 /
  iqoo-3 344 tok; 3 on-device / 3 NPU / **574 cloud tokens saved / 16.7s**.
- Speed signal holds: all-NPU run 16.7s vs the earlier mixed-CPU run 23.2s.
- deploy-npu.ps1 fix (adb `</dev/null` + Start-Job 15s guard) validated on 2
  phones back-to-back — the phone-swap flow (unplug prev, it keeps serving over
  Wi-Fi; plug next; deploy by -Serial) works smoothly with the OnePlus still
  attached as a 2nd adb device.
- Remaining: controlled NPU-vs-CPU bench (identical prompt), chaos test
  (start-npu.ps1 -Stop → CPU fallback), Termux:API APK for battery/temp, and the
  polished human /sisyphus run in Claude Code for the actual presentation.

## 2026-08-29 — CONTEXT SWITCH to siddh8nt's machine (akshat usage limit)
Full handoff written to **docs/HANDOFF_2026-08-29.md** — read it first on the new
machine, then these last entries, then phases.md. Summary:
- Phase 8 hardware acceptance PASSED: 3 iQOOs, all on NPU (v81), real parallel
  run 3/3 NPU / 574 tok saved / 16.7s / 0 fallback.
- iQOO serials: iqoo-1=10BFBM0AU7001GP, iqoo-2=10BFAT1U6A000XP, iqoo-3=10BFBJ0SQJ001GG.
- On-device NPU bundle + model persist; new machine can `start-npu.ps1` per phone
  (no 2 GB re-push) once phones are on its USB + hotspot.
- `phone/npu/bundle/` is gitignored (~2 GB) — copy from akshat's laptop or
  rebuild via build-npu.ps1 + Docker.
- Vitals battery/temp DEFERRED (needs Termux:API app; sysfs+dumpsys SELinux-
  blocked on Android 16). Cosmetic, not the rubric telemetry.
- NEXT on new machine: chaos test (closes 6.5) → controlled NPU-vs-CPU bench →
  polished human /sisyphus run in Claude Code → Phase 7 prompt tuning → Phase 9.

## 2026-08-29 — Vitals battery/temp FIXED on all 3 iQOOs
Installed the F-Droid Termux:API app (com.termux.api, versionCode 1002 = v0.53.0)
via `adb install -r` on all 3 phones (the GitHub-signed one failed signature
match — installed Termux is F-Droid-signed). All 3 now report real battery+temp
(iqoo-1 51%/32.7C, iqoo-2 46%/33.5C, iqoo-3 74%/37.1C). No code change — the
`termux-api` CLI package was already installed; only the companion APK was
missing. Running telemetry.sh picked it up within one 3s tick, no restart.
Phone-side install → survives the hotspot switch to siddh's machine.
CPU load still "—": Android 16 SELinux blocks /proc/loadavg for unprivileged
Termux (dumpsys + sysfs also blocked). Not fixable without root; card renders
"—" correctly. Not the rubric telemetry anyway (that's Office Kit).

## 2026-08-29 — Chaos test PASSED on siddh's machine (closes Phase 6.5)
Hub re-attached on siddh's machine after the context switch: firewall rule
persisted across reboot; hotspot needed manual re-enable (share from Wi-Fi —
"Ethernet/Wi-Fi/cellular" error on first attempt was because the hotspot UI
briefly couldn't see an upstream connection, resolved on retry); all 3 iQOOs
re-joined via `setup.sh` one-liner (fast reconnect, no re-pull) and NPU
re-registered via `start-npu.ps1 -Serial <s>` per phone (on-device bundle
intact, no 2GB re-push needed) — 3/3 online, cpu+npu healthy, activeRuntime=npu.

**Test 1 — NPU kill → health-check flip → CPU takeover:**
Killed iqoo-2's NPU (`start-npu.ps1 -Stop`). Polled `/api/phones`: flipped
npu healthy=false / activeRuntime=cpu within ~10s (health-check interval is
5s; kill landed between ticks, so up to 2 cycles — slower than the "~6s"
guess in the handoff but expected given the interval). A fresh delegate run
(3 tasks, 1/phone) then routed iqoo-2's task straight to CPU automatically
(`runtime:"cpu", fallback:false`), valid code, while iqoo-1/iqoo-3 stayed on
NPU. 0 cloud fallback. The narration line
(`NPU endpoint on iqoo-2 is unavailable — routing this task to CPU.`) fires
deterministically from `runTask`'s `hasUnhealthyNpu` check, confirmed true at
dispatch time.

**Test 2 — full phone drop → graceful exclusion + redistribution:**
Tried `adb shell pkill -f "ollama serve"` first — failed: **"Operation not
permitted."** Root cause: `ollama serve` runs under the Termux app's own UID
(started from inside the Termux terminal), while `adb shell` runs as the
unprivileged `shell` user — Android's app-sandboxing blocks cross-UID
signals. (This is why `start-npu.ps1`'s `pkill -f llama-server` DOES work —
that process was spawned directly by `adb shell`, so it's owned by `shell`
itself.) Fix: `adb shell am force-stop com.termux` — a privileged OS-level
action `shell` is allowed to invoke on any package, kills the whole app
including telemetry.sh — this is also a more faithful simulation of the
actual documented live-demo risk (Android backgrounding/OOM-killing Termux)
than any synthetic single-process kill would be.
Result: iqoo-2 flipped `status=offline` within ~10s (heartbeat timeout),
both endpoints unhealthy. A delegate run (3 tasks) correctly EXCLUDED iqoo-2
from the assignable pool (`onlinePhones().filter(pickEndpoint)`) and
redistributed its share via least-loaded to iqoo-1 (1 task) + iqoo-3 (2
tasks) — all 3 completed on NPU, 0 cloud tokens needed. System self-healed
with no manual routing.
Restored iqoo-2: re-ran `setup.sh` (relaunches telemetry + ollama) then
`start-npu.ps1 -Serial 10BFAT1U6A000XP` (USB) — back to 3/3 online, all NPU.

**New operational note:** to forcibly kill a Termux-hosted server (ollama)
from adb for testing, use `am force-stop com.termux`, not `pkill` — pkill
only works on processes adb itself spawned (like llama-server via
`adb shell nohup ... &`).

**Phase 6.5 CLOSED.** Remaining from the handoff's priority list: controlled
NPU-vs-CPU benchmark (identical prompt) → polished human /sisyphus demo run.

## 2026-08-29 — Controlled NPU-vs-CPU benchmark (identical prompt, all 3 iQOOs)
Added `server/scripts/bench.js` — reuses the REAL production `generate()` +
`buildWorkerPrompt()` code path (not a synthetic bench), runs one task
("debounce utility", ~58-60 output tokens) sequentially against a phone's
NPU (:8080) then CPU (:11434) endpoints, same sampling (temp 0.2, num_predict
1200). Measures time-to-first-token (TTFT, i.e. prefill+dispatch latency) and
steady-state decode tok/s. Usage: `node server/scripts/bench.js <phoneName>`.

**Results (all 3 iQOO 15 / SM8850 / Hexagon v81):**
| phone | NPU tok/s | CPU tok/s | decode speedup | NPU TTFT | CPU TTFT | prefill speedup |
|---|---|---|---|---|---|---|
| iqoo-1 | 7.81 | 4.31 | 1.81x | 1451ms | 10382ms | 7.2x |
| iqoo-2 | 9.45 | 4.63 | 2.04x | 715ms | 9463ms | 13.2x |
| iqoo-3 | 9.51 | 4.00 | 2.38x | 592ms | 11093ms | 18.7x |
| **avg** | **8.92** | **4.31** | **~2.1x decode** | **919ms** | **10313ms** | **~11.2x prefill** |

**This is the real pitch stat** (controlled, identical-prompt, apples-to-apples
— not the earlier uncontrolled 9.6 vs 4.4-8.2 signal from mixed task sizes).
The prefill/TTFT gap is the more dramatic number: the Hexagon NPU dispatches
and starts generating ~11x faster than CPU on the same prompt, on top of a
~2x faster decode rate. Combined, a real coding task returns roughly 2-3x
faster wall-clock on NPU vs CPU on the same phone.

## 2026-08-29 — Session checkpoint (context switch prep, siddh's machine)
Wrapping this session for a context switch. Current live state, for whoever
(or whichever fresh Claude Code session) picks this up next:

**Orchestrator:** running (`npm start`, background job on this machine) at
`http://192.168.137.1:4100`. Hotspot is ON, sharing from Wi-Fi. Firewall rule
"Sisyphus" (TCP 4100 inbound) is in place.

**Fleet right now:**
- iqoo-1: online, **NPU DIED** (llama-server not responding — almost
  certainly killed by phone sleep/idle, the documented fragility), auto
  fell back to `activeRuntime=cpu` cleanly with 0 manual intervention. NOT
  currently on USB — needs a replug + `phone/npu/start-npu.ps1 -Name iqoo-1
  -Serial 10BFBM0AU7001GP` to revive the NPU (no re-push needed, bundle is
  intact on-device).
- iqoo-2: online, cpu+npu both healthy, activeRuntime=npu.
- iqoo-3: online, cpu+npu both healthy, activeRuntime=npu.
- Serials: iqoo-1=10BFBM0AU7001GP, iqoo-2=10BFAT1U6A000XP,
  iqoo-3=10BFBJ0SQJ001GG.

**Phase status:**
- Phases 0-5: done (mocks). Phase 6 (CPU onboarding): done, 3 iQOOs.
- **Phase 6.5: CLOSED today.** Chaos test PASSED (NPU-kill→CPU takeover,
  full-phone-drop→redistribution, both real hardware, both narrated/logged).
  Controlled NPU-vs-CPU bench PASSED: avg 2.1x decode speedup, avg 11.2x
  prefill/TTFT speedup (`server/scripts/bench.js`, full table above this
  entry). This is the real pitch stat — supersedes the earlier uncontrolled
  numbers.
- Phase 7: mocks done; real-phone prompt tuning still TODO.
- **Phase 8: PASSED** (hardware acceptance, real parallel runs, 0 fallback).
- Phase 9 (native app): not started, locked until 0-8 fully bulletproof.

**NEXT (priority order):**
1. Polished human `/sisyphus` run: open Claude Code in `demo/target-app/`,
   run the prompt from `demo/DEMO_SCRIPT.md`, watch the dashboard — this is
   the actual presentation run. Reset between attempts with
   `git -C demo/target-app checkout -- .`. Mock fleet is NOT running — only
   real iQOOs should be online for this run.
2. Phase 7 real-phone prompt tuning against real qwen output.
3. Phase 9 native Android worker app (Tier 2 walking skeleton first, per the
   locked plan — skip Tier 1/WebView, Tier 3/GenieX-embedded later).
4. (Nice-to-have, not blocking) revive iqoo-1's NPU per above.

**Repo state:** 2 unpushed commits ahead of `origin/main` (`7223e14` chaos
test, `c0d4f9b` bench) — push pending user confirmation (ask once per
session, per `docs/rules.md`).

**Reminder for whoever resumes:** read this entry, then `docs/phases.md`
banner, then `docs/rules.md`. **No `Co-Authored-By: Claude` trailer on any
commit** — commits are authored by the human alone.

## 2026-08-29 — Polished human /sisyphus demo run: PROVEN on real hardware
Ran the actual demo prompt from `demo/DEMO_SCRIPT.md` for real, end-to-end,
against the live 3-iQOO fleet (iqoo-2/iqoo-3 on NPU, iqoo-1 on CPU — a genuine
mixed-runtime run, not staged). Followed the `/sisyphus` skill exactly (status
→ decompose → log reasoning → delegate → keep/integrate → complete).

**Result: 5 tasks, 3 on-device / 2 cloud, 2 NPU-accelerated, 561 cloud tokens
saved, ~5m11s wall clock.**
- Phones (parallel): `public/dateUtil.js` (iqoo-3/NPU), `public/stats-card.css`
  (iqoo-2/NPU), `test/dateUtil.test.js` (iqoo-1/CPU) — 0 fallback.
- Claude kept: `GET /api/stats` streak-math endpoint (data-shape decision) +
  wiring into `index.html`/`app.js` (cross-file integration).
- **Review caught 2 real small-model bugs before integrating** (exactly what
  skill step 6 is for): stats-card.css had a digit-transcription slip
  (`#5aa0ad` instead of the spec'd `#9aa0ad`) and an invalid bare
  `tabular-nums;` declaration (should be `font-variant-numeric: tabular-nums;`).
  Both fixed by hand, not re-generated.
- Verified for real, not just claimed: `node --check` clean on all 5 touched
  files; `node --test test/dateUtil.test.js` → 3/3 pass; streak math
  hand-verified correct against the actual `habits.json` data (meditate 5/5,
  read 2/2, exercise 1/1, water 6/6); ran the live server and screenshotted
  the rendered UI in-browser (dark theme intact, colors correct); confirmed
  the click-guard (clicking a stats-card doesn't misfire the habit toggle).
- Session fully persisted: `sessionId=d294eb3c`, queryable via
  `/api/sessions/d294eb3c` — real completed_at timestamp, summary, stats,
  and every task's generated code, tokens, phone, runtime.

**Decision: did NOT commit the generated demo-app files.** `demo/target-app/`
was reverted to pristine (`git checkout --`) right after, on purpose — the
whole point of this run was to PROVE the exact `demo/DEMO_SCRIPT.md` prompt
works flawlessly on real hardware, not to ship its output. The venue demo
should be run fresh (this exact prompt is already the one documented in
DEMO_SCRIPT.md, unchanged) so the live audience sees the real decomposition +
delegation + integration happen, not a replay.

**This is the last item on the Phase 6.5/7/8 punch list that mattered before
the actual pitch.** Phase 6.5 chaos test + controlled bench (closed earlier
today) + this polished run together mean: NPU works, CPU fallback works,
full-phone-drop resilience works, and the flagship /sisyphus flow works
end-to-end on real hardware with a real speedup story (~2.1x decode,
~11.2x prefill) and a real reliability story. Ready to demo as-is.

## 2026-08-29 — Session checkpoint #2 (context switch: siddh's usage limit)
siddh8nt's Claude Code is approaching its usage limit; dev is moving to
another teammate's machine/account. Per `docs/VENUE_RUNBOOK.md` §"Continue
development on another teammate's Claude Code" — the repo is the handoff,
read this entry + the last few above it, then `docs/phases.md`, then
`docs/rules.md`.

**What's true right now:**
- Repo is clean, `demo/target-app/` is pristine (untouched since the last
  commit) — the demo prompt run above proved it works but left no trace on
  disk, by design.
- Orchestrator is running on **siddh's machine** at `192.168.137.1:4100`
  (started manually in a terminal after a machine reboot earlier this
  session — NOT tracked by any Claude Code background job). Whoever
  continues needs to check whether that machine/hotspot is still reachable,
  or re-run Part A of `docs/VENUE_RUNBOOK.md` on the new hub.
- Fleet last known state: iqoo-2 + iqoo-3 online/NPU-healthy; iqoo-1 online
  but its NPU had died mid-session from idle/sleep (auto-fell-back to CPU
  cleanly) and was not revived (not on USB at the time). All 3 CPU endpoints
  healthy throughout.
- All phase-progress docs (this file, phases.md) are up to date and pushed
  to `origin/main` as of the previous checkpoint commit; this entry + the
  demo-run entry above are the newest, about to be committed now.

**NEXT for whoever resumes:**
1. Decide whether to keep siddh's machine as hub or move the hub to the new
   machine (re-run Part A of VENUE_RUNBOOK.md if moving: hotspot, firewall
   rule, `npm start`).
2. Re-attach the 3 iQOOs to whichever machine is hub (Part B: `setup.sh` per
   phone; Part C: `start-npu.ps1 -Serial <s>` per phone for NPU, bundle
   already on-device, no re-push needed).
3. Everything else is DONE: Phase 6.5 closed, Phase 8 passed, the demo prompt
   is proven. From here it's rehearsal + Phase 7 prompt polish + (if time)
   Phase 9 native app groundwork.

**No `Co-Authored-By: Claude` trailer on any commit** — commits are authored
by the human alone.

## 2026-08-29 — Dashboard GLITCH re-skin (commit `ac42000`)
- **What:** applied a pure visual re-skin to the whole `web/` dashboard (App,
  WorkerView, all 4 tabs, `components/ui.jsx`, `index.css`, `tailwind.config.js`,
  `index.html`) from a design handoff supplied as a zip
  (`Frontend wrapping project.zip`, extracted `GLITCH-HANDOFF.md` + a ready-to-
  apply `apply/web/` tree that mirrors the repo 1:1).
- **Look:** Silkscreen (display/wordmark/big numerals) + JetBrains Mono
  (everything else); single-hue token set — `--signal: #3DDC84` is the *only*
  color, replacing `--accent`/`--accent-2`/`--claude`/`--ok`/`--warn`/`--err`/
  `--cpu`; zero border-radius; hairline 1px borders; no shadows/blur; light
  "paper" analytical panels (`--paper`/`--ink`) for scoreboards/QR/sparklines;
  monochrome glyph state chips (`■`/`●`/`△`/`○`/`✕`) replacing color-coded
  states; square status dots; dot-grid empty states (`(STANDBY)`, `(NO
  PHONES)`, `(READY)`).
- **Verified pure re-skin, no logic/data/backend change** (this was explicitly
  double-checked because the user flagged the risk): `git diff --stat web/`
  touched only the 10 files above, nothing in `server/`/`mcp/`/`store.js`/
  `main.jsx`. Full `App.jsx` diff = class strings + inline style tokens +
  `String(online).padStart(2,'0')` display formatting only (`s.connected`/
  `online` still store-derived). The only 3 non-cosmetic diffs, all mandated by
  the handoff's component map: `Big({ label, value, last })` gained a styling-
  only prop; `StateChip` maps state → `[glyph, color]` instead of a color
  class; `Sparkline` renders discrete bars instead of a polyline (dropped the
  now-nonexistent `--accent-2` color prop). Every tab + WorkerView still calls
  `useStore()` and the same `/api/sessions`, `/api/sessions/:id`,
  `/api/config/onboarding` fetches. One `mock-fleet` grep hit was onboarding
  *command text* shown as styled copy, not mock data.
- Committed as `ac42000` (10 files, +394/-272), pushed to `origin/main`. Two
  unrelated commits pulled down afterward from a teammate's push:
  `99e7a69` (orchestrator crash guards + telemetry self-heal on hub restart)
  and `7d458fb` (mobile nav fits without scroll + History expanded by default)
  — fast-forwarded cleanly, no conflicts, nothing touched `demo/target-app/`.
- **`demo/target-app/` deliberately left dirty/uncommitted throughout** (the
  habit-tracker streak-stats feature from an earlier session) — never staged,
  never pushed. It stays as local-only working-tree changes so the demo app
  can be rebuilt fresh and live at the venue rather than replaying committed
  output. Standing rule, unchanged from earlier checkpoints.

## 2026-08-29 — Phase 9 scope cut: drop GenieX/Tier 3, WebView wrapper not native Compose UI
- **Decision:** Phase 9's original two-tier plan (Tier 2 Compose UI + LlamaServerEngine,
  Tier 3 in-process GenieX NPU inference) is cut down. **GenieX / Tier 3 /
  `EmbeddedEngine` are dropped entirely** — no in-process inference swap. Also
  **dropping the from-scratch Jetpack Compose worker-view UI** — the existing
  web worker view (`/worker/:id`) already satisfies the rubric's "big name,
  streaming pane, telemetry, tok/s, idle READY" requirements and rebuilding it
  natively would just be re-implementing working code for no functional gain.
- **New Phase 9 design:** a minimal native Android app that is a **fullscreen
  WebView shell** pointed at `http://<hub-ip>:4100/worker/<name>` (kiosk-style:
  no browser chrome, no nav bar, screen-awake). This alone satisfies "the demo
  must run on the phone as an installed app" for the rubric — zero web-side
  changes needed, the worker view is reused as-is.
  - Optional value-add kept: native telemetry via Android `BatteryManager`/
    `PowerManager` APIs POSTed to the existing heartbeat endpoint, replacing
    `phone/telemetry.sh` + the Termux:API dependency (more reliable — the
    current shell-script telemetry loop dies when Termux is backgrounded/OOM-
    killed, the #1 live-demo fragility noted in the earlier context-switch
    handoff).
  - Optional creative-phone-use hook kept: QR-scan-to-join instead of pasting
    the Termux one-liner, or auto-launch/re-register on boot.
  - Inference itself is untouched — Ollama (CPU) and `llama-server` (NPU) keep
    running exactly as today via Termux; the app doesn't touch inference, so
    there is no `InferenceEngine` interface to build or engine to swap.
- **Why:** smaller surface area for the remaining time, reuses 100% of proven
  Phase 4/5 dashboard work, and removes the riskiest/most speculative part of
  the original plan (GenieX bring-up was already flagged "timeboxed" and never
  started). Not yet implemented — this entry documents the scope decision only;
  see `docs/phases.md` Phase 9 for the updated task list.

## 2026-08-29 — Phase 9 walking skeleton BUILT: kiosk WebView app scaffolded at `app/`
- **What shipped:** the native Android kiosk wrapper from the scope-cut plan is
  scaffolded and building. Project at `sisyphus/app/` (Gradle, AGP 8.5.2, Gradle
  8.9, JDK 21). `./gradlew :app:assembleDebug` → ~19KB `app-debug.apk`,
  `com.sisyphus.worker`, label SISYPHUS, minSdk 26 / targetSdk 34.
- **Zero external deps by design:** framework `android.app.Activity` + `WebView`
  only — no appcompat, no Compose, no Kotlin. Keeps the build small and the only
  network need is AGP's own Kotlin transitives on first build (everything else was
  already in the local Gradle cache; a truly offline build fails on
  `kotlin-stdlib/kotlin-reflect 1.9.20` which AGP 8.5.2 pulls).
- **Structure:** `SetupActivity` (launcher) = GLITCH-styled form for hub `IP:PORT`
  (prefilled `192.168.137.1:4100` via `buildConfigField`) + phone name, saved to
  SharedPreferences (`Prefs.java`). `KioskActivity` = fullscreen immersive WebView
  → `http://<hub>:<port>/worker/<name>`, `FLAG_KEEP_SCREEN_ON`, `(RECONNECTING)`
  overlay that reloads every 3s on main-frame failure, long-press top-left corner
  to reopen setup.
- **Native chrome matches web GLITCH tokens** (not stock Material): Material-dark
  framework theme, `#0E0E0E` window/status/nav + splash (`values-v31`), green
  pixel-`S` adaptive icon (`#3DDC84` on `#0E0E0E`), monospace-bold wordmark
  approximating Silkscreen (real Silkscreen renders inside the WebView'd page).
  `usesCleartextTraffic=true` — the worker view is plain-http on the LAN.
- **Toolchain note:** real SDK is `~/AppData/Local/Android/Sdk` (platform
  android-34, build-tools 34.0.0/36.0.0, adb works). `/c/Program Files/Android`
  only holds Android Studio, not the SDK packages.
- **NOT yet proven on device:** no iQOO was attached at build time. Remaining:
  `adb install -r`, launch, confirm the worker view renders fullscreen and looks
  identical to the browser, and check kiosk feel (immersive, keep-awake, reconnect).
- **Termux unchanged:** app only replaces the last manual step of
  `docs/PHONE_SETUP.md` (open worker URL in Chrome). Inference plumbing identical.

## 2026-08-29 — Phase 9: per-phone task notifications via JS↔native bridge
- **Feature:** each kiosk phone posts a notification the instant a task is
  assigned to it and again when generation starts; tapping it opens/foregrounds
  the app. Requested by the user on top of the walking skeleton.
- **Design (bridge, not native polling):** the worker page already tracks its own
  task state, so the app doesn't re-derive it. `KioskActivity` exposes
  `window.SisyphusNative` (`NativeBridge.java`, `@JavascriptInterface`). `WorkerView.jsx`
  fires `assigned(title)` / `generating(title)` / `finished(title, ok)` on state
  transitions (`dispatched` → `generating` → `completed`/`failed`), deduped by a
  `notifiedRef` so each transition fires once. `Notifier.java` posts ONE reused
  notification id (1001) updated in place — heads-up buzz on assignment only
  (`setOnlyAlertOnce`), green-tinted (`setColor(#3DDC84)`) white pixel-`S` small
  icon (`ic_notification.xml`). Tap → `PendingIntent` to `KioskActivity`
  (`launchMode=singleTask`) so it comes to front instead of relaunching.
- **Web change is guarded:** the `window.SisyphusNative` calls no-op in a plain
  browser, so the worker page is unchanged outside the app's WebView. This is the
  first intentional web-side change to Phase 5's worker view (the scope-cut plan
  assumed zero); it's additive and browser-safe. Requires `npm run build` in
  `web/` so `web/dist` (served by the orchestrator) picks it up — done.
- **Perms/manifest:** added `POST_NOTIFICATIONS` (requested at runtime in
  `KioskActivity` on API 33+); `KioskActivity` now `singleTask`. Rebuilt APK
  (~28KB) still builds; feature NOT yet proven on device.

## 2026-08-30 — Phase 9 app: native chrome now uses the real web fonts + design system
- **Change:** the two native screens (SetupActivity, KioskActivity reconnect
  overlay) were approximating the GLITCH look with system `MONOSPACE`. Now they
  use the **actual** web fonts, bundled in `res/font`: Silkscreen (400/700) for the
  pixel display face, JetBrains Mono (400/500/700) for body — the same TTFs the web
  loads from Google Fonts. `Type.java` exposes `pixel()/pixelBold()/mono()/
  monoMedium()/monoBold()` via framework `getFont()` (minSdk 26) and a `dotField()`
  tiling drawable matching web `.dotfield` (radial dots, 22px grid).
- **Green-budget fix:** the CONNECT button was a full signal-green block, which
  violates the web's signal-green budget (green only for live squares / caret /
  tok-s). It's now an inverted `--text`/`--ink` block (like the active tab cell /
  NPU badge); green is reserved for a 7px status square by the wordmark and the
  pulsing 12px square on the reconnect overlay.
- **Reconnect overlay** now mirrors the web idle/empty state exactly: dot-field bg,
  pulsing signal square, `(RECONNECTING)` in real Silkscreen, wide-tracked micro
  caption. Pulse cadence matches web `.pulse` (blink 1.4s, full on/off).
- APK grew 30KB → ~430KB (bundled fonts). Still no external Gradle deps. Notification
  text stays system-rendered (platform constraint) but green-tinted + pixel-S icon.

## 2026-08-30 — CRITICAL demo fix: self-host web fonts (Google Fonts CDN dies on the LAN)
- **Bug (found via phone screenshots):** the worker view rendered in system
  monospace, NOT Silkscreen/JetBrains Mono, even though the native app login
  screen (bundled fonts) looked correct. Root cause: `web/index.html` loaded fonts
  from `fonts.googleapis.com`, and the demo hotspot has **no internet** → the CDN
  fetch fails → the page falls back to `monospace`. This is a WEB bug, not an app
  bug; it hits any browser on the phone too, and would have wrecked the whole
  GLITCH look at the live venue.
- **Fix:** self-host the fonts. Copied the 5 TTFs to `web/public/fonts/`, added 5
  `@font-face` rules at the top of `web/src/index.css` (Silkscreen 400/700,
  JetBrains Mono 400/500/700) pointing at `/fonts/*.ttf`, and REMOVED the Google
  Fonts `<link>` + preconnects from `web/index.html`. Rebuilt `web/dist` — fonts
  now ship in `dist/fonts/`, served by the orchestrator's `express.static`, so they
  load over the LAN with zero internet. Verified in-browser: with the CDN link
  gone, `(STANDBY)`/wordmark still render in Silkscreen (proof they come from
  `/fonts/`).
- **No new APK / no server restart needed:** `express.static` serves the rebuilt
  dist live and asset filenames are content-hashed; the phone just reloads the
  worker view (reopen the app). The existing installed APK is fine — the fix is
  entirely server-side.
- **Corrects the earlier wrong assumption** ("WebView renders the real page so it's
  automatically consistent") in the 2026-08-29 walking-skeleton entry: it's only
  consistent if the page's fonts actually load, which they didn't on the LAN.

## 2026-08-30 — App-side font fix: WebView was showing a stale/cached page
- **Why the web fix alone didn't fix the app:** KioskActivity is `singleTask`, so
  reopening just brings the existing instance to front — the WebView never
  re-fetched and kept the pre-rebuild (Google-Fonts, system-mono fallback) page.
  Cache made it worse.
- **App fixes (need reinstall):** (1) `shouldInterceptRequest` serves `/fonts/*.ttf`
  from the APK's own `assets/fonts/` — the GLITCH fonts now render in the WebView
  regardless of server dist freshness, cache, or internet; (2) `LOAD_NO_CACHE` +
  `clearCache(true)` so the page is never stale; (3) `onRestart()` reloads on
  return so a re-deployed page always shows. Fonts are now bundled twice (res/font
  for the native setup/overlay screens, assets/fonts for WebView interception) —
  APK ~866KB; acceptable, could de-dupe later via createFromAsset.
- Together with the web self-hosting fix, fonts are covered belt-and-suspenders.

## 2026-08-30 -- Phase 9 app DEVICE-PROVEN + the "post-login UI never changes" loop, solved
- **Symptom:** user reinstalled 4x; the login screen took the new GLITCH design but
  the post-login worker view "stayed exactly the same" (system mono, not Silkscreen).
- **Root-caused by tracing every layer instead of rebuilding blind:**
  1. Verified `web/dist` had the self-hosted `@font-face` + `/fonts/*.ttf` (200 OK
     from the live hub), and the worker page renders pixel-perfect GLITCH in a
     phone-sized browser -- so the SERVER was already correct.
  2. Verified the previous APK's compiled `classes2.dex` really did contain
     `shouldInterceptRequest`, `clearCache`, `SisyphusNative`, `onRestart` -- so the
     APK code was correct too.
  3. **The tests never ran against the fix:** hub telemetry showed all 3 phones last
     connected ~17:56 the day before, but the font fix only reached the server at
     00:24 that night. Every "try" saw the old page; the WebView also cached it. And
     because every build so far shared versionName 0.1/versionCode 1, Android could
     silently keep the old app on reinstall.
- **Fix (build 3.1 / versionCode 2):** (a) `BUILD 3.1` stamp on the login screen =
  instant proof of which build is actually running; (b) versionCode bump so new
  builds replace old ones and stale APK files are refused; (c) `?b=<versionCode>`
  appended to the worker URL = a cache key no old entry can answer; kept the prior
  `LOAD_NO_CACHE` + asset-font interception.
- **Proven on a real iQOO 15 (2026-08-30):** login in real Silkscreen, worker view
  in full GLITCH fonts, CONNECT resolves name->phoneId via `GET /api/phones`. APK is
  `worker view v3.apk` (~880KB), self-contained (fonts bundled), sent to the phones.
- **Still open:** notifications (JS->native bridge) are wired but not yet fired
  through a real task on-device (phones were offline/NPU down during this session).
- **Lesson reinforced:** when a fix "doesn't work," verify it actually reached the
  device before changing more code. Three layers were already correct; the bug was
  freshness (cache + version identity + test timing), not the fix.
- **Committed + pushed 2026-08-30:** `app/` (whole native project), the web font
  changes (`web/index.html`, `web/src/index.css`, `web/src/WorkerView.jsx`,
  `web/public/fonts/`), and docs. `demo/target-app/` deliberately NOT committed
  (stays pristine for a fresh live demo).

## 2026-08-30 — Phase 10: delegation brain (approval + deterministic gate + token efficiency)
Big rework of *how* Claude delegates, driven by four asks: (1) make SKILL.md
technical/accurate; (2) route through human approval on the dashboard; (3) bake
unit tests into each phone task; (4) replace "Claude reads every snippet" with a
deterministic gate + only read on failure. All backend/web/MCP/docs; **real
phones untouched — the gate runs entirely on the hub**. Not committed (standing
rule; `demo/target-app/` stays pristine and this includes its SKILL.md).

- **SKILL.md rewritten** to a real spec: tools table, capacity-budgeted
  decomposition, and the load-bearing filter — *if you can't write tests that
  would make you trust the output without reading it, the task is too big.*
  Teaches baked-in tests, `estTokens`/`confidence`, and apply-don't-read
  integration. It lives under `demo/target-app/.claude/skills/` so it's part of
  the never-commit demo tree.

- **Human-approved routing.** `engine.delegate` assigns least-loaded (unchanged),
  then sets each task `awaiting_approval`, emits `approval_pending {tasks,
  timeoutMs}`, and **blocks on a Promise** until `POST /api/session/approve
  {overrides}` resolves it — or a 120s timer auto-approves (`APPROVAL_TIMEOUT_MS`)
  so a headless/CI run never deadlocks. `overrides[taskId]='claude'` splices the
  task out of its phone queue and marks it `reassigned` (`fallback:true`,
  status `reassigned`). The pending table also rides the WS `hello` snapshot
  (`setSnapshotProvider` now merges `engine.pendingApproval()`), so a dashboard
  opened mid-wait renders it immediately — this was the one E2E miss on the first
  run (the test raced the WS open), fixed by handling both `approval_pending` and
  the `hello.approval` path.
- **ETA/confidence.** ETA = `estTokens ÷ tok/s + overhead`; tok/s prefers the
  session-observed per-phone average, else `ETA_TOK_PER_SEC` defaults
  (npu 20 / cpu 8). Confidence is Claude's own calibrated 0-100, passed through
  for the operator to judge what to toggle back.

- **Deterministic gate.** `validate()` now returns a structured `checks[]`
  (`{kind:'structure'|'syntax'|'regex', name, ok, detail?}`) instead of just
  first-error — so every check is a log row, not only the failing one. New
  `server/lib/test-runner.js` runs Claude-authored `tests` [{name, code}] where
  `code` is the body of `async (mod, assert)`: it writes the generated module +
  a zero-dep harness to a temp dir and runs them in a **child Node process**
  (20s overall / 5s per test via `TEST_RUN_TIMEOUT_MS`/`PER_TEST_TIMEOUT_MS`), so
  a hung or crashing generated module can't take the hub down. JS-only
  (`.js/.mjs/.cjs`); CJS-vs-ESM detected by a heuristic and written as `.cjs`/
  `.mjs` to sidestep package-type ambiguity; non-JS targets get a "skipped" row.
  Gate = validate checks + test rows; on fail, `describeGateFailure` feeds the
  exact failing checks into the one retry. Log emitted as `task_gate`, persisted
  to `tasks.gate_json` (schema column + `ALTER TABLE` migration for existing DBs),
  rendered as the worker-view `GateLog` panel (web + kiosk). New lifecycle state
  `testing` between `validating` and `completed`.
- **Why child-process, not vm/worker_threads:** the generated code is untrusted
  3B-model output; a separate process is the only clean hard-kill on an infinite
  loop, and it isolates `process.exit`/native crashes. Cost is ~1 spawn per
  tested task — negligible next to a 120s generation budget.

- **Token efficiency.** `result()` includes `code` ONLY when Claude must act on
  it (gate failed / fallback / reassigned); gate-passed code stays on the hub.
  `delegate`'s MCP text return summarizes gate-passed tasks and dumps full JSON
  only for `needsAttention`. Two new MCP tools: `sisyphus_apply` reads
  `GET /api/session/tasks` and writes gate-passed files to disk **from the MCP
  process cwd** (= demo project root via `.mcp.json`), path-traversal guarded,
  contents never returned; `sisyphus_fetch` returns one task's code + full gate
  log for deliberate inspection. `listSessionTasks()` serves both and falls back
  to the most-recent stored session if none is active (so `apply` works after
  `complete`). MCP is now **6 tools**; `DELEGATE_TIMEOUT_MS` = 600s (was 150s)
  to cover approval + generation.

- **Verified (all green):**
  - E2E (`scratchpad/e2e-gate-test.mjs`, isolated hub :4180 + scratch DB + mock
    fleet): 15/15 — gate-pass with code withheld (5/5 checks), gate-fail on a
    real `'2' !== 5` assertion diff → retry → fallback WITH salvageable last
    code, operator reassignment honored, `approval_pending`/`approval_resolved`/
    `task_gate` all emitted, and `complete` stats correct (1 on-device / 2 cloud).
  - MCP stdio smoke (`scratchpad/mcp-smoke.mjs`): 6 tools registered; `apply`
    wrote `src/echo.js` to disk and the output confirmed the code was NOT
    returned through the tool; `fetch` returned code + gate log.
  - Browser walkthrough: approval table with all columns, PHONE↔CLAUDE toggle
    flipped model→claude + ETA→— + button→"1 → PHONES · 1 → CLAUDE", approve
    dispatched, worker view showed `■ PASSED 5/5` with named per-test rows +
    timings. Dashboard rebuilt (`vite build`, clean, 34 modules).
- **Gotcha:** the reassignment splice originally used `indexOf` unguarded — a
  miss returns -1 and `splice(-1,1)` removes the wrong item. Guarded to only
  splice when `i >= 0`.
- **Files:** `server/{config,engine,index}.js`, `server/lib/{validate,test-runner}.js`,
  `server/db/{schema.sql,index.js}`, `server/routes/session.js`, `mcp/index.js`,
  `web/src/{store.js,WorkerView.jsx}`, `web/src/components/ui.jsx`,
  `web/src/tabs/Orchestration.jsx`, and docs (architecture, README, phases, prd,
  design, this entry) + the un-committed `demo/target-app/.../SKILL.md`.

## 2026-08-30 — demo/target-app removed; skill + .mcp.json relocated to repo root
- **What:** deleted `demo/target-app/` (the Habit Tracker demo app) entirely, per
  operator decision. Before deleting, moved the two files that are product logic,
  not demo run-state:
  - `demo/target-app/.claude/skills/sisyphus/SKILL.md` → **`.claude/skills/sisyphus/SKILL.md`** (repo root)
  - `demo/target-app/.mcp.json` → **`.mcp.json`** (repo root; `args` fixed from
    `../../mcp/index.js` to `mcp/index.js`)
- **Why:** the SKILL.md is the delegation brain — leaving its only copy inside a
  directory that gets reverted "to pristine" meant the Phase 10 rewrite could be
  wiped. At the root it travels with the repo, and `/sisyphus` works from the
  repo root out of the box. The demo now targets **any project**: copy
  `.mcp.json` + `.claude/skills/sisyphus/` into it (`sisyphus_apply` writes
  gate-passed files to Claude Code's cwd, so the target is wherever Claude Code
  is opened).
- **Supersedes:** the standing rule "`demo/target-app/` must never be committed /
  stays pristine for the demo" — obsolete, the directory no longer exists. The
  skill + `.mcp.json` at the root SHOULD be committed like any product code.
- **Verified no runtime impact:** zero references to `target-app`/`demo/` in
  `server/`, `mcp/`, `web/` (grep). Hub (`npm start`) + ws-tap left running
  untouched. Killed one leftover `node server.js` (PID 29300) — the old Habit
  Tracker dev server, which was holding a cwd lock on the folder.
- **Docs updated:** README (demo section + layout tree), demo/DEMO_SCRIPT.md
  (target-agnostic seed prompt, checklist, reset, gate in minute-by-minute),
  docs/VENUE_RUNBOOK.md Part E, docs/prd.md demo flow step 2,
  docs/architecture.md skill heading, docs/phases.md Phase 10 path note.
  Historical log entries mentioning target-app left as-is (they are records).

## 2026-08-30 — cloud-savings metric (₹) + gold "CLOUD SPEND AVOIDED" banner

- **What:** every gate-passed on-device task now carries the cloud cost it
  avoided, in USD and INR, end-to-end: `server/config.js` `CLOUD_PRICING`
  (env-overridable `SISYPHUS_CLOUD_MODEL` / `SISYPHUS_USD_PER_MTOK_OUT` /
  `SISYPHUS_USD_INR`) → engine adds `savedUsd`/`savedInr` to `task_result` +
  the hello snapshot, and `cloudCostSavedUSD`/`cloudCostSavedINR`/`pricing` to
  session stats → UI shows ₹ beside every tok/s stat (Orchestration task cards
  AND the worker view — which is also what the Android kiosk app renders) plus
  a big gold "CLOUD SPEND AVOIDED" banner that pops onto the top of the
  Orchestration tab on the first rupee, with a fun-fact line
  (`web/src/lib/cost.js` — chai/vada-pav/dosa ladder + Harry Potter pages).
- **Methodology (the defensible part, deliberately a floor):** on-device output
  tokens × cloud OUTPUT rate only. Excluded on purpose: input-side costs and
  the fact that applied code never re-enters Claude's context — so the shown
  number understates the true saving and survives judge scrutiny. Counts only
  `status === 'completed' && !fallback` (i.e. gate-passed on-device); fallback /
  reassigned tasks save ₹0.
- **Rates verified 2026-08-30:** Claude Opus 5 API output **$25/MTok** (input
  $5 — unused by the metric); **$1 = ₹95.4**. Both are config, not hardcoded in
  the UI (the hub ships `pricing` in the WS hello; `web/src/lib/cost.js` has
  matching display fallbacks).
- **Design:** new tokens `--gold #c9a227` / `--gold-border` / `--gold-deep` +
  `.dotfield-gold` + `.pop-in` — the banner is a darker-yellow sibling of the
  cream `--paper` scoreboard (same ink-on-panel treatment), so it stays inside
  the monochrome GLITCH system.
- **Verified live:** second hub on :4199 + mock fleet + dev delegate → banner
  ₹0.28 / $0.003 / 115 tok / 3 tasks + "2% of a cutting chai and climbing";
  task cards "₹0.10 saved" beside tok/s; worker view "₹0.10 CLOUD SAVED" in
  gold beside TOK/S. Vite build + node --check clean.
- **NOTE:** the long-running hub on :4100 predates this change — restart
  `npm start` to pick up the new server fields + rebuilt dashboard.
- **Docs updated:** architecture.md (task_result fields, hello pricing, new
  §Cloud-savings metric), DEMO_SCRIPT.md (2:10 beat now points at the banner),
  prd.md (demo flow step 7), SKILL.md (final summary includes ₹ saved).

## 2026-08-30 — /sisyphus works against any project (SISYPHUS_HOME)

- **Problem:** `.mcp.json` launched the MCP server with a *relative* arg
  (`node mcp/index.js`), so it only resolved when Claude Code was opened at the
  sisyphus repo root. The "copy `.mcp.json` + the skill into any project" flow
  in the demo docs was silently broken — no `mcp/` dir in the target → server
  never starts → `/sisyphus` just falls back to Claude doing everything.
- **Fix:** `.mcp.json` now uses `node ${SISYPHUS_HOME:-.}/mcp/index.js` (+
  `SISYPHUS_ORCH` defaulted the same way). Claude Code expands `${VAR:-default}`
  in args at startup (verified via code.claude.com/docs/en/mcp). Unset → `.` →
  repo-root flow unchanged, zero config. Set to the sisyphus checkout → absolute
  path, so the server launches from anywhere.
- **Why it's correct:** node resolves the script AND its node_modules from the
  script file's location (walks up from `mcp/index.js`), NOT from cwd — verified
  by importing the server from a foreign scratch cwd (deps `@modelcontextprotocol/sdk`
  + `zod` resolved fine). Meanwhile `process.cwd()` stays the dir Claude Code was
  opened in, which is exactly what `sisyphus_apply` uses to write gate-passed
  files — so they land in the *target* project's tree.
- **Usage for another project:** copy `.mcp.json` + `.claude/skills/sisyphus/`
  in, then `PowerShell: $env:SISYPHUS_HOME="C:\path\to\sisyphus"` (or
  `export SISYPHUS_HOME=/path/to/sisyphus`) BEFORE launching Claude Code from
  that same shell.
- **Docs updated:** README (Running the demo), demo/DEMO_SCRIPT.md (intro block +
  checklist), docs/VENUE_RUNBOOK.md Part E, docs/architecture.md (new
  Launch/portability note under the MCP server section).
