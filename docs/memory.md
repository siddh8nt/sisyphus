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
