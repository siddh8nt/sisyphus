# Sisyphus — Phase Plan & Progress

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (checks passed). Record the
date each phase passes.

> **STATUS: AT THE VENUE, LIVE (2026-08-29). Phase 8 hardware acceptance PASSED.**
> All 3 iQOOs onboarded (CPU) + NPU-deployed (v81). Real parallel run: 3/3 on
> NPU, 574 cloud tokens saved, 16.7s, 0 fallback. NPU bundle BUILT.
> **CONTEXT SWITCH IN PROGRESS:** akshat's Claude Code hit its usage limit; dev
> moving to siddh8nt's machine. **Read `docs/HANDOFF_2026-08-29.md` first**, then
> the last ~4 memory.md entries.
> **NEXT:** (1) chaos test → closes 6.5 · (2) controlled NPU-vs-CPU benchmark ·
> (3) polished human /sisyphus run in Claude Code · (4) Phase 7 real-phone prompt
> tuning · (5) Phase 9 native app. Vitals battery/temp deferred (Termux:API app).

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
- [~] Benchmark NPU vs CPU tok/s + prefill → memory.md
  — first signal: NPU 9.6 tok/s > CPU 4.4-8.2 tok/s (uncontrolled). Controlled
  identical-prompt bench still TODO.
- [ ] Chaos test: kill NPU mid-session → seamless CPU fallback, narrated

**Acceptance:** full demo where a phone completes a task on Hexagon NPU (NPU
badge, `usage` counts) AND a forced-failure run with seamless CPU fallback.
Time-box: 2 sessions → Plan B (NexaSDK) → 2 sessions → ship CPU-only, document.
**Status:** [~] research + scripts DONE (phone-independent); on-device bring-up
awaits iQOO phones. · **Passed:** —

---

## Phase 7 — Hardening & demo polish
Tasks:
- [x] Timeout/chaos tests: kill phone mid-generation → retry→Claude fallback
  (~0.6s, no hang); kill NPU endpoint → transparent CPU switch, narrated. BOTH PASS.
- [x] Robustness: abandoned-session self-heal (new prompt → fresh session, stats
  don't accumulate if sisyphus_complete was missed)
- [x] Dashboard empty/error states (0 phones, no session, reconnecting) verified
- [ ] Tune worker prompt vs real outputs (needs real phone)
- [~] Tune demo prompt for reliable ~3/2 split (prompt set; final tune on hardware)
- [x] `DEMO_SCRIPT.md` run sheet + pre-demo checklist + contingencies
- [ ] (stretch) qwen2.5-coder:7b on one phone CPU (needs phone)

**Acceptance:** 3 consecutive flawless mock rehearsals (→ 3/3 PASS, consistent
3 on-device/2 cloud/1 NPU/153 saved/~3.8s); 1 flawless real-phone run (pending
iQOO hardware).
**Status:** [~] mock hardening DONE; real-phone run awaits iQOO. · **Passed:** —

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

## Phase 9 — Native Android worker app (Tier 2 -> Tier 3) [FUTURE, LOCKED PLAN]
Additive layer, started ONLY once Phases 0-8 are bulletproof. Banks the iQOO
Hackathon's phone-first score (25% device telemetry: creative phone use + Office
Kit; "demo must run on the phone"). Decision: **skip the WebView tier; build the
native app (Tier 2), then swap inference in-process (Tier 3).** See prd.md
"Strategy / roadmap" + the 2026-08-29 decision log in memory.md.

**Design (fixed):**
- The **app owns the endpoint**: a tiny in-app HTTP server (Ktor/NanoHTTPD) that
  the orchestrator dispatches to. Inference goes through a swappable interface:
  `interface InferenceEngine { generate(prompt, onToken) }` with
  `LlamaServerEngine` (proxies to the on-phone llama-server = Tier 2, proven) and
  `EmbeddedEngine` (GenieX in-process = Tier 3). Orchestrator never changes; Tier
  3 = swap one class; if GenieX fights us, flip back to LlamaServerEngine.
- Engine stays llama.cpp until Tier 3. GenieX is timeboxed.

**Prereq:** Android Studio + JDK + Android SDK on the laptop (adb already present).

**Tier 2 tasks (do first):**
- [ ] WALKING SKELETON FIRST (before UI polish): app installs on the iQOO ->
  registers as the phone's endpoint -> proxies one request to the local
  llama-server -> streams a token back -> reports battery/thermal. Prove the pipes
  on the real device.
- [ ] In-app HTTP endpoint + `InferenceEngine` interface + `LlamaServerEngine`.
- [ ] Native worker-view UI (Jetpack Compose): big name, streaming code pane,
  telemetry strip, token counter + tok/s, idle READY. Legible at 1.5m.
- [ ] Native device telemetry via Android APIs (BatteryManager / thermal / CPU) ->
  heartbeat to orchestrator (replaces telemetry.sh for app phones).
- [ ] One phone-feature for "creative phone use" 15% (e.g. voice-to-task via
  SpeechRecognizer, or camera-QR to join).
- [ ] Office Kit so the demo/dashboard runs on the phone -> Office Kit 10%.

**Tier 3 tasks (after Tier 2 works, timeboxed):**
- [ ] `EmbeddedEngine` via GenieX (`com.qualcomm.qti:geniex-android`) - in-process
  NPU inference. Swap it in; keep LlamaServerEngine as the standing fallback.
- [ ] Verify Qwen2.5-Coder Q4_0 (or Llama-3.2-3B fallback) runs on v81 in-app.

**Open question:** the "run Claude Code on the phone" demo mechanic - Claude Code
is a CLI, not the Claude mobile app. Decide the actual on-phone agent surface when
we get here (likely: laptop Claude Code mirrored to the phone via Office Kit).

**Acceptance:** demo runs on the iQOO phone; device telemetry registers phone use
+ Office Kit; the app is the endpoint and streams real inference (llama-server at
Tier 2, GenieX at Tier 3); core demo still passes untouched.
**Status:** [ ] FUTURE (after core is solid) · **Passed:** —
