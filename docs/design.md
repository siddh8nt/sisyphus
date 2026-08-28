# Sisyphus — Design System

## Demo readability rule (overrides all other design instincts)
Every screen must be **legible from 1.5m away on a phone**. Big type, high
contrast, generous spacing, few elements per view. When in doubt, make it bigger.

## Theme: dark, terminal-meets-control-room
Deep near-black background, one saturated accent, restrained neutrals, semantic
status colors. Feels like mission control.

### Color tokens (CSS variables, defined in `web/src/index.css`)
```
--bg:        #0a0b0f   /* app background (near-black) */
--surface:   #14161d   /* cards, panels */
--surface-2: #1c1f28   /* raised / hover */
--border:    #262a35
--text:      #e7e9ee   /* primary text */
--text-dim:  #9aa0ad   /* secondary */
--text-faint:#5a606e   /* tertiary / idle */

--accent:    #7c5cff   /* Sisyphus violet — primary accent, NPU badge */
--accent-2:  #22d3ee   /* cyan — streaming / active */
--claude:    #d97757   /* Claude tasks (warm terracotta) */

--ok:        #34d399   /* completed / online */
--warn:      #fbbf24   /* retry / warming */
--err:       #f87171   /* failed / offline */
--cpu:       #9aa0ad   /* CPU badge (neutral) */
```

### Typography
- UI sans: system stack (`-apple-system, Segoe UI, Roboto, sans-serif`).
- Mono (code/telemetry/token streams): `ui-monospace, "JetBrains Mono",
  "Cascadia Code", Consolas, monospace`.
- Scale (mobile-first): worker view title ~clamp(28px,7vw,48px); dashboard
  headings 20–24px; body 15–16px; telemetry numerals large (tabular-nums).
- Use `font-variant-numeric: tabular-nums` for all live counters.

## Layout
- Mobile-first. Dashboard = top tab bar (4 tabs) + scrollable content.
- Breakpoints: base (phone) → `md:` (≥768 tablet/laptop) widens to grids.
- Max content width on desktop ~1100px, centered.
- Cards: `--surface`, 1px `--border`, radius 14px, padding 16px.

## Status semantics (consistent everywhere)
- Online / completed → `--ok`, pulsing dot for live.
- Offline / failed → `--err`.
- Retry / warming / fallback → `--warn` (amber).
- Streaming / active → `--accent-2` (cyan) glow.
- NPU badge → `--accent` (violet), filled. CPU badge → `--cpu`, outline.

## Tabs

### 1. Configure
- Orchestrator status pill (up/down, IP:4100).
- MCP hookup helper: the exact `claude mcp add` command + `.mcp.json` snippet,
  each with a copy button.
- Phone onboarding: autodetected LAN IP, a **QR code** (join URL), the one-line
  Termux command with copy button, live "phones detected" list (updates on
  register via WS).

### 2. Orchestration (centerpiece)
- Left/top: **reasoning feed** — terminal-styled log, source badges
  Claude(terracotta)/Sisyphus(violet), monospace, auto-scroll.
- **Plan cards:** two columns — "On phones" (violet-tinted) vs "Claude keeps"
  (terracotta-tinted). Each card: title, file, rationale.
- **Phone task cards:** live streaming output pane, animated state chip through
  the lifecycle, runtime badge (NPU/CPU), retry/fallback highlighted amber/red.
- **Sticky footer scoreboard:** on-device vs cloud counts, NPU-accelerated count,
  tokens saved, elapsed timer.

### 3. Phone Vitals
- One card per logical phone: name, model, active runtime badge + both endpoints'
  health, online/offline pulse dot, battery %, temp °C, CPU load, mem used/total,
  session tokens, tasks completed, avg tok/s.
- Hand-rolled SVG sparkline (last 60s) of temp or CPU per card.

### 4. History
- List of past sessions (SQLite): prompt, date, task table, stats. Tap to expand.

## Worker view (`/worker/:id`)
- Huge phone name + active runtime badge at top.
- Assigned task title.
- Streaming monospace output pane (auto-scroll, cyan glow while active).
- Telemetry strip: battery, temp, CPU, mem — big numerals.
- Live token counter + tok/s, large.
- Idle: calm centered "READY — waiting for tasks" + slow pulse dot.
- PWA-friendly `<meta>` + manifest so "Add to Home Screen" launches like an app.

## Motion
- Subtle: pulse dots (2s), state-chip crossfade, streaming cursor blink. No
  gratuitous animation — it must read clearly on a shaky phone camera.

## Component inventory
`StatusDot`, `RuntimeBadge`, `StateChip`, `Sparkline`, `CopyButton`, `QrPanel`,
`ReasoningFeed`, `PlanCard`, `TaskCard`, `PhoneVitalCard`, `Scoreboard`,
`Tabs`, `Stat` (label+big value).
