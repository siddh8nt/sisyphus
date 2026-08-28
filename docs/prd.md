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
2. Driver types `/sisyphus "Add a streak-statistics feature…"` into Claude Code
   inside the demo Habit Tracker project.
3. Claude calls `sisyphus_status`, narrates its decomposition (`sisyphus_log`),
   splits the work: ~3 leaf tasks to phones, ~2 kept for itself.
4. Phones light up in parallel — streaming code on their worker views and on the
   Orchestration tab, telemetry moving on Vitals, NPU/CPU badges showing.
5. Claude reviews returned snippets, integrates everything, the app still runs.
6. Final summary table prints: who did what, tokens, time, on-device vs cloud,
   cloud tokens saved, NPU-accelerated count.

## Success criteria for the demo
- ≥3 phones (or mock phones) generating in parallel, visibly.
- At least one task completes on a real phone's NPU (Phase 6.5+), badged NPU.
- Fallback is seamless and narrated when a phone/NPU drops.
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
