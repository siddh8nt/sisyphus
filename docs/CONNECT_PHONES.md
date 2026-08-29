# Connecting the 3 iQOO phones (CPU + NPU) — activation runbook

The one place to look every time you set up the fleet. Follow it top to bottom
and all three phones come online with **both** runtimes: CPU (Ollama) and NPU
(llama.cpp on the Hexagon v81). Copy-paste the commands as written.

> Nothing here re-downloads or re-pushes anything. The model + NPU bundle are
> already on all three phones (`/data/local/tmp/llama.cpp/`). CPU comes up from
> Termux on the phone; NPU comes up from the laptop over a USB cable. If a phone
> ever genuinely lost its bundle, that's a re-push — see `docs/NPU_SETUP.md`,
> not this file.

---

## 0. Fleet reference (these 3 phones)

| phone  | adb serial          | Wi-Fi IP (hotspot) | phoneId       |
|--------|---------------------|--------------------|---------------|
| iqoo-1 | `10BFBM0AU7001GP` | `192.168.137.237` | `ph_5b534ffd` |
| iqoo-2 | `10BFAT1U6A000XP` | `192.168.137.6`   | `ph_e769d38d` |
| iqoo-3 | `10BFBJ0SQJ001GG` | `192.168.137.183` | `ph_738955d4` |

- All are model **I2501** (iQOO 15, Snapdragon 8 Elite Gen 5 = **Hexagon v81**).
- **SKIP the OnePlus** — serial `f970c5a2`, model `CPH2723`. Wrong architecture;
  it will crash if you push NPU to it. Never target it.
- IPs are DHCP and can change between sessions. The values above are the last
  known good; the live truth is always `GET http://127.0.0.1:4100/api/phones`.

**Machine paths (this laptop):**
- Repo root: `C:\Users\siddh\OneDrive\Desktop\sisyphus iqoo\sisyphus`
- adb: `C:\Users\siddh\AppData\Local\Android\Sdk\platform-tools\adb.exe`
- Hotspot gateway (what the phones dial the laptop by): `192.168.137.1`

> **Using a different machine?** See §8 — most of this runbook still applies.
> The phone IPs above are reference only (no command uses them; the scripts
> auto-detect the live IP), and the serials/phoneIds are tied to the phones, not
> the laptop. Only the two file paths — and, on a non-hotspot network, the hub
> gateway — need changing.

---

## 1. Prerequisites (once per session)

1. **Turn the Windows hotspot ON.** Settings → Network & internet → Mobile
   hotspot → On. All three phones join **this** Wi-Fi.
2. **Firewall rule for port 4100** (once ever, Admin PowerShell — skip if already
   added):
   ```powershell
   netsh advfirewall firewall add rule name="Sisyphus" dir=in action=allow protocol=TCP localport=4100
   ```

---

## 2. Start the hub (orchestrator)

In a dedicated terminal at the repo root:

```powershell
cd "C:\Users\siddh\OneDrive\Desktop\sisyphus iqoo\sisyphus"
node server/index.js
```

Wait for: `orchestrator listening on http://localhost:4100`. Leave it running.
Dashboard: <http://localhost:4100>.

Quick health check from any other terminal:
```bash
curl -s http://127.0.0.1:4100/api/status
```

---

## 3. CPU activation (Ollama) — do this on each phone

The CPU runtime runs on the phone itself, in **Termux**. It's idempotent —
running it again is also how a phone reconnects after a reboot or a drop.

On each phone (iqoo-1, iqoo-2, iqoo-3), open **Termux** and paste, changing only
the name:

```sh
curl -s http://192.168.137.1:4100/setup.sh | sh -s -- --name iqoo-1
```
```sh
curl -s http://192.168.137.1:4100/setup.sh | sh -s -- --name iqoo-2
```
```sh
curl -s http://192.168.137.1:4100/setup.sh | sh -s -- --name iqoo-3
```

Each ends with `== iqoo-N is ONLINE ==` and a worker-view URL. That phone now
shows a healthy **cpu** endpoint in `/api/status`.

> The `--name` you use here is the phone's identity for the whole system. The NPU
> step in the next section **must** use the exact same name so the two runtimes
> group into one logical phone.

---

## 4. NPU activation (llama.cpp on Hexagon) — from the laptop, one phone at a time

The NPU is started from the laptop over a **USB cable** (adb-over-Wi-Fi is off on
these phones). Do the phones **one at a time** so you always know which serial is
which. The OnePlus can stay plugged in or not — we target by serial, never touch it.

For **each** iQOO (iqoo-1, then iqoo-3; iqoo-2 too if its NPU is down):

### 4a. Cable it and authorize adb
1. Plug the phone into the laptop with USB.
2. On the phone: enable **USB debugging** (Settings → Developer options).
3. Accept the **"Allow USB debugging?"** prompt → tick *Always allow from this
   computer* → OK.
4. Confirm it's an authorized device (should say `device`, not `unauthorized`):
   ```powershell
   & "C:\Users\siddh\AppData\Local\Android\Sdk\platform-tools\adb.exe" devices -l
   ```
   Note the iQOO serial (model `I2501`). If the OnePlus (`f970c5a2` / `CPH2723`)
   is also listed, ignore it — you'll pass `-Serial` so only the iQOO is targeted.

### 4b. (Optional) confirm the bundle is really on the device
Replace `<SERIAL>` with the iQOO's serial from 4a:
```powershell
& "C:\Users\siddh\AppData\Local\Android\Sdk\platform-tools\adb.exe" -s <SERIAL> shell "ls -la /data/local/tmp/llama.cpp/bin/llama-server /data/local/tmp/llama.cpp/gguf/Qwen2.5-Coder-3B-Instruct-Q4_0.gguf"
```
You should see the `llama-server` binary and a **1828486400-byte** (~1.83 GB)
gguf. If either is missing, STOP — that phone needs a re-push (`docs/NPU_SETUP.md`),
not a restart.

