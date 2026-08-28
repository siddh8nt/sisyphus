# NPU Setup — Snapdragon Hexagon via llama.cpp (Phase 6.5)

Researched 2026-08-29 from the **current upstream** llama.cpp Hexagon backend
(merged into `ggml-org/llama.cpp`, PR #12326 lineage). This is the authoritative
recipe for our devices — **do not code from memory; re-check these sources if the
toolchain has moved.**

Sources:
- Official doc: `ggml-org/llama.cpp` → `docs/backend/snapdragon/README.md`
- Build/run scripts: `scripts/snapdragon/build.py`, `scripts/snapdragon/run.py`
- Toolchain image: `ghcr.io/snapdragon-toolchain/arm64-android:v0.7`

## Device support (why this works for us)
The build produces per-Hexagon-arch HTP libraries:
`libggml-htp-v73.so` (8 Gen 2), `v75` (8 Gen 3), `v79` (8 Elite / Gen 4),
**`v81` (8 Elite Gen 5 / SM8850)**, plus `libggml-hexagon.so`.
- **iQOO 15 = Snapdragon 8 Elite Gen 5 = Hexagon v81** → use `--hex-arch v81`
  (`GGML_HEXAGON_ARCH=v81`). Supported upstream. ✅
- OnePlus 13s (8 Elite) → `v79` (not our path now — we're going straight to iQOO).

## Model quantization
The Hexagon HTP path requires **Q4_0** GGUFs (Q4_0-family). Verified examples in
the docs: `Llama-3.2-1B-Instruct-Q4_0`, `gemma-2-2b-it-Q4_0`.
- **Primary (coder):** `Qwen2.5-Coder-3B-Instruct-Q4_0.gguf`
  (e.g. HF `bartowski/Qwen2.5-Coder-3B-Instruct-GGUF`). Matches our CPU model
  family for a fair NPU-vs-CPU benchmark.
- **Proven fallback:** `Llama-3.2-3B-Instruct-Q4_0.gguf` — swap to this if Qwen
  hits an unsupported op on the NPU (the engine is model-agnostic).

## Prerequisites on the laptop
1. **Docker Desktop** (for the cross-compile toolchain). No local Hexagon SDK/NDK
   needed — the image bundles NDK r28b + Hexagon SDK 6.6.0.0.
2. **Android platform-tools (adb).** The deploy scripts auto-detect it on PATH or
   at the standard SDK path `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`
   (or pass `-AdbPath`). On this laptop it's already present there (v37.0.1). ✅
   - Enable USB debugging on the phone: Settings → About → tap *Build number* 7×
     → Developer options → USB debugging. Plug in USB, accept the RSA prompt.
   - Wireless: `adb tcpip 5555` then `adb connect <phoneIp>:5555` (USB first).

## Step 1 — Build the bundle (one-time, on the laptop)
Do this ahead of iQOO day and cache the output; it does not need a phone.
```powershell
# in a scratch folder
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
python scripts/snapdragon/build.py --target adb        # builds in Docker
```
This copies `docs/backend/snapdragon/CMakeUserPresets.json`, launches the Docker
container, and builds. Output (install tree) lands at
`pkg-android/llama.cpp/` containing `bin/` (llama-server, llama-cli, llama-bench)
and `lib/` (`libggml-hexagon.so`, `libggml-htp-v81.so`, …).
Copy `pkg-android/llama.cpp` to `sisyphus/phone/npu/bundle/` (gitignored).
Also download the model into `sisyphus/phone/npu/bundle/gguf/`.

Equivalent CMake (inside the container) if you build by hand:
```
GGML_HEXAGON=ON  GGML_OPENCL=ON  ANDROID_ABI=arm64-v8a
HEXAGON_SDK_ROOT=/opt/hexagon/6.6.0.0
cmake --preset arm64-android-snapdragon-release -B build-snapdragon
cmake --build build-snapdragon
cmake --install build-snapdragon --prefix pkg-android/llama.cpp
```

## Step 2 — Deploy + run (per phone, needs USB adb)
On-device layout (from `run.py`): everything under
`/data/local/tmp/llama.cpp/`, libs in `./lib`, binaries in `./bin`, models in
`./gguf`. The exact runtime contract is:
```
cd /data/local/tmp/llama.cpp && ulimit -c unlimited && \
  LD_LIBRARY_PATH=./lib ADSP_LIBRARY_PATH=./lib \
  GGML_HEXAGON_DEVICES=HTP0 GGML_HEXAGON_ARCH=v81 \
  ./bin/llama-server -m gguf/Qwen2.5-Coder-3B-Instruct-Q4_0.gguf \
     -ngl 99 -c 4096 --host 0.0.0.0 --port 8080
```
- `-ngl 99` offloads (nearly) all layers; on Hexagon the NPU "behaves as a GPU"
  for `-ngl`.
- `--host 0.0.0.0 --port 8080` → OpenAI-compatible server reachable over the
  hotspot at `http://<phoneWifiIp>:8080` — which is exactly a Sisyphus
  `runtime:"npu"` endpoint.
- `GGML_HEXAGON_DEVICES=HTP0` = one NPU session (fine for a ≤4B model). Multi-
  session (`HTP0:0,HTP0:1`) only needed for bigger models.

`phone/npu/deploy-npu.ps1` automates: check adb → push `bundle/` + model →
detect the phone's Wi-Fi IP → start `llama-server` (backgrounded) → poll
`/v1/models` → register the NPU endpoint with the orchestrator (same `--name` as
the CPU endpoint, so they group into one logical phone). `start-npu.ps1` restarts
the server without re-pushing.

## Step 3 — Benchmark (pitch stat)
```
python scripts/snapdragon/run.py --target adb --devices HTP0 -- llama-bench \
  -p 128 -n 64 -m gguf/Qwen2.5-Coder-3B-Instruct-Q4_0.gguf
```
Record prefill + generation tok/s for NPU, and compare to the CPU (Ollama) path
on the same prompt → `docs/memory.md`. (Doc reference point: Llama-1B Q4_0 hit
~169 tok/s prefill / ~51 tok/s gen — expect lower for a 3B.)

## Fallback contract (why the demo can't break)
Sisyphus health-checks each phone's NPU endpoint (`GET /v1/models`) before every
dispatch. If it's down/timeouts, the orchestrator transparently uses that phone's
**CPU** (Ollama) endpoint and emits a `reasoning` runtime-switch note. If NPU
bring-up fails entirely on a phone, it simply runs CPU — nothing else changes.
Chaos test: kill `llama-server` mid-session (`start-npu.ps1 -Stop`) and confirm
the task completes on CPU with the switch narrated.

## Useful env / flags (from run.py)
- `GGML_HEXAGON_ARCH` = v73/v75/v79/**v81** (or `--hex-arch`)
- `GGML_HEXAGON_DEVICES` = `HTP0`, `HTP0:0,HTP0:1`, `HTP0:0,HTP1:0`
- `GGML_HEXAGON_VERBOSE=1` (op logging), `GGML_HEXAGON_PROFILE=1|2` (perf),
  `GGML_HEXAGON_OPFILTER=<regex>` (disable ops, e.g. `FLASH_ATTN_EXT`)

## Time-box (from the build plan)
Two focused sessions on this Hexagon path. If it won't run on our device →
**Plan B: NexaSDK** Qualcomm-NPU runtime with its OpenAI-compatible server,
registered the same way (`runtime:"npu"`). Two sessions on Plan B max; then ship
**CPU-only** and describe NPU honestly as "supported architecture, device
bring-up pending." The dual-runtime design makes that a graceful degrade.

## Troubleshooting
- `adb devices` empty → USB debugging off, cable is charge-only, or RSA prompt
  not accepted. Try `adb kill-server; adb start-server`.
- Server starts then exits → check `/data/local/tmp/llama-server.log` on device
  (`adb shell cat /data/local/tmp/llama-server.log`). Common: wrong arch lib
  (set `--hex-arch v81`), or an unsupported op (try the Llama fallback model, or
  `GGML_HEXAGON_OPFILTER`).
- Endpoint unreachable from laptop → confirm phone Wi-Fi IP, that both are on the
  hotspot, and port 8080 (llama-server binds 0.0.0.0).
