# Sisyphus — Phase Plan & Progress

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (checks passed). Record the
date each phase passes.

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
- [ ] Four MCP tools (stdio, thin HTTP client)
- [ ] Demo Habit Tracker app (`demo/target-app/`, ~6 files)
- [ ] `/sisyphus` SKILL.md + `.mcp.json`

**Acceptance:** Real Claude Code session in `demo/target-app` runs `/sisyphus
<prompt>` end-to-end vs mock phones: real reasoning flows, code returns, Claude
integrates, app runs, summary table prints.
**Status:** [ ] · **Passed:** —

---

## Phase 4 — Dashboard
Tasks:
- [ ] Configure tab (status, MCP helper, QR, setup one-liner, live phone list)
- [ ] Orchestration tab (reasoning feed, plan cards, live task cards, scoreboard)
- [ ] Phone Vitals tab (per-phone cards, sparklines, runtime badges)
- [ ] History tab (past sessions from SQLite)
- [ ] `vite build` served at `/`

**Acceptance:** Re-run Phase 3 demo watching dashboard on laptop + phone
viewport: Orchestration streams live; Vitals shows 3 phones moving; History shows
session; Configure shows QR + copyable command.
**Status:** [ ] · **Passed:** —

---

## Phase 5 — Worker view + telemetry ingestion
Tasks:
- [ ] `/worker/:id` streaming output + telemetry + token counter
- [ ] Idle "READY" state; PWA meta/manifest
- [ ] Legible at 1.5m

**Acceptance:** worker view for a mock phone streams live during a session, shows
telemetry, idle looks good, legible at 1.5m in mobile viewport.
**Status:** [ ] · **Passed:** —

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

## Phase 6.5 — NPU runtime bring-up (OnePlus first)
Tasks:
- [ ] RESEARCH first: current llama.cpp Hexagon docs/artifacts → `docs/NPU_SETUP.md`
- [ ] `deploy-npu.ps1` / `start-npu.ps1`
- [ ] Enable USB debugging, deploy, register NPU endpoint
- [ ] Benchmark NPU vs CPU tok/s + prefill → memory.md
- [ ] Chaos test: kill NPU mid-session → seamless CPU fallback, narrated

**Acceptance:** full demo where OnePlus completes a task on Hexagon NPU (NPU
badge, `usage` counts) AND a forced-failure run with seamless CPU fallback.
Time-box: 2 sessions → Plan B (NexaSDK) → 2 sessions → ship CPU-only, document.
**Status:** [ ] · **Passed:** —

---

## Phase 7 — Hardening & demo polish
Tasks:
- [ ] Timeout/chaos tests (kill mock mid-gen → retry/fallback visible)
- [ ] Dashboard empty/error states
- [ ] Tune worker prompt vs real outputs
- [ ] Tune demo prompt for reliable ~3-phone/2-claude split
- [ ] `DEMO_SCRIPT.md` run sheet + pre-demo checklist + contingencies
- [ ] (stretch) qwen2.5-coder:7b on one phone CPU

**Acceptance:** 3 consecutive flawless mock rehearsals; 1 flawless real-phone run.
**Status:** [ ] · **Passed:** —

---

## Phase 8 — iQOO day
Tasks:
- [ ] Per phone: join hotspot → Termux + Termux:API → one-liner `--name iqoo-N`
- [ ] Then USB debugging + `deploy-npu.ps1` each
- [ ] Full 3-real-phone rehearsal

**Acceptance:** 3 iQOO online, full run, all three generating in parallel, max
NPU badges (target 3).
**Status:** [ ] · **Passed:** —
