# SISYPHUS

### Parallel edge computing for coding agents

> **iQOO Mobile First Hackathon 2026 · Track: Developer Tools**

A cloud coding agent (Claude Code) stops paying cloud rates for boilerplate. Instead it
offloads simple, self-contained subtasks to a fleet of **Android phones running local
LLMs — in parallel, over a Wi-Fi hotspot, with no internet** — and keeps only the hard
integration work for itself. A live dashboard shows the whole orchestration in real time.

On-device inference runs on the Snapdragon **Hexagon NPU**, with an automatic per-phone
**CPU fallback** so a demo never stalls.

---

## The problem

Cloud coding agents generate *every* token in the cloud — including the trivial leaf code
a 3B model can write perfectly well — and bill it at premium output-token rates (Claude
Fable 5: **$50 / million output tokens**). Meanwhile billions of modern phones carry
capable NPUs that sit completely idle. Developers pay cloud prices for cheap code, and the
edge silicon in their pocket does nothing.

## The idea

Turn a pile of phones into a **local LLM worker pool** for a cloud agent.

Claude stays the **foreman**: it reads the feature request, decomposes it, and authors the
specs, gate checks, and unit tests. The simple, self-contained leaf tasks are then pushed
to the phones — running `qwen2.5-coder:3b` — which generate and self-verify in parallel.
Claude keeps only the architecture and integration. Gate-passed code is written straight
to disk **without ever re-entering Claude's context window**.

Every on-device output token is a token the cloud never bills.

## How a request flows

```
Claude Code ──MCP──► Sisyphus MCP server ──HTTP──► Hub orchestrator ──LAN──► 3× iQOO phones
 (foreman)            (6 stdio tools)               (Node · :4100)           NPU :8080 · CPU :11434
```

1. **Decompose** — Claude splits the request into phone-sized leaf tasks + its own kept
   integration tasks, and writes 5–10 spec checks and a unit-test suite per leaf task.
2. **Approve** — the operator sees a routing plan on the dashboard (task · phone · runtime
   · est. tokens · ETA from live tok/s) and approves or reassigns. Auto-approves on timeout.
3. **Dispatch** — leaf tasks run on the phones in parallel; heartbeats and CPU/NPU/memory
   vitals stream back every 3s over a WebSocket bus.
4. **Gate** — every phone output passes a **4-stage deterministic gate** on the hub:
   `① fenced-block extraction → ② syntax parse → ③ spec regex checks → ④ sandboxed unit tests`.
   Fail → bounded retry → fallback to Claude. **Only gate-passed code touches the repo.**
5. **Apply & finish** — the `sisyphus_apply` tool writes gate-passed files to the target
   project; Claude handles anything that failed or was rerouted, then prints a summary.

The phones are never trusted blindly — the gate is what makes offloading to a small local
model safe.

## The payoff

Every output token generated on-device is billed by no one. Conservative floor (output
tokens only; failures and fallbacks count as zero):

```
saved = Σ (on-device gate-passed output tokens) × $50/MTok × ₹95.4/USD
```

Real logged run — one checkout subsystem, 3 phones:

| Tasks | On-device | Share | Cloud tokens avoided | Saved | Wall clock |
|:-----:|:---------:|:-----:|:--------------------:|:-----:|:----------:|
|  10   |  7 (NPU)  | 70%   |        1,227         | ₹5.86 |   3m 23s   |

That scales with every phone added and every feature built.

## Features

- **Live orchestration dashboard** — plan + per-task state glyphs, streaming savings banner
- **Human-approved routing** — nothing runs on a phone until the plan is approved
- **4-stage deterministic gate** — structure → syntax → checks → sandboxed tests
- **NPU + CPU per phone** — Hexagon NPU offload with automatic CPU fallback
- **Per-phone worker view** — fullscreen gate/test log for each device
- **Phone vitals** — live CPU / NPU / memory / battery with sparklines
- **Fleet self-healing** — phones re-register automatically after a hub restart
- **Fully offline** — runs on the laptop's hotspot; fonts and assets self-hosted, the only
  cloud dependency is the Claude API

## Tech stack

| Layer | Tech |
|---|---|
| **Edge** | llama.cpp (Hexagon NPU, GGML v81), Ollama, Qwen2.5-Coder-3B, Termux, Android/adb |
| **Orchestration** | Node.js, Express, SQLite, WebSockets |
| **Agent** | Claude Code, Model Context Protocol (MCP), custom `/sisyphus` skill |
| **Dashboard** | React, Vite, Tailwind CSS |
| **Hardware** | 3× iQOO phones (Snapdragon + NPU), one laptop as hub + hotspot |

---

## Quickstart (no phones required — < 5 min)

Requires **Node ≥ 24 LTS** (Node 22 segfaults in `better-sqlite3`). Works on Windows and Mac.

```bash
git clone <repo-url>
cd sisyphus
npm install --ignore-scripts
```

`--ignore-scripts` is required: `better-sqlite3` ships prebuilt binaries but npm still tries
to compile it, which needs Visual Studio Build Tools.

Start the orchestrator (terminal 1):

```bash
npm start
```

Start 3 mock phones (terminal 2):

```bash
npm run mock-fleet
```

Open the dashboard at **http://localhost:4100** — 3 phones appear online on the Phone Vitals
tab. That's the whole system running with simulated phones. Watch the raw event bus with
`npm run ws-tap` (optional).

## Running it with Claude Code

The `/sisyphus` skill (`.claude/skills/sisyphus/SKILL.md`) and `.mcp.json` are wired at the
repo root. Open Claude Code in `sisyphus/` and fire the `/sisyphus` prompt. To use it in
**any other project**, copy those two files in and set `SISYPHUS_HOME` to your sisyphus
checkout before launching Claude Code — `.mcp.json` uses `${SISYPHUS_HOME:-.}/mcp/index.js`,
so gate-passed files land in *that* project's tree.

## Layout

```
sisyphus/
  server/   orchestrator (Express + ws + SQLite), task engine, mock fleet
  mcp/      MCP stdio server (6 tools) — thin client over HTTP to :4100
  web/      dashboard + worker view (Vite + React + Tailwind)
  phone/    Termux setup.sh / telemetry.sh (CPU) + npu/ adb deploy (NPU)
  demo/     DEMO_SCRIPT.md (run sheet)
  .claude/  /sisyphus skill (SKILL.md) — pairs with .mcp.json at the root
  docs/     prd · architecture · rules · phases · design · memory
```

## Docs

Start with [`docs/prd.md`](docs/prd.md) (what & why) and
[`docs/architecture.md`](docs/architecture.md) (interfaces). At the venue / onboarding
phones, see [`docs/VENUE_RUNBOOK.md`](docs/VENUE_RUNBOOK.md) — self-serve, no prior context
needed. [`docs/PHONE_SETUP.md`](docs/PHONE_SETUP.md) onboards a real phone (CPU) and
[`docs/NPU_SETUP.md`](docs/NPU_SETUP.md) covers the Hexagon NPU runtime.

**Never commit** `node_modules/`, SQLite files, model binaries, or secrets (all gitignored).
