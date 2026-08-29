# Sisyphus — Mobile Edge Compute for Coding Agents

Claude Code (Opus) offloads simple, self-contained coding subtasks to a fleet of
Android phones running local open-source LLMs — in parallel — while keeping the
hard work (architecture, security, integration) for itself. A live dashboard
shows the orchestration in real time. Headline: on-device inference on the
Snapdragon Hexagon **NPU**, with an automatic per-phone **CPU fallback** so the
demo never breaks.

> Runs entirely on a laptop + Wi-Fi hotspot. No cloud hosting; the only cloud
> dependency is the Claude API.

> **📱 At the venue / onboarding phones? → [docs/VENUE_RUNBOOK.md](docs/VENUE_RUNBOOK.md)** —
> self-serve, no prior context needed. One laptop is the hub; teammates onboard
> phones against its hotspot in parallel.

## Quickstart (no phones required — < 5 min)

Requires **Node ≥ 24 LTS** (Node 22 segfaults in `better-sqlite3`). Works on
Windows and Mac.

```bash
git clone <repo-url>
cd sisyphus
npm install --ignore-scripts
```

`--ignore-scripts` is required: `better-sqlite3` ships prebuilt binaries but npm
still tries to compile it, which needs Visual Studio Build Tools. See the
2026-08-29 setup entry in `docs/memory.md`.

Start the orchestrator (terminal 1):

```bash
npm start
```

Start 3 mock phones (terminal 2):

```bash
npm run mock-fleet
```

Open the dashboard: **http://localhost:4100** — you'll see 3 phones online on the
Phone Vitals tab. That's the whole system running with simulated phones.

Watch the event bus (optional, terminal 3):

```bash
npm run ws-tap
```

## Running the demo with Claude Code

The demo project lives in `demo/target-app/` (a small Habit Tracker) and is
pre-wired with the `/sisyphus` skill and `.mcp.json`. Open Claude Code there and
run the `/sisyphus` prompt from `demo/DEMO_SCRIPT.md`. Claude decomposes the
task, offloads leaf work to the phones, integrates the results, and prints a
summary. Everything on the Orchestration tab is real.

## Layout
```
sisyphus/
  server/   orchestrator (Express + ws + SQLite), task engine, mock fleet
  mcp/      MCP stdio server (4 tools) — thin client over HTTP to :4100
  web/      dashboard + worker view (Vite + React + Tailwind)
  phone/    Termux setup.sh / telemetry.sh (CPU) + npu/ adb deploy (NPU)
  demo/     Habit Tracker target app + DEMO_SCRIPT.md
  docs/     prd · architecture · rules · phases · design · memory
```

## Docs
Start with `docs/prd.md` (what & why) and `docs/architecture.md` (interfaces).
`docs/phases.md` tracks progress. See `docs/PHONE_SETUP.md` to onboard a real
phone and `docs/NPU_SETUP.md` for the Hexagon NPU runtime.

## Never commit
`node_modules/`, SQLite files, model binaries, or secrets (all gitignored).
