# Sisyphus — Demo Run Sheet

Demo target: **any project you open Claude Code in.** The `/sisyphus` skill and
`.mcp.json` are wired at the sisyphus repo root — open Claude Code there, or copy
`.mcp.json` + `.claude/skills/sisyphus/` into the project you want to demo
against (gate-passed files are written into that project's working directory).
Runs entirely on the laptop + hotspot; the only cloud dependency is the Claude API.

## The seed prompt
Open Claude Code in the demo target project and paste a prompt shaped like:

```
/sisyphus Add a stats feature to this project: a stats module that computes the
core numbers, a date-utility module (formatDate + relativeDay), a stats-card CSS
component, unit tests for the date utility, and wire it all into the UI.
```

Any feature with 3+ small, self-contained leaf files works — that's what routes
to the phones.

## Expected split (~3 phone + ~2 Claude)
**Phones (leaf, self-contained):** the date-utility module, the CSS component,
the date-utility unit tests.
**Claude keeps (integration/logic):** the stats math, and wiring it into the UI.

Verified on the mock fleet: 3 on-device / 2 cloud / 1+ NPU, ~4s, repeatable.

## Pre-demo checklist
Laptop:
- [ ] Mobile hotspot ON (Settings → Network → Mobile hotspot).
- [ ] Firewall rule for 4100 exists (once ever, admin PowerShell):
      `netsh advfirewall firewall add rule name="Sisyphus" dir=in action=allow protocol=TCP localport=4100`
- [ ] `npm start` running in `sisyphus/` (orchestrator on :4100).
- [ ] Dashboard open on a spare screen → **Configure** tab shows the QR + phones.
- [ ] Claude Code open in the demo target project (with `.mcp.json` + the
      `/sisyphus` skill wired — automatic if that's the sisyphus repo root).
- [ ] Target project reset to a clean state (`git checkout -- .` in it).

Phones (each):
- [ ] On the laptop hotspot Wi-Fi.
- [ ] Charged + plugged in.
- [ ] CPU online (setup one-liner run) — appears on Configure.
- [ ] NPU deployed if bring-up succeeded (`deploy-npu.ps1 -Name iqoo-N`).
- [ ] Worker view open fullscreen: `http://<laptop-ip>:4100/worker/<phoneId>`.
- [ ] Wake-lock held (setup.sh does this).

No phones? The demo still works — Claude does everything itself and says so. Check
Configure shows phones **before** starting for the full effect.

## Minute-by-minute
- **0:00 — Frame it.** "A frontier agent does a lot of small leaf work — one util,
  one CSS file, one test. That's embarrassingly parallel and cheap enough for a
  phone. Sisyphus turns these phones into an edge cluster Claude commands."
  Show the worker views (idle "READY") and the dashboard.
- **0:30 — Fire it.** Paste the `/sisyphus` prompt. Switch to the **Orchestration**
  tab.
- **0:40 — Narrate the split.** Claude's real reasoning streams in; the plan
  splits into "On phones" vs "Claude keeps". Point out it's *real* reasoning.
- **1:00 — Parallel work.** 3 phone cards stream code simultaneously; NPU/CPU
  badges; the worker views on the phones light up. Flip to **Phone Vitals** to
  show live battery/temp/CPU and the NPU badge.
- **1:40 — Integration.** Each phone output passes the deterministic gate
  (checks + baked-in tests — point at the gate log on a worker view); Claude
  writes gate-passed files straight to disk without re-reading them and wires
  the feature in; the app still runs. Show the scoreboard: on-device vs cloud,
  NPU count, **cloud tokens saved**.
- **2:10 — The number.** Read the final summary table in the terminal. "Every one
  of those tokens is work the cloud didn't do."
- **2:30 — History.** Open the **History** tab — the session is logged with its
  task table.

## Contingencies (all proven on mocks)
- **A phone drops mid-generation** → the task retries once, then falls back to
  Claude, narrated live in the feed. Say: *"There's our reliability story — the
  fleet degrades gracefully and the work still ships."* (Tested: fell back in
  ~0.6s, no hang.)
- **NPU flakes** → the phone transparently switches to its CPU engine with a
  narrated note ("NPU unavailable — routing to CPU"); the task still completes
  on-device, not in the cloud. The task/phone badges show CPU. (Tested.)
- **No phones at all** → Claude does the whole task itself and says so; the
  request never fails.
- **Orchestrator not running** → `npm start` from `sisyphus/`; mock phones:
  `npm run mock-fleet`.

## Reset between runs
- `git checkout -- .` (plus delete any new generated files) in the target project
  to revert the integrated feature.
- Each `/sisyphus` run starts a fresh session automatically (even if a prior run
  didn't finish cleanly).
