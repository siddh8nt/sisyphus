# Sisyphus — Engineering Memory (append-only)

Read the last ~30 lines at the start of every session. Date-stamped. Decisions +
why, bugs + fix, gotchas that must not be rediscovered.

---

## 2026-08-29 — Phase 0 kickoff
- **Env:** Windows 11, PowerShell. Node v24.13.0, npm 11.6.2, git 2.53, gh 2.95
  authenticated as `siddh8nt`. Workspace: `.../sisyphus iqoo/sisyphus/`
  (under OneDrive, path contains a space — quote everything).
- **Decision:** monorepo via npm workspaces (`server`, `mcp`, `web`). Server is
  plain ESM JS + JSDoc (no TS build); `web` uses Vite (TS/JSX allowed).
- **Decision:** Tailwind v3.4 (stable PostCSS flow), not v4 — simpler, predictable
  config for a hackathon timeline.
- **Decision:** pinned dep set only (§4 of build prompt): server = express, ws,
  better-sqlite3, qrcode; mcp = @modelcontextprotocol/sdk; web = vite, react,
  react-dom, tailwindcss + postcss/autoprefixer. `better-sqlite3` ships Windows
  prebuilds for Node 24 — watch for a rebuild if install fails.
- **Decision:** endpoint vs logical-phone model. `POST /register` returns both
  `phoneId` (stable per name) and `endpointId`. Heartbeats target endpointId.
  This cleanly supports one physical phone registering NPU + CPU endpoints.
- **Decision:** mock NPU endpoint on port 11511 so NPU-preference + fallback are
  testable in Phase 1–2, long before real Hexagon bring-up (Phase 6.5).
- **Gotcha to watch:** OneDrive can lock files / slow installs. node_modules is
  gitignored. Fallback plan: relocate to `C:\dev\sisyphus`.

## 2026-08-29 — Phase 0 install gotchas (RESOLVED)
- **better-sqlite3 native build failed on Node 24.** Pinned `11.8.1` has no
  prebuilt binary for Node 24 (ABI 137) → node-gyp tried to compile → no MSVC on
  this laptop → fail. **Fix:** bumped to `better-sqlite3@^13.0.3`, which ships a
  Node 24 Windows prebuild. Installs clean, loads, runs. (Node 24's built-in
  `node:sqlite` also works and is a zero-dep fallback if a future Node bumps ABI
  before better-sqlite3 catches up — but we stay on better-sqlite3 per the spec.)
  Lesson: on a fresh/newer Node, always take the latest better-sqlite3.
- **MCP SDK not hoisted to root node_modules.** `@modelcontextprotocol/sdk@1.30.0`
  installs into `mcp/node_modules` (workspace-local), so importing it from repo
  root fails — must run MCP code from the `mcp/` workspace. Normal for npm
  workspaces; not a bug. Import path: `@modelcontextprotocol/sdk/server/mcp.js`
  and `.../server/stdio.js`.
- Resolved versions: vite 6.4.3, react 18.3.1, tailwind 3.4.19, ws 8.21.3,
  express 4.22.2, qrcode 1.5.4, better-sqlite3 13.0.3, mcp-sdk 1.30.0.
- `npm install` at root: 293 packages, 0 vulnerabilities, clean.
