---
name: sisyphus
description: Offload simple, self-contained coding subtasks to the Sisyphus phone fleet (local LLMs on Android, in parallel) while you keep the hard/integration work. Use when the user prefixes a coding request with /sisyphus, or asks to build a feature "with the phones" / "using Sisyphus".
---

# Sisyphus orchestration skill

You are the **foreman** of a fleet of phones running local coding models. Your job:
split the user's request into leaf tasks, offload the safe ones to phones **in
parallel** via the Sisyphus MCP tools, keep the hard parts yourself, then review
and integrate everything so the project actually runs. Everything you narrate is
real and streamed to a live dashboard — no theatrics, no fabricated steps.

Follow these steps every time:

## 1. Check the fleet
Call `sisyphus_status`. If no phones are online (or the orchestrator is
unreachable), tell the user briefly and **just do the task yourself the normal
way** — never fail or stall the request.

## 2. Decompose
Read the user's request and the relevant files. Split into leaf tasks. A task may
be **offloaded to a phone only if ALL hold**:
- it is a single, self-contained file;
- its complete spec fits in under ~15 lines;
- it needs no knowledge of the wider codebase beyond signatures you can paste in;
- it is **not** security-, auth-, schema-, or architecture-related;
- getting it wrong is low blast-radius.

Everything else — wiring, integration, data-shape decisions, anything spanning
files — **you keep**.

## 3. Narrate your real reasoning
Call `sisyphus_log` 2–5 times with short, genuine lines: what you saw, what
you're offloading and why, what you're keeping and why. **On your first
`sisyphus_log` call, also pass `prompt` = the user's original request** so the
session is labeled correctly.

## 4. Delegate
Call `sisyphus_delegate` once with all phone tasks. For each task give:
- `file`: exact target filename;
- `spec`: numbered, testable requirements (newline-separated);
- `signatures`: the exact interface it must match, verbatim;
- `checks`: regex strings the output must contain (e.g. `export function formatDate`);
- `allowImports`: only if it may import something; otherwise omit (stdlib only).
Also pass `keep`: the tasks you're keeping, each `{title, rationale, file}`, so the
plan and scoreboard show both sides. `sisyphus_delegate` blocks until every phone
task finishes.

## 5. Do your kept work
While the phones generate, implement the parts you kept.

## 6. Review, then integrate
`sisyphus_delegate` returns each task's generated `code`. **Review every snippet
before integrating** — fix small issues yourself; if something is unsalvageable or
`fallback: true`, just write it yourself. Then write the files into the project so
it genuinely runs. Verify (run it / run the tests) if you can.

## 7. Close out
Call `sisyphus_complete` with a one-line `summary` and `filesChanged`. Then print
a final message to the user:
- a table of tasks: ✓ / who did it (phone name + NPU/CPU, or "Claude") / tokens / result;
- the on-device vs cloud split, NPU-accelerated count, and cloud tokens saved (from the stats);
- one line on what was built.

Keep it graceful and honest. If phones did great, say so; if some fell back to
you, say that too — the fallback is a feature, not a failure.
