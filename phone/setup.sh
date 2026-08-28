#!/data/data/com.termux/files/usr/bin/sh
# Sisyphus phone setup — CPU runtime (Termux + Ollama). Idempotent: safe to
# re-run, which is also how a phone reconnects after a reboot.
#   curl -s http://<LAPTOP_IP>:4100/setup.sh | sh -s -- --name phone1
# The orchestrator serves this file with __ORCH_BASE__ already filled in.
set -e

ORCH="__ORCH_BASE__"
MODEL="qwen2.5-coder:3b"
NAME="phone1"
while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

echo "== Sisyphus setup: $NAME -> $ORCH (model $MODEL) =="

# 1. Packages (idempotent). termux-api is optional (telemetry degrades without it).
echo "[1/6] installing ollama + termux-api ..."
pkg install -y ollama termux-api >/dev/null 2>&1 || echo "  (pkg install had warnings — continuing)"

# 2. Keep the CPU awake while we serve.
termux-wake-lock 2>/dev/null || true

# 3. Start Ollama on all interfaces if it isn't already answering.
if ! curl -s "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  echo "[2/6] starting ollama server ..."
  OLLAMA_HOST=0.0.0.0 nohup ollama serve >"$HOME/.sisyphus-ollama.log" 2>&1 &
  i=0
  while [ $i -lt 40 ]; do
    curl -s "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1 && break
    i=$((i + 1)); sleep 1
  done
else
  echo "[2/6] ollama already running"
fi

# 4. Pull the model (idempotent — skips quickly if already present; ~2GB first time).
echo "[3/6] pulling $MODEL (first time downloads ~2GB) ..."
ollama pull "$MODEL"

# 5. Detect this phone's Wi-Fi IP.
echo "[4/6] detecting IP ..."
IP=$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
[ -z "$IP" ] && IP=$(ip -4 addr show 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1 | grep -v '^127\.' | head -1)
[ -z "$IP" ] && IP=$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127\.' | head -1)
echo "  IP: $IP"

# 6. Register the CPU endpoint, then launch the telemetry loop.
echo "[5/6] registering with orchestrator ..."
HW=$(getprop ro.product.model 2>/dev/null || echo "Android")
RESP=$(curl -s -X POST "$ORCH/api/phones/register" -H 'content-type: application/json' \
  -d "{\"name\":\"$NAME\",\"ip\":\"$IP\",\"port\":11434,\"model\":\"$MODEL\",\"runtime\":\"cpu\",\"hw\":\"$HW\"}")
PHONE_ID=$(printf '%s' "$RESP" | sed -n 's/.*"phoneId":"\([^"]*\)".*/\1/p')
if [ -z "$PHONE_ID" ]; then
  echo "  ERROR: registration failed. Response: $RESP"
  echo "  Is the laptop hotspot on and the orchestrator running at $ORCH ?"
  exit 1
fi
echo "  registered: $PHONE_ID"

echo "[6/6] starting telemetry ..."
curl -s "$ORCH/telemetry.sh" >"$HOME/.sisyphus-telemetry.sh"
# stop any previous telemetry loop for idempotent re-runs
pkill -f "sisyphus-telemetry.sh" 2>/dev/null || true
nohup sh "$HOME/.sisyphus-telemetry.sh" "$PHONE_ID" >/dev/null 2>&1 &

echo ""
echo "== $NAME is ONLINE =="
echo "Open this on the phone (fullscreen):  $ORCH/worker/$PHONE_ID"
