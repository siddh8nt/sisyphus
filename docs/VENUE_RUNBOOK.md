# Sisyphus — Venue Runbook (self-serve, no Claude needed)

**How the team works in sync:** ONE laptop is the **hub** (runs the orchestrator).
Everyone else onboards phones by pointing them at the hub's hotspot. GitHub keeps
the *code* in sync; the *hotspot LAN* is the live runtime. Every phone in the room
registers to the one hub laptop and shows up on its dashboard.

- **Hub operator (1 person):** does Part A. Keeps `npm start` running.
- **Phone wranglers (anyone, in parallel):** do Part B, once per phone.
- Advanced/optional: Part C (NPU), Part D (Office Kit), Part E (run the demo).

Prereqs to clone the repo: **Node ≥ 24 LTS** (Node 22 segfaults in
`better-sqlite3`; `winget install --id OpenJS.NodeJS.LTS`).
`git clone <repo> && cd sisyphus && npm install --ignore-scripts`
— the `--ignore-scripts` flag is required, otherwise npm tries to compile
`better-sqlite3` from source and fails without Visual Studio Build Tools.

---

## Part A — Hub laptop (do once)
1. **Turn on the Windows Mobile Hotspot.** Settings → Network & Internet → Mobile
   hotspot → On. Set **"Share from" = Ethernet** (or whatever has internet).
   Note the hotspot **name + password**. Every phone joins THIS, not venue Wi-Fi.
   (Venue Wi-Fi blocks phone↔laptop traffic — the hotspot is why it works.)
2. **Open port 4100** (once ever) in an **Admin** PowerShell:
   ```
   netsh advfirewall firewall add rule name="Sisyphus" dir=in action=allow protocol=TCP localport=4100
   ```
3. **Start the hub:** in `sisyphus/`, run `npm start`. Leave it running.
4. **Get the hub IP:** open `http://localhost:4100` → **Configure** tab. It shows
   the **hub IP** (on the hotspot it's usually `192.168.137.1`), a **QR code**, and
   the **exact setup command** with the IP already filled in. Share that command +
   the hotspot name/password with the team. THIS IP is what every phone uses.
5. Open the dashboard on a spare screen — phones appear here the moment they register.

---

## Part B — Onboard a phone (repeat per phone, in parallel)
1. **Join the hotspot** (name/password from Part A).
2. **Install Termux + Termux:API** from **F-Droid** or the official GitHub APK —
   **not** the Play Store (outdated). Open the **Termux:API** app once (or run
   `termux-battery-status`) and allow the permission so battery/temp report.
3. **Paste the setup command** from the hub's Configure tab into Termux, giving
   this phone a **unique name**:
   ```
   curl -s http://192.168.137.1:4100/setup.sh | sh -s -- --name iqoo-1
   ```
   Use `iqoo-1`, `iqoo-2`, `iqoo-3` … a different name per phone.
4. **Wait for the model pull** (~2 GB the first time; a few minutes). Re-running
   the same command later just reconnects (safe, skips the download).
5. When it prints "ONLINE", the phone is on the hub's dashboard. Open the printed
   **worker-view URL** on the phone, Chrome fullscreen (or Add to Home Screen).

Troubleshoot: phone not showing up → it's on venue Wi-Fi not the hotspot, OR the
firewall rule (A2) is missing, OR a typo in the IP. `pkg update` then re-run if
`pkg install` complains.

---

## Part C — NPU per phone (optional, hub laptop + USB, advanced)
Needs the prebuilt bundle at `phone/npu/bundle/` and a Q4_0 model (see
`docs/NPU_SETUP.md`). Enable USB debugging on the phone (Settings → About → tap
Build number 7× → Developer options → USB debugging), plug in, then on the hub:
```
phone/npu/deploy-npu.ps1 -Name iqoo-1
```
Registers an NPU endpoint that groups with the phone's CPU one; the dashboard
badges it NPU. If it fights you, the phone still runs CPU — no harm.

---

## Part D — Office Kit (banks the phone-first rubric points)
Install **Office Kit** (pc.vivoglobal.com) on the laptop + phone. Use it to mirror
the dashboard/worker view onto a phone so the demo runs ON the phone, and use it
during the build (screen mirror / file transfer) — this is measured by device
telemetry (10% of the score).

---

## Part E — Run the demo
Open **Claude Code at the sisyphus repo root** (the `/sisyphus` skill +
`.mcp.json` are wired there — or copy both into any project you want to demo
against) and paste the `/sisyphus` prompt from `demo/DEMO_SCRIPT.md`, watching
the dashboard. Reset between runs with `git checkout -- .` in the target project.

---

## Add teammates as GitHub collaborators (repo owner)
On github.com → repo → Settings → Collaborators → Add people. Or:
`gh repo add-collaborator <user>` (or `gh api ...`). They then `git clone` and get
this runbook + all scripts. Pull latest before the event: `git pull`.

---

## Continue development on another teammate's Claude Code
Yes — any teammate can pick up the dev phases on their own machine + Claude Code.
The **repo is the handoff**: all code, the plan, and the full decision log live in
it. A fresh Claude Code session has NO memory of prior chats, so you hand it
context via the committed docs.

**Setup (once):**
1. Accept the GitHub invite, then `git clone https://github.com/siddh8nt/sisyphus`
   → `cd sisyphus` → `npm install --ignore-scripts` (needs Node ≥ 24 LTS).

**Start a Claude Code session and tell it, verbatim:**
> Read `docs/memory.md` (start with the LAST 2-3 entries — that's the current
> state + plan), then `docs/phases.md`, then continue the next unchecked phase.
> Follow `docs/rules.md`. Do NOT add any `Co-Authored-By: Claude` trailer to
> commits (see the rule in memory.md) — commits are authored by me alone.

That single message re-loads everything: what's done, what's next, and every
locked decision (architecture, llama.cpp-for-NPU, Phase 9 app plan, etc.).

**Coordination (avoid stepping on each other):**
- **One person / one Claude session edits the repo at a time.** Concurrent edits
  → merge conflicts.
- `git pull` **before** you start; `git commit` + `git push` **often** (at every
  green checkpoint) so the next person gets your work.
- For parallel work, use branches + PRs: `git checkout -b feature/x` → push →
  open a PR → merge.
- The committed `docs/memory.md` is the source of truth across machines. (Claude's
  *local* auto-memory does NOT travel between laptops — only the repo does.)

**Cross-platform note:** server / web / MCP / phone `*.sh` scripts are
cross-platform (Windows or Mac). The NPU deploy scripts are PowerShell
(`phone/npu/*.ps1`, Windows-first); `adb` also exists on Mac/Linux if a teammate
adapts them. The firewall step (Part A2) is Windows-only.