### 4c. Start the NPU and register it
From the repo root, pass the matching `-Name` and the iQOO's `-Serial`:
```powershell
cd "C:\Users\siddh\OneDrive\Desktop\sisyphus iqoo\sisyphus"
.\phone\npu\start-npu.ps1 -Name iqoo-1 -Serial 10BFBM0AU7001GP
```
```powershell
.\phone\npu\start-npu.ps1 -Name iqoo-2 -Serial 10BFAT1U6A000XP
```
```powershell
.\phone\npu\start-npu.ps1 -Name iqoo-3 -Serial 10BFBJ0SQJ001GG
```

Success looks like:
```
Starting llama-server (Qwen2.5-Coder-3B-Instruct-Q4_0.gguf, arch v81) on the NPU...
Phone Wi-Fi IP: 192.168.137.237
NPU endpoint is UP at http://192.168.137.237:8080
Registered NPU endpoint for 'iqoo-1' -> phoneId ph_5b534ffd
Done. Sisyphus will now prefer the NPU for this phone.
```

The script kills any stale server, relaunches llama-server on `:8080` with
`GGML_HEXAGON_ARCH=v81`, waits for `/v1/models` to answer, and registers the
`npu` endpoint. It pushes **nothing**.

You can unplug the phone once you see "Done" — llama-server keeps running on the
phone over Wi-Fi. Then do the next phone.

---

## 5. Verify the whole fleet

```bash
curl -s http://127.0.0.1:4100/api/status
```
All three should read `"activeRuntime":"npu"`, `"runtimes":["cpu","npu"]`,
`"healthy":true`. That's the finished state:

| phone  | CPU healthy | NPU healthy | active |
|--------|-------------|-------------|--------|
| iqoo-1 | ✓           | ✓           | npu    |
| iqoo-2 | ✓           | ✓           | npu    |
| iqoo-3 | ✓           | ✓           | npu    |

The orchestrator health-checks the NPU before every dispatch and automatically
falls back to CPU for any phone whose NPU is down, so a single dead NPU never
takes a phone offline.

---

## 6. Troubleshooting

- **`adb devices` shows the phone as `unauthorized`:** the RSA prompt wasn't
  accepted. Unlock the phone, re-tick "Always allow", re-run `adb devices`.
- **`start-npu.ps1` says the endpoint didn't come up in 60s:** read the on-device
  log and quote the exact error:
  ```powershell
  & "C:\Users\siddh\AppData\Local\Android\Sdk\platform-tools\adb.exe" -s <SERIAL> shell cat /data/local/tmp/llama-server.log
  ```
  Leave that phone on CPU (it still works); do **not** hand-edit the script.
- **NPU drops after the phone sits idle:** this is the common one — llama-server
  dies from idle. Just re-cable that phone and re-run its `start-npu.ps1` line
  (section 4c). No CPU re-run needed.
- **A phone doesn't appear at all:** confirm it's on the laptop hotspot (not
  another Wi-Fi), the firewall rule exists, and `node server/index.js` is running.
  Then re-run the CPU one-liner (section 3) on that phone.
- **IPs look wrong:** re-check `GET /api/phones` — DHCP may have reassigned them;
  the scripts auto-detect the current IP, so registered endpoints are always right.

## 7. Chaos test / intentionally stop an NPU

To kill one phone's NPU (demo of CPU fallback) — cable it, then:
```powershell
cd "C:\Users\siddh\OneDrive\Desktop\sisyphus iqoo\sisyphus"
.\phone\npu\start-npu.ps1 -Name iqoo-1 -Serial 10BFBM0AU7001GP -Stop
```
That phone's NPU goes unhealthy and Sisyphus falls back to its CPU. Bring it back
by running section 4c again.

---

## 8. Porting to another machine

The **process** is identical anywhere; only a few values are laptop-specific.

**Tied to the phones, not the machine — reuse as-is:**
- adb **serials** and **phoneIds** (§0). The phoneId is a hash of the name, so
  `iqoo-1` → `ph_5b534ffd` on any machine.

**Reference only — nothing breaks if they're stale:**
- The phone **Wi-Fi IPs** in §0. No command uses them; `start-npu.ps1`
  auto-detects each phone's live IP and the hub always shows the truth at
  `/api/phones`. On a new machine the phones just pick up new DHCP addresses.

**Must change on a new machine:**
1. **The two file paths** everywhere in this doc — the repo root and the adb path.
   Find the new adb path (default `…\AppData\Local\Android\Sdk\platform-tools\`)
   and put the repo wherever you cloned it.
2. **The hub address the phones dial** (the `192.168.137.1` in §3's one-liner):
   - **Another Windows machine using Mobile Hotspot** → still `192.168.137.1`.
     Nothing to change.
   - **A real Wi-Fi router / any non-hotspot network** → use *that laptop's* LAN
     IP instead. Get it with `ipconfig` (the IPv4 of the active adapter, e.g.
     `10.x.x.x` or `192.168.1.x`), open the firewall for 4100 on that adapter,
     and make every phone join the same network. The CPU one-liner becomes
     `curl -s http://<laptop-LAN-IP>:4100/setup.sh | sh -s -- --name iqoo-1`.

Everything else — starting the hub, the NPU cable-and-`start-npu.ps1` flow,
verification — is unchanged.
