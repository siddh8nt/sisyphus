# Sisyphus — Ground Rules & Conventions

## Ground rules (from the build prompt)
1. **Docs first, docs always.** Six living docs in `docs/`. Update the relevant
   doc in the same turn as any decision/bug/change. `memory.md` is append-only.
2. **Phase gates.** Don't start phase N+1 until phase N's acceptance checks
   actually pass (run them). Record pass/fail in `phases.md`.
3. **Windows-safe.** All laptop commands are PowerShell-safe; quote paths (the
   workspace path has a space). Cross-platform Node APIs (`path.join`). Phone
   scripts are POSIX `sh` for Termux.
4. **OneDrive.** Project lives under OneDrive. `node_modules/` is gitignored. If
   installs lock/slow, tell user to "Always keep on this device" or relocate to
   `C:\dev\sisyphus`.
5. **No exotic deps.** Only packages in the tech stack. New dep → justify in
   `memory.md` first; prefer writing ~30 lines instead.
6. **Mock-first.** Every feature testable with mock phones before any real phone.
   Real-phone steps only in Phase 6, user's hands on the phone.
7. **Demo can never dead-end.** Every network call has a timeout. Every phone
   task has retry + Claude fallback. Dashboard renders with 0 phones.
8. **Real data only.** Orchestration shows actual reasoning/events. Only allowed
   simulation is the clearly-labeled mock phone.
9. **One-command everything.** `npm start` runs the system; `npm run mock-fleet`
   starts 3 mock phones. Keep it that way.
10. **GitHub = source of truth; LAN = runtime.** Commit at every green gate.
    Push after asking once per session. README quickstart: clone → mock demo in
    < 5 min, no phones. Never commit secrets, node_modules, SQLite, or models.
    Sisyphus is never cloud-deployed; only cloud dep is the Claude API.

## Coding conventions
- **Module style:** ESM everywhere (`"type":"module"`). Server is plain JS + JSDoc
  (no TS build). `web/` may use TS/JSX (Vite handles it).
- **Imports:** Node built-ins via `node:` prefix. Cross-platform paths with
  `node:path`. No default-export-only modules; prefer named exports.
- **Error handling:** every outbound HTTP/model call wrapped with an
  `AbortController` timeout. Errors never throw past a request handler — catch,
  log to the event bus as a `reasoning{source:"sisyphus"}` line when
  demo-relevant, return a structured error. Task engine turns any failure into
  `failed → fallback_claude`, never an unhandled rejection.
- **Event naming:** WS `type` values are the fixed set in `architecture.md`.
  Internal EventEmitter events mirror them. Don't invent new WS types without
  updating `architecture.md` in the same turn.
- **State machine:** task states are the fixed set in `architecture.md`. One
  helper `setTaskState(taskId, state, extra)` performs the transition + emits.
- **IDs:** `phoneId`/`endpointId`/`taskId`/`sessionId` are short random strings
  (`crypto.randomUUID().slice(0,8)`), except logical phone id which is stable per
  `name`.
- **Config:** single `server/config.js` with PORT=4100 and timeouts. No magic
  numbers scattered.
- **Logging:** `server/lib/log.js` — timestamped, level-prefixed console. Quiet
  by default; `SISYPHUS_DEBUG=1` for verbose.

## Doc-update discipline
- Interface change → `architecture.md` same turn.
- Decision/bug/gotcha → `memory.md` append same turn.
- Phase check pass/fail → `phases.md` same turn.
- UI change → `design.md`.
