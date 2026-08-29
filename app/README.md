# Sisyphus Worker — Android kiosk app (Phase 9)

A minimal native Android app that is a **fullscreen kiosk WebView** around the
existing web worker view (`/worker/<name>`, Phase 5). It does **not** talk to the
model — inference stays on the phone via Termux (Ollama CPU / llama-server NPU),
completely untouched. The app is just the demo *surface*: an installed app on the
iQOO instead of a browser tab.

The worker page it loads carries the GLITCH re-skin (Silkscreen / JetBrains Mono,
single-hue `--signal` green, zero radius). It does **not** inherit the fonts for
free, though (a real bug we hit): the demo hotspot has no route to Google Fonts,
so the WebView fell back to system monospace. Fix ships the 5 TTFs three ways —
served by the hub (`web/public/fonts` + `@font-face`), bundled in `res/font/` for
native views, and bundled in `assets/fonts/` and injected into the WebView via
`shouldInterceptRequest` so `/fonts/*.ttf` resolve even offline / with a stale
dist. This app also styles the **native chrome** the WebView can't cover — splash,
app icon, status/nav bar, setup + reconnect screens — to the same tokens
(`web/src/index.css`): `--bg #0E0E0E`, `--text #EAE7E0`, `--signal #3DDC84`.

## What it does
- **SetupActivity** (launcher): GLITCH-styled form — hub `IP:PORT`
  (prefilled `192.168.137.1:4100`, the Windows-hotspot gateway) + phone name
  (must match a name the hub knows, e.g. `iqoo-1`). On CONNECT it resolves that
  name to the server's hashed `phoneId` via a live `GET /api/phones` (the worker
  route needs the `ph_…` id, not the plain name), then saves both to
  SharedPreferences. A `BUILD <versionName>` stamp is shown at the bottom so you
  can confirm on-device which build is actually running.
- **KioskActivity**: fullscreen immersive WebView → `http://<hub>:<port>/worker/<phoneId>`
  (with a `?b=<versionCode>` cache-buster so a stale WebView cache can't serve an
  old page).
  - Screen stays awake (`FLAG_KEEP_SCREEN_ON`).
  - System bars hidden (immersive sticky).
  - Auto-reconnect: on main-frame load failure it shows a `(RECONNECTING)`
    overlay with a blinking green square and retries every 3 s.
  - **Operator escape hatch:** long-press the **top-left corner** to reopen setup.
- **Task notifications**: a heads-up notification fires the moment a task is
  assigned to this phone and again when it starts generating; tapping it brings
  the app to the front. Implemented as a JS→native bridge (`window.SisyphusNative`):
  the worker page calls `assigned` / `generating` / `finished` on its own state
  transitions, and `Notifier.java` posts one green-tinted notification updated in
  place. The web call is guarded, so a plain browser is unaffected. Needs
  `POST_NOTIFICATIONS` (requested on first launch, Android 13+).

Zero external dependencies (framework `Activity` + `WebView` only) — no appcompat,
no Compose, no Kotlin.

> **Web dependency:** the notification triggers live in `web/src/WorkerView.jsx`
> (guarded by `window.SisyphusNative`). Run `npm run build` in `web/` so the
> orchestrator-served `web/dist` includes them.

## Build
Prereqs: JDK 21, Android SDK with platform `android-34` + build-tools `34.0.0`.
`local.properties` points at the SDK (`sdk.dir=...`) — regenerate per machine.

```bash
# from sisyphus/app/  (first build needs network for AGP's Kotlin transitives)
JAVA_HOME="C:/Program Files/Microsoft/jdk-21.0.10.7-hotspot" ./gradlew :app:assembleDebug
```

Output: `app/build/outputs/apk/debug/worker view v3.apk` (~880 KB — the size is
the bundled fonts; the APK is named directly by a Gradle `outputFileName` rule).

## Install on a phone
```bash
# with the iQOO connected via USB (USB debugging on) or adb over Wi-Fi:
adb install -r "app/build/outputs/apk/debug/worker view v3.apk"
adb shell monkey -p com.sisyphus.worker 1   # or just tap the SISYPHUS icon
```
On first launch: confirm the `BUILD` stamp matches the APK you just sent (if it
doesn't, uninstall the old app first — an install can silently keep the old code),
confirm hub `IP:PORT`, enter the phone name, tap **CONNECT**. The name must match
a name the hub knows (the same `--name` used in the Termux `setup.sh` step) so the
app resolves it to that phone's worker view.

## Where this fits in phone setup
Termux setup is **unchanged** — this app only replaces the final manual step of
`docs/PHONE_SETUP.md` (open the worker URL in Chrome + fullscreen). Everything
upstream (Termux/Termux:API install, battery grant, `setup.sh` one-liner, model
pull, Ollama/llama-server) is identical.

## Config: build-time defaults
`app/build.gradle` → `buildConfigField`:
- `DEFAULT_HUB_IP` = `192.168.137.1`
- `DEFAULT_PORT` = `4100`

Change these to re-prefill the setup screen for a different hub.
