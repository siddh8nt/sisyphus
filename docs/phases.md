# Sisyphus — Phase Plan & Progress

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (checks passed). Record the
date each phase passes.

> **PHASE 10 — DELEGATION BRAIN UPGRADE (2026-08-30).** Reworked the skill +
> orchestration pipeline around three new properties, all verified end-to-end
> against the mock fleet (15/15 E2E checks + MCP stdio smoke both green) and in
> the live dashboard: (1) **human-approved routing** — `delegate` now assigns
> phones then blocks on a dashboard approval table (phone/task/model/ETA/
> confidence/tests, per-row PHONE↔CLAUDE toggle, approve button; auto-approves
> after 120s so headless never deadlocks). (2) **Deterministic gate replaces
> "Claude reviews every snippet"** — every output runs structure→syntax→regex
> `checks`→Claude-authored unit `tests` in a sandboxed child Node process
> (`server/lib/test-runner.js`, 20s/5s timeouts); per-check log streams as
> `task_gate`, persists to `tasks.gate_json`, renders on the worker view (web +
> kiosk app). (3) **Token efficiency** — `delegate` returns code ONLY for
> gate-failed/fallback/reassigned tasks; two new MCP tools, `sisyphus_apply`
> (writes gate-passed files to disk, code never enters context, path-guarded)
> and `sisyphus_fetch` (one task on demand). SKILL.md rewritten to a full spec
> (tools table, capacity-budgeted decomposition, baked-in tests). MCP now 6
> tools. Dashboard rebuilt. **Not committed** (per standing rule); see the
> matching memory.md entry. Full detail in Phase 10 below.
> **PHASE 9 APP DEVICE-PROVEN (2026-08-30).** `worker view v3.apk` installed on a
> real iQOO 15: GLITCH login (real Silkscreen) + worker view render correctly in
> full GLITCH fonts; CONNECT resolves name→phoneId over `GET /api/phones`. Fixed
> the long "post-login UI never updates" loop — two causes: (1) the demo hotspot
> has no route to Google Fonts, so the WebView fell back to system mono; now the
> 5 TTFs are self-hosted three ways (hub `web/public/fonts` + `@font-face`, native
> `res/font`, and `assets/fonts` injected via `shouldInterceptRequest`); (2) stale
> install/WebView cache masked new builds — added a `BUILD x.y` stamp + versionCode
> bump + `?b=` cache-buster + `LOAD_NO_CACHE`. Notifications wired (JS→native
> bridge) but not yet proven through a real task run on device. Full detail in
> memory.md. **Committed 2026-08-30.**
> **STATUS: AT THE VENUE, LIVE (2026-08-29). Phase 8 hardware acceptance PASSED.**
> All 3 iQOOs onboarded (CPU) + NPU-deployed (v81). Real parallel run: 3/3 on
> NPU, 574 cloud tokens saved, 16.7s, 0 fallback. NPU bundle BUILT.
> **Phase 6.5 CLOSED (2026-08-29, siddh's machine).** Chaos test PASSED:
> NPU-kill → health-check flip (~10s) → CPU takeover, narrated; full phone
> drop (`am force-stop com.termux`) → graceful exclusion + redistribution, 0
> cloud fallback. Controlled NPU-vs-CPU bench DONE: **avg 2.1x decode speedup,
> avg 11.2x prefill/TTFT speedup** (real pitch stat, see memory.md).
> **Polished human /sisyphus demo run PROVEN (2026-08-29, real hardware):**
> ran the exact `demo/DEMO_SCRIPT.md` prompt end-to-end — 3 on-device / 2
> cloud / 2 NPU / 561 tokens saved / ~5m11s, 0 fallback, review caught + fixed
> 2 real small-model bugs before integrating. `demo/target-app/` reverted to
> pristine afterward on purpose — the demo should run fresh live, not replay
> a committed result. Full details in memory.md (session d294eb3c).
> **CONTEXT SWITCH CHECKPOINT #2 (2026-08-29):** siddh's usage limit —
> handing off to a teammate's machine. Read the last 2 memory.md entries
> first. Orchestrator is running on siddh's machine (started manually, not
> tracked by any background job) — decide whether to keep that as hub or
> move it. Fleet last known: iqoo-2/iqoo-3 online+NPU-healthy; iqoo-1 online
> but NPU died from idle (cleanly fell back to CPU), not revived.
> **NEXT:** (1) re-establish the hub (same machine or new) + re-attach the 3
> iQOOs · (2) Phase 7 real-phone prompt tuning · (3) rehearse the proven demo
> prompt live · (4) Phase 9 — fullscreen kiosk WebView wrapper around the
> existing worker view (GenieX/Tier 3 dropped, no native UI rebuild), if time
> allows.
> **UI re-skin done (2026-08-29, siddh's machine).** Dashboard restyled to the
> "GLITCH" design system (Silkscreen/JetBrains Mono, single-hue `--signal`
> green, zero radius, monochrome glyph states) — pure visual change, verified
> no data/logic/backend touched. Committed `ac42000`, pushed to `origin/main`;
> pulled 2 unrelated teammate commits (crash guards + mobile nav fix)
> afterward, fast-forward, no conflicts. Full verification detail in
> memory.md.
> **Phase 9 scope cut (2026-08-29).** Dropped GenieX/Tier 3 (in-process NPU
> inference) and the from-scratch Compose UI entirely. New plan: a native
> Android app is just a fullscreen kiosk WebView around the existing
> `/worker/:id` page — reuses Phase 5's worker view as-is, no inference
> changes. Optional stretch: native BatteryManager/PowerManager telemetry
> replacing the fragile `telemetry.sh` loop. See Phase 9 below + memory.md.

---

## Phase 0 — Scaffold & docs
Tasks:
- [x] Monorepo (npm workspaces: server, mcp, web), `.gitignore`
- [x] All six docs written (architecture transcribes §3; phases transcribes plan)
- [x] `git init`
- [x] `npm install` clean on Windows (better-sqlite3 bumped to ^13 for Node 24 prebuild)
- [x] GitHub repo created + pushed → https://github.com/siddh8nt/sisyphus (private)
- [x] README quickstart

**Acceptance:** `npm install` clean on Windows; all six docs exist & complete.
**Status:** [x] PASSED · **Passed:** 2026-08-29

---

## Phase 1 — Core server, registry, mock phones, event bus
Tasks:
- [x] Orchestrator: Express + WS on :4100
- [x] Phone registration, heartbeats, health checks (endpoint grouping by name)
- [x] SQLite schema + init
- [x] WS event bus + `hello` snapshot
- [x] Mock fleet (3 phones, ports 11501-3, + 1 mock NPU endpoint 11511)
- [x] `scripts/ws-tap.js`

**Acceptance:** `npm start` + `npm run mock-fleet` → `GET /api/phones` shows 3
online phones w/ telemetry; kill one → offline within 10s; ws-tap sees
`phone_update`. → ALL VERIFIED LIVE.
**Status:** [x] PASSED · **Passed:** 2026-08-29

---

## Phase 2 — Task engine
Tasks:
- [x] Worker client: Ollama + OpenAI adapters, streaming, 120s timeout
- [x] `server/prompts/worker.md` + prompts/build.js
- [x] Validation pipeline (extract/reject/syntax/checks), retry, fallback
- [x] Parallel dispatch, per-phone FIFO queue, least-loaded
- [x] Stats accounting → SQLite
- [x] Dev route `POST /api/dev/delegate` (+ /api/session/* + /api/sessions read)

**Acceptance:** 3 tasks via dev route fan out to 3 mocks concurrently
(overlapping `generating` in ws-tap), all complete, token stats in SQLite; a
task with failing `checks` retries once then falls back. → ALL VERIFIED (3 tasks
`generating` at same ts on 3 phones, 2.1s wall vs ~5s serial; NPU preferred on
mock-1; retry-once-then-fallback narrated; tokens+code persisted).
**Status:** [x] PASSED · **Passed:** 2026-08-29

---

## Phase 3 — MCP server + skill + demo project
Tasks:
- [x] Four MCP tools (stdio, thin HTTP client): status/log/delegate/complete
- [x] Demo Habit Tracker app (`demo/target-app/`, 6 files) — runs, serves habits
- [x] `/sisyphus` SKILL.md + `.mcp.json`
- [x] `demo/DEMO_SCRIPT.md`

**Acceptance:** Real Claude Code session in `demo/target-app` runs `/sisyphus
<prompt>` end-to-end vs mock phones: real reasoning flows, code returns, Claude
integrates, app runs, summary table prints.
**Status:** [x] Orchestration path VERIFIED (drove the real MCP server over stdio,
launched exactly as `.mcp.json` does from the demo cwd: status→log→delegate→
complete; real demo decomposition returned valid code from 3 phones in parallel
w/ NPU; stats correct: 5 total/3 on-device/1 NPU/153 saved). Demo app runs.
The literal human-driven `/sisyphus` session (Claude reads SKILL.md + integrates
+ runs the app) is bundled into the Phase 4 watchable demo. · **Passed:** 2026-08-29
(code-complete; live human run pending w/ Phase 4)

---

## Phase 4 — Dashboard
Tasks:
- [x] Configure tab (status, MCP helper, QR, setup one-liner, live phone list)
- [x] Orchestration tab (reasoning feed, plan cards, live task cards, scoreboard)
- [x] Phone Vitals tab (per-phone cards, sparklines, runtime badges)
- [x] History tab (past sessions from SQLite, expandable task tables)
- [x] `vite build` served at `/` (SPA fallback; worker route)

**Acceptance:** Re-run Phase 3 demo watching dashboard on laptop + phone
viewport: Orchestration streams live; Vitals shows 3 phones moving; History shows
session; Configure shows QR + copyable command. → VERIFIED via in-app browser
(a11y tree): live 6-task session streamed reasoning/plan/6 task cards w/ code +
NPU/CPU badges + scoreboard (246 saved, 4.3s); Vitals 3 phones w/ live
telemetry+sparkline; History 2 sessions w/ expandable task table; Configure QR +
setup cmd + live phone list; worker view idle READY; mobile single-column nav; 0
console errors. (Visual screenshots N/A — pane not displayed; a11y tree
authoritative.)
**Status:** [x] PASSED · **Passed:** 2026-08-29

---

## Phase 5 — Worker view + telemetry ingestion
Tasks:
- [x] `/worker/:id` streaming output + telemetry + token counter + tok/s
- [x] Idle "READY" state; PWA manifest + apple-mobile-web-app meta
- [x] Legible at 1.5m (name clamp 3xl–5xl, telemetry 2xl–4xl)
- [x] Telemetry ingestion (heartbeat endpoint — done Phase 1)

**Acceptance:** worker view for a mock phone streams live during a session, shows
telemetry, idle looks good, legible at 1.5m in mobile viewport. → VERIFIED:
mock-1 worker tracked its 3 queued tasks live (streamed code + tok/s), telemetry
moved (temp rose while busy), idle READY confirmed pre-session, big type.
**Status:** [x] PASSED · **Passed:** 2026-08-29

---

## Phase 6 — Real-phone onboarding (OnePlus 13s)
Tasks:
- [ ] Finalize `setup.sh` / `telemetry.sh`, served templated
- [ ] `docs/PHONE_SETUP.md`
- [ ] Guide user: hotspot, firewall rule, Termux + Termux:API, one-liner, model pull
- [ ] Full demo: 1 real + 2 mock phones

**Acceptance:** full `/sisyphus` demo with OnePlus doing ≥1 real on-device task;
real telemetry + token counts. Record real tok/s in memory.md.
**Status:** [ ] · **Passed:** —

---

## Phase 6.5 — NPU runtime bring-up (now iQOO-first; OnePlus skipped by user)
Tasks:
- [x] RESEARCH: current upstream llama.cpp Hexagon recipe → `docs/NPU_SETUP.md`
  (arch v81 = iQOO 15 / 8 Elite Gen 5 confirmed supported; Q4_0; Docker toolchain
  v0.7; on-device run contract from run.py)
- [x] `deploy-npu.ps1` / `start-npu.ps1` (+ `build-npu.ps1` one-time Docker build).
  All ASCII, parse-clean.
- [x] Laptop pre-flight: adb present (v37.0.1 at LOCALAPPDATA SDK; scripts
  auto-detect it, no PATH change). Docker present (29.5.2).
- [x] Build the bundle (Docker) + download Q4_0 model → phone/npu/bundle/
  — DONE 2026-08-29 on akshat's laptop (fresh Docker install, no stale-socket
  crash). Bundle has bin/llama-server + all HTP libs incl. libggml-htp-v81.so
  (iQOO 15); model Qwen2.5-Coder-3B-Instruct-Q4_0.gguf (1.83 GB, size+magic
  verified). adb r37.0.1 installed. See memory.md.
- [x] iQOO in hand: enable USB debugging, deploy, register NPU endpoint
  — DONE 2026-08-29, iqoo-1 (SM8850/v81): bundle+model pushed over USB,
  llama-server on HTP0, NPU+CPU endpoints grouped, real code returned on NPU.
- [x] Benchmark NPU vs CPU tok/s + prefill → memory.md
  — CONTROLLED bench DONE 2026-08-29 (`server/scripts/bench.js`, real prod
  code path, identical prompt on all 3 phones): **avg 2.1x decode speedup
  (8.92 vs 4.31 tok/s), avg 11.2x prefill/TTFT speedup (919ms vs 10.3s)**.
  This supersedes the earlier uncontrolled 9.6-vs-4.4-8.2 signal (mixed task
  sizes) as the real pitch stat. Full per-phone table in memory.md.
- [x] Chaos test: kill NPU mid-session → seamless CPU fallback, narrated
  — DONE 2026-08-29 on siddh's machine, real hardware. Two tests, both PASS:
  (1) killed iqoo-2's NPU via `start-npu.ps1 -Stop`; health check flipped
  npu→unhealthy + activeRuntime→cpu within ~10s (no manual step); a fresh
  delegate run then routed iqoo-2's task straight to CPU (`fallback:false`,
  valid code) while iqoo-1/iqoo-3 stayed on NPU — 0 cloud tokens.
  (2) `adb shell am force-stop com.termux` on iqoo-2 (kills ollama + telemetry
  together — the actual "Android backgrounds/OOM-kills Termux" live-demo risk,
  not a synthetic one) — phone flipped fully `offline` within ~10s (both
  endpoints unhealthy). A delegate run then excluded iqoo-2 entirely and
  redistributed its share to iqoo-1/iqoo-3 (least-loaded: 1/2 split) — all 3
  tasks completed on NPU, 0 cloud fallback needed. Fleet restored afterward
  (re-ran setup.sh + start-npu.ps1 on iqoo-2) — verified 3/3 online, npu
  healthy. Note: `adb shell pkill ollama` fails with "Operation not permitted"
  — ollama runs under Termux's app UID, unreachable by the unprivileged `shell`
  user; `am force-stop` is the correct privileged tool for killing a Termux
  server from adb.

**Acceptance:** full demo where a phone completes a task on Hexagon NPU (NPU
badge, `usage` counts) AND a forced-failure run with seamless CPU fallback.
Time-box: 2 sessions → Plan B (NexaSDK) → 2 sessions → ship CPU-only, document.
**Status:** [x] PASSED (all tasks done — chaos test + controlled bench) ·
**Passed:** 2026-08-29

---

## Phase 7 — Hardening & demo polish
Tasks:
- [x] Timeout/chaos tests: kill phone mid-generation → retry→Claude fallback
  (~0.6s, no hang); kill NPU endpoint → transparent CPU switch, narrated. BOTH PASS.
- [x] Robustness: abandoned-session self-heal (new prompt → fresh session, stats
  don't accumulate if sisyphus_complete was missed)
- [x] Dashboard empty/error states (0 phones, no session, reconnecting) verified
- [~] Tune worker prompt vs real outputs — 1 real run done (see below), 2
  small-model bugs found + fixed by hand at review time (digit slip in a hex
  color, invalid bare CSS value); prompt itself didn't need changing, the
  skill's own "review before integrating" step absorbed both. More real runs
  would sand down further but the flow is proven.
- [x] Tune demo prompt for reliable ~3/2 split — CONFIRMED on real hardware
  2026-08-29: `demo/DEMO_SCRIPT.md`'s exact prompt produced 3 on-device / 2
  cloud, 0 fallback, first try.
- [x] `DEMO_SCRIPT.md` run sheet + pre-demo checklist + contingencies
- [ ] (stretch) qwen2.5-coder:7b on one phone CPU (needs phone)

**Acceptance:** 3 consecutive flawless mock rehearsals (→ 3/3 PASS, consistent
3 on-device/2 cloud/1 NPU/153 saved/~3.8s); 1 flawless real-phone run — DONE
2026-08-29: 3 on-device (2 NPU/1 CPU) / 2 cloud / 561 tokens saved / ~5m11s,
0 fallback, reviewed + integrated cleanly (session d294eb3c, full detail in
memory.md). `demo/target-app/` reverted to pristine after, so the venue run
is a fresh live demo, not a replay.
**Status:** [x] PASSED (mock hardening + 1 real-phone run both done) ·
**Passed:** 2026-08-29

---

## Phase 8 — iQOO day
Tasks:
- [x] Per phone: join hotspot → Termux → one-liner `--name iqoo-N` (all 3 CPU
  online; Termux:API APK still needed for battery/temp — see memory.md)
- [x] Then USB debugging + `deploy-npu.ps1` each — all 3 iQOOs on NPU (v81),
  each CPU+NPU healthy. deploy script fixed (adb-hang) so 2/3 registered hands-off.
- [x] Full 3-real-phone rehearsal — TWO real runs: (a) mixed 1 NPU/2 CPU, 3
  on-device/404 saved/23.2s; (b) **all 3 on NPU**, 3 on-device/3 NPU/574 saved/
  16.7s, 0 fallback (2026-08-29).

**Acceptance:** 3 iQOO online, full run, all three generating in parallel, max
NPU badges (target 3).
**Status:** [x] PASSED (hardware orchestration: 3/3 NPU, parallel, real code).
Polished human /sisyphus run in Claude Code still to demo. · **Passed:** 2026-08-29

---

## Phase 9 — Native Android worker-view wrapper [SCOPE CUT 2026-08-29, LOCKED PLAN]
Additive layer, started ONLY once Phases 0-8 are bulletproof. Banks the iQOO
Hackathon's phone-first score (25% device telemetry: creative phone use + Office
Kit; "demo must run on the phone").

> **SCOPE CUT (2026-08-29):** GenieX / Tier 3 / in-process NPU inference is
> **dropped entirely** — no `InferenceEngine` interface, no engine swap. The
> from-scratch Jetpack Compose worker-view UI is also dropped — the existing
> web worker view (`/worker/:id`, Phase 5) already meets the bar (big name,
> streaming pane, telemetry, tok/s, idle READY) and is reused as-is instead of
> being rebuilt natively. See the matching entry in `docs/memory.md`.

**Design (current):** a minimal native Android app that is a **fullscreen
WebView shell**, kiosk-style (no browser chrome/nav bar, screen-awake), pointed
at `http://<hub-ip>:4100/worker/<name>`. This alone makes "an installed app is
the phone's demo surface" true for the rubric with zero web-side changes.
Inference (Ollama CPU / llama-server NPU via Termux) is completely untouched —
the app never talks to the model, only displays the existing dashboard page.
The WebView renders the live worker page, so it inherits the GLITCH *layout*
(Silkscreen/JetBrains Mono, single-hue `--signal` green, zero radius) — but NOT
the fonts "for free" (this assumption was wrong, see below): the demo hotspot has
no route to Google Fonts, so the page fell back to system monospace on-device.
Fixed by self-hosting the 5 TTFs three ways — served by the hub (`web/public/fonts`
+ `@font-face` in `index.css`, CDN `<link>` removed), bundled in `res/font/` for
native views, and bundled in `assets/fonts/` and injected into the WebView via
`shouldInterceptRequest` so `/fonts/*.ttf` resolve even if the server dist is stale
or offline. Every native-chrome surface the WebView doesn't cover (splash, icon,
status/nav bar, setup + reconnect screens) is styled with the same GLITCH tokens.

**Prereq:** Android Studio + JDK + Android SDK on the laptop (adb already present).

**Tasks:**
- [x] WALKING SKELETON FIRST (before anything else): app installs on the iQOO,
  loads `/worker/<name>` fullscreen, looks identical to the current browser
  worker view. **Built + DEVICE-PROVEN (2026-08-30).** Project at `app/` (zero-dep
  Java + framework `WebView`, no appcompat/Compose/Kotlin), `assembleDebug` →
  `worker view v3.apk` (~880KB with bundled fonts; `com.sisyphus.worker`, minSdk
  26, targetSdk 34, versionName 3.1/versionCode 2). Installed on a real iQOO 15:
  login screen renders in real Silkscreen, worker view renders in full GLITCH
  fonts, CONNECT resolves the phone name → phoneId via live `GET /api/phones`.
  A `BUILD 3.1` stamp on the login screen + a `?b=<versionCode>` cache-buster on
  the worker URL exist so a stale install/cache can never masquerade as the new
  build again (root cause of the "post-login UI never changes" loop).
- [x] Kiosk mode: hide system UI, keep screen awake (`FLAG_KEEP_SCREEN_ON`),
  auto-reload on connection drop. Immersive-sticky, `(RECONNECTING)` overlay
  retries every 3s on main-frame failure; long-press top-left corner reopens
  setup. (Verify feel on device.)
- [x] Match native chrome to the web GLITCH palette: splash screen (`--bg`
  #0E0E0E background, Silkscreen wordmark), app icon, status bar color, and any
  loading/reconnect screen use the same tokens as `web/src/index.css`
  (`--bg`, `--signal` #3DDC84, `--text`) — no stock Android blue/Material look.
  Done: framework Material-dark theme (`res/values/themes.xml` + `values-v31`
  splash), `#0E0E0E` status/nav bar, green pixel-`S` adaptive icon, monospace-bold
  wordmark on the setup/overlay screens (real Silkscreen only in the Web'd page).
- [x] Phone notification on task assignment + generation start; tap opens the app.
  JS→native bridge (`window.SisyphusNative`, `NativeBridge`/`Notifier`): the worker
  page fires `assigned`/`generating`/`finished` on its own state transitions
  (`dispatched`→`generating`→`completed`/`failed`); the app posts a single
  heads-up notification (green-tinted pixel-`S` small icon) updated in place, tap
  → `singleTask` KioskActivity to front. `POST_NOTIFICATIONS` requested at runtime.
  Web change is guarded (no-op in a plain browser). Needs device proof.
- [ ] (optional value-add) Native device telemetry via Android APIs
  (BatteryManager / PowerManager) → POST to the existing heartbeat endpoint,
  replacing `phone/telemetry.sh` + the Termux:API dependency. Motivation: the
  current shell-script telemetry loop dies when Termux is backgrounded/OOM-
  killed — the #1 live-demo fragility flagged in the 2026-08-29 context-switch
  handoff (`docs/HANDOFF_2026-08-29.md` §6).
- [ ] (optional) One phone-feature for "creative phone use" 15%, e.g. QR-scan-
  to-join instead of pasting the Termux setup one-liner, or auto-launch/
  re-register on boot.
- [ ] Office Kit so the demo/dashboard runs on the phone -> Office Kit 10%.

**Open question:** the "run Claude Code on the phone" demo mechanic - Claude Code
is a CLI, not the Claude mobile app. Decide the actual on-phone agent surface when
we get here (likely: laptop Claude Code mirrored to the phone via Office Kit).

**Acceptance:** demo runs on the iQOO phone inside the installed app (not a
browser tab); device telemetry registers phone use + Office Kit; core demo
still passes untouched.
**Status:** [ ] FUTURE (after core is solid) · **Passed:** —

---

## Phase 10 — Delegation brain: approval + deterministic gate + token efficiency
Rework of the `/sisyphus` skill and orchestration pipeline so delegation is
smarter, human-supervised, and genuinely token-efficient. Backend + web + MCP +
docs; real phones untouched (the gate runs entirely on the hub).

Tasks:
- [x] **Skill rewrite** (`demo/target-app/.claude/skills/sisyphus/SKILL.md` at
  the time; relocated 2026-08-30 to repo root `.claude/skills/sisyphus/SKILL.md`
  when `demo/target-app/` was removed):
  tools table; capacity-budgeted decomposition (≤120-line outputs vs the 3B
  model's 4096-ctx/1200-token cap); the core filter — *if you can't write tests
  that make you trust the output without reading it, the task is too big*;
  baked-in tests + `estTokens`/`confidence` per task; apply-don't-read
  integration.
- [x] **Human-approved routing.** `delegate` assigns least-loaded, emits
  `approval_pending` with the routing table, and blocks until
  `POST /api/session/approve {overrides}` (or auto-approves after 120s,
  `APPROVAL_TIMEOUT_MS`). `overrides[taskId]='claude'` marks a task `reassigned`
  and returns it to Claude undispatched. Table also rides the WS `hello`
  snapshot so a mid-wait dashboard shows it. ETA = `estTokens ÷ tok/s`
  (session-observed per phone, else per-runtime defaults) + fixed overhead.
- [x] **Deterministic gate** (`server/lib/validate.js` structured per-check
  output + new `server/lib/test-runner.js`): structure → syntax → regex
  `checks` → baked-in unit `tests` executed in a sandboxed child Node process
  (20s overall / 5s per test; ESM+CJS handled; JS targets only, others report a
  skipped row). One retry feeds the exact failing checks back. Per-check log
  `{kind,name,ok,detail?,durationMs?}` emitted as `task_gate`, persisted to
  `tasks.gate_json` (schema + migration), rendered on the worker view.
- [x] **Token efficiency.** `delegate` result includes `code` only for
  gate-failed/fallback/reassigned tasks; new MCP tools `sisyphus_apply` (writes
  gate-passed files to disk without returning contents, path-traversal guarded)
  and `sisyphus_fetch` (one task's code + full gate log, on demand). MCP now 6
  tools; `DELEGATE_TIMEOUT_MS` raised to 600s to cover approval + generation.
- [x] **Web** (`store.js`, `Orchestration.jsx`, `WorkerView.jsx`, `ui.jsx`):
  `ApprovalTable` component, `GateLog` panel on the worker view, new
  `awaiting_approval`/`testing` state glyphs, gate result on task cards, and
  `approval_pending`/`approval_resolved`/`task_gate` reducers.
- [x] **Docs:** architecture.md (gate + approval + 6-tool contract + schema),
  README (intro + demo flow + tool count), SKILL.md, prd.md demo flow, design.md
  component inventory.

**Acceptance:** approval blocks dispatch and a toggle reroutes a task to Claude;
gate passes clean code / fails on a real assertion diff and falls back;
gate-passed code never returns through `delegate` but `apply` writes it to disk;
per-test log visible on the worker view.
**Status:** [x] PASSED (2026-08-30) — 15/15 E2E checks against the mock fleet
(gate-pass with code withheld 5/5, gate-fail with real `'2' !== 5` diff → retry
→ fallback with salvageable code, operator reassignment, all WS events, stats),
MCP stdio smoke (6 tools; `apply` wrote the file, code confirmed NOT returned;
`fetch` returned code+gate), and a browser walkthrough (approval table, toggle,
approve, worker view `■ PASSED 5/5` with named per-test rows). Dashboard
rebuilt (`vite build`, clean). **Not committed** (standing rule). ·
**Passed:** 2026-08-30
