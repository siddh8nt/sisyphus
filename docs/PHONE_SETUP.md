# Onboarding a real phone (CPU runtime)

Plain-English steps to bring a phone onto the Sisyphus fleet. Target: under
~5 minutes (plus a one-time ~2GB model download). Do these once per phone.
NPU setup is separate — see `docs/NPU_SETUP.md` (Phase 6.5).

## On the laptop (once per demo)
1. **Turn on the hotspot.** Settings → Network & Internet → Mobile hotspot → On.
   All phones join **this** Wi-Fi. (Windows hotspot is usually `192.168.137.x`.)
2. **Open the firewall for port 4100** (once ever). In an **Admin** PowerShell:
   ```powershell
   netsh advfirewall firewall add rule name="Sisyphus" dir=in action=allow protocol=TCP localport=4100
   ```
3. **Start Sisyphus:** in the `sisyphus/` folder, `npm start`. Open the dashboard
   at `http://localhost:4100` → **Configure** tab. Note the QR code and the setup
   command (it already has the laptop's IP in it).

## On the phone
4. **Join the hotspot** (the Wi-Fi from step 1).
5. **Install Termux** — from **F-Droid** or the official GitHub APK, **not** the
   Play Store (that version is outdated). Also install **Termux:API** (same source).
   - Termux: https://f-droid.org/packages/com.termux/
   - Termux:API: https://f-droid.org/packages/com.termux.api/
6. **Grant battery access** so telemetry (temperature/battery) works: open the
   **Termux:API** app once, or run `termux-battery-status` in Termux and allow the
   permission prompt. (If you skip this, the phone still works — it just won't
   report battery/temperature.)
7. **Paste the setup command** from the Configure tab into Termux and press Enter.
   It looks like:
   ```sh
   curl -s http://192.168.137.1:4100/setup.sh | sh -s -- --name phone1
   ```
   Give each phone a unique name: `--name phone1`, `--name iqoo-1`, etc.
8. **Wait for the model pull** (first time only, ~2GB — a few minutes on good
   Wi-Fi). Subsequent runs skip this.
9. **Watch the Configure tab** — the phone appears the moment it registers. When
   setup finishes it prints a **worker-view URL**; open that on the phone and put
   Chrome in fullscreen (or "Add to Home Screen") so the judges can watch it work.

## After a reboot / if a phone drops
Just re-run the same one-line command (it's idempotent — reconnects, skips the
download). Or scan the QR again to reopen the dashboard/worker view.

## Troubleshooting
- **Phone doesn't appear:** confirm it's on the laptop hotspot (not another
  Wi-Fi), the firewall rule from step 2 exists, and `npm start` is running.
- **`pkg install` errors:** run `pkg update` once, then re-run the command.
- **No battery/temperature:** install Termux:API app + grant the permission
  (step 6), then re-run the command.
- **Worker view blank:** make sure the phone can open `http://<laptop-ip>:4100`
  in Chrome; if the dashboard loads, the worker view will too.
