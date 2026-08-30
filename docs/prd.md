# Sisyphus — Product Requirements

## One-liner
**Mobile Edge Compute for Coding Agents.** Claude Code (Opus) offloads simple,
self-contained coding subtasks to a fleet of Android phones running local
open-source LLMs — in parallel — while keeping the hard work (architecture,
security, integration) for itself. A live dashboard shows the orchestration in
real time.

## The pitch framing
A frontier coding agent is expensive and serial. Much of what it does on any
given task is *leaf work*: write one small utility file, a CSS component, a unit
test. That work is embarrassingly parallel and cheap enough to run on a phone.
Sisyphus turns a pile of phones on the same Wi-Fi into an **edge compute cluster**
that a frontier agent commands like a foreman — pushing the boulder uphill,
together. The headline is **on-device inference on the Snapdragon Hexagon NPU**;
the safety net is an automatic per-phone CPU fallback so the demo never breaks.

## Why it's compelling for judges
- Real distributed systems: registration, heartbeats, parallel dispatch, retry,
  fallback — all live and visible.
- Real on-device NPU inference (Snapdragon 8 Elite / Gen 5, Hexagon backend).
- Real cloud-token savings: every task a phone completes is tokens Claude didn't spend.
- Nothing is scripted. The Orchestration tab shows Claude's actual reasoning.

## Users / stories
- **Judge (watcher):** stands 1.5m away, watches phone worker views + the
  dashboard. Must instantly grok "phones are doing real coding work in parallel,
  commanded by Claude." Every screen legible from 1.5m.
- **Demo driver (product person, not an engineer):** starts the whole system with
  one command, onboards a phone with one pasted line or a QR scan, runs the demo
  by typing one `/sisyphus` prompt into Claude Code. Never edits config or debugs.
- **Phone worker:** a phone on the hotspot running a local model, showing its
  work fullscreen. Onboarding < 3 min per phone.

## Demo flow narrative
1. Laptop runs `npm start`; dashboard open on a 4th screen; phones on the laptop
   hotspot, each showing its worker view fullscreen (idle "READY").
2. Driver types a `/sisyphus "Add a stats feature…"` prompt into Claude Code
   opened in the demo target project (the skill + `.mcp.json` are wired at the
   sisyphus repo root; copy both into any other project to demo against it).
3. Claude calls `sisyphus_status`, narrates its decomposition (`sisyphus_log`),
   splits the work: ~3 leaf tasks to phones (each with baked-in unit tests), ~2
   kept for itself.
4. A **routing plan** appears on the Orchestration tab for the driver to approve
   — a table of phone / task / model / ETA / confidence / test-count with a
   per-task PHONE↔CLAUDE toggle. Nothing runs on a phone until it's approved
   (auto-approves after 120s so an untended demo still proceeds).
5. Phones light up in parallel — streaming code on their worker views and on the
   Orchestration tab, telemetry moving on Vitals, NPU/CPU badges showing. Each
   output passes a **deterministic gate** on the hub (structure, syntax, regex
   checks, and the baked-in tests); the per-test log shows on each worker view.
6. Claude writes the gate-passed files straight to disk (never re-reading them),
   handles anything that failed the gate or the driver rerouted, the app still
   runs.
7. Final summary table prints: who did what, gate result, tokens, time, on-device
   vs cloud, cloud tokens saved, cloud cost avoided (₹), NPU-accelerated count.
   The dashboard mirrors it with a gold "CLOUD SPEND AVOIDED" banner (live ₹ +
   a fun-fact equivalence) atop the Orchestration tab.

## Success criteria for the demo
- ≥3 phones (or mock phones) generating in parallel, visibly.
- At least one task completes on a real phone's NPU (Phase 6.5+), badged NPU.
- Fallback is seamless and narrated when a phone/NPU drops.
- The driver approves the routing plan on the dashboard before dispatch; a task
  can be toggled back to Claude and the run honors it.
- Every phone output is gated on the hub (checks + baked-in tests); gate-passed
  code is applied to disk without Claude re-reading it, so the token savings are
  real and not just "phone did the typing."
- Real reasoning, real tokens, real telemetry — zero fabrication.
- Runs entirely on laptop + hotspot; only cloud dependency is the Claude API.

## Explicit non-goals
- No cloud hosting of Sisyphus itself (edge story + venue-Wi-Fi independence).
- No auth beyond the LAN.
- No app-store mobile app (phones use Termux + Chrome worker view).
- No multi-user, no persistence beyond the local SQLite session log.
- Not a general model-serving platform — scoped to the demo's task shapes.

## NPU honesty clause
If Hexagon NPU bring-up cannot be made reliable on our devices in time, we ship
CPU-only and describe NPU as "supported architecture, device bring-up pending."
The dual-runtime design and fallback path make this a graceful degradation, not
a failure.

---

## Competition context (added 2026-08-29)
Target event: **iQOO Hackathon 2026** (iQOO x Reskilll) — a **phone-first** AI
hackathon, 30h city battles + a 48h Grand Finale (Bengaluru, Oct 9-11). Our
proposal — "mobile edge compute for coding agents like Claude Code" — **qualified
in the top 25 of thousands of submissions.** The cloud frontier agent (Claude
Code) is the deliberate premise, not a compromise.

**Judging rubric** (25% is automated device telemetry, unfakeable):
End product 30% · Novelty & impact 20% · Creative phone use (camera/voice/
on-device AI) 15% (telemetry) · Technical depth 15% · Office Kit usage 10%
(telemetry) · Demo & presentation 10%. Hard rules: **the demo must run on the
iQOO phone**; **local/open-source LLMs on the phone NPU, on-device**. Track:
**Developer Tools**.

## Strategy / roadmap
- **Phase 1 (now) — make it work & win the engineering story.** Core Sisyphus on
  llama.cpp for both runtimes: CPU (Ollama) + NPU (Hexagon `llama-server`),
  orchestrated from the laptop, live dashboard, proven fallback. This is built
  and green on mocks; remaining is the NPU bundle build + real iQOO bring-up.
- **Phase 2 (only once Phase 1 is bulletproof) — bank the phone-first rubric.**
  Build a **native Android worker-view app** (GenieX on the NPU is the natural
  fit here) and lean on **Office Kit** so the demo runs on the phone and the
  device-telemetry 25% (creative phone use + Office Kit) is earned. Additive;
  never at the expense of a working demo. GenieX is timeboxed with llama-server
  as the standing fallback. See docs/NPU_SETUP.md for the llama.cpp-vs-GenieX
  rationale and docs/memory.md for the full decision log.

## Non-goals (updated)
Removed the "no cloud" non-goal framing as a virtue: the cloud coding agent is
the product's core. Sisyphus itself is still never deployed to a cloud host — the
runtime is the laptop + hotspot; the only cloud call is the Claude API (the agent).
