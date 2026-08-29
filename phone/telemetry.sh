#!/data/data/com.termux/files/usr/bin/sh
# Sisyphus telemetry loop. POSIX sh + curl. Posts a heartbeat every 3s.
# Degrades gracefully if termux-api battery access isn't granted.
#   sh telemetry.sh <phoneId> [name] [model]
# Served by the orchestrator with __ORCH_BASE__ filled in.
ORCH="__ORCH_BASE__"
PHONE_ID="$1"
NAME="$2"      # passed by setup.sh so we can self-heal on a hub restart
MODEL="$3"
[ -z "$PHONE_ID" ] && { echo "usage: telemetry.sh <phoneId> [name] [model]"; exit 1; }

# Re-register the CPU endpoint with the orchestrator. Used on first-run isn't
# needed (setup.sh already did it) but on a hub restart the in-memory registry
# is empty and heartbeats start 404ing — re-registering brings the phone back
# without a human. phoneId is deterministic per name, so it stays stable.
reregister() {
  [ -z "$NAME" ] && return 1
  IP=$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
  [ -z "$IP" ] && IP=$(ip -4 addr show 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1 | grep -v '^127\.' | head -1)
  [ -z "$IP" ] && return 1
  HW=$(getprop ro.product.model 2>/dev/null || echo "Android")
  curl -s -X POST "$ORCH/api/phones/register" -H 'content-type: application/json' \
    -d "{\"name\":\"$NAME\",\"ip\":\"$IP\",\"port\":11434,\"model\":\"${MODEL:-qwen2.5-coder:3b}\",\"runtime\":\"cpu\",\"hw\":\"$HW\"}" \
    >/dev/null 2>&1
}

while true; do
  PCT=""; TEMP=""
  # `timeout` guards against termux-battery-status blocking on an ungranted
  # permission dialog, which would otherwise freeze the whole heartbeat loop.
  BAT=$(timeout 2 termux-battery-status 2>/dev/null || true)
  if [ -n "$BAT" ]; then
    PCT=$(printf '%s' "$BAT" | sed -n 's/.*"percentage": *\([0-9]*\).*/\1/p')
    TEMP=$(printf '%s' "$BAT" | sed -n 's/.*"temperature": *\([0-9.]*\).*/\1/p')
  fi
  LOAD=$(awk '{print $1}' /proc/loadavg 2>/dev/null)
  MEMTOTAL=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)
  MEMAVAIL=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo 2>/dev/null)
  MEMUSED=0
  [ -n "$MEMTOTAL" ] && [ -n "$MEMAVAIL" ] && MEMUSED=$((MEMTOTAL - MEMAVAIL))

  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$ORCH/api/phones/$PHONE_ID/heartbeat" \
    -H 'content-type: application/json' \
    -d "{\"battery\":${PCT:-0},\"batteryTempC\":${TEMP:-0},\"cpuLoad\":${LOAD:-0},\"memUsedMB\":${MEMUSED:-0},\"memTotalMB\":${MEMTOTAL:-0}}" \
    2>/dev/null)

  # 404 = the hub forgot us (restarted). Re-onboard and keep going.
  [ "$CODE" = "404" ] && reregister

  sleep 3
done
