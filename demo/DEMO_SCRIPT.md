# Sisyphus — Demo Script

The demo target is `demo/target-app/` (a working Habit Tracker). The `/sisyphus`
skill and `.mcp.json` are pre-wired there. This script is tuned further in Phase 7.

## The seed demo prompt
Open Claude Code **inside `demo/target-app/`** and paste:

```
/sisyphus Add a streak-statistics feature to the habit tracker: show each habit's
current streak and longest streak. Include a stats API endpoint that computes the
streak math, a date-utility module (formatDate + relativeDay), a stats-card CSS
component, unit tests for the date utility, and wire it all into the UI.
```

## Expected split (~3 phone + ~2 Claude)
**Offloaded to phones (leaf, self-contained):**
1. `public/dateUtil.js` — `formatDate(ts)` + `relativeDay(ts)` pure functions.
2. `public/stats-card.css` — a `.stat-card` component (streak numbers, label).
3. `test/dateUtil.test.js` — unit tests for the date utility (node:test).

**Kept by Claude (integration / logic / data-shape):**
4. `GET /api/stats` endpoint with the streak-math over `completions[]` (spans the
   data model — Claude keeps it).
5. Wire stats into `public/index.html` + `app.js` (cross-file integration).

## What the judges should see
- Orchestration tab: Claude's real reasoning lines, the plan split into
  "On phones" vs "Claude keeps", 3 phone cards streaming code in parallel with
  NPU/CPU badges, the scoreboard ticking up.
- Phone Vitals: 3 phones with live battery/temp/CPU.
- Each phone's worker view (on the phone itself): its task streaming live.
- Final summary in the Claude Code terminal: task table, on-device vs cloud,
  NPU-accelerated count, cloud tokens saved.

## Timing (mock fleet, canned mode)
Each phone task ~2–6s. Whole run typically < 30s including Claude's kept work.

## Contingencies
- **A phone drops mid-task** → the task retries once, then falls back to Claude,
  narrated live. Say: *"and that's our reliability story — the fleet degrades
  gracefully, the work still ships."*
- **No phones online** → Claude just does everything itself; the request never
  fails. (Check the Configure tab shows phones before starting.)
- **Orchestrator not running** → `npm start` from `sisyphus/`. Mocks:
  `npm run mock-fleet`.

## Pre-demo checklist (fuller version in Phase 7)
- [ ] `npm start` running (orchestrator on :4100)
- [ ] Phones (or `npm run mock-fleet`) online — verify on Configure tab
- [ ] Dashboard open on a spare screen
- [ ] Worker views open fullscreen on each phone
- [ ] Claude Code open in `demo/target-app/`
