#!/data/data/com.termux/files/usr/bin/sh
# Sisyphus telemetry loop. POSIX sh + curl. Posts a heartbeat every 3s.
# Degrades gracefully if termux-api battery access isn't granted.
#   sh telemetry.sh <phoneId>
# Served by the orchestrator with __ORCH_BASE__ filled in.
ORCH="__ORCH_BASE__"
PHONE_ID="$1"
[ -z "$PHONE_ID" ] && { echo "usage: telemetry.sh <phoneId>"; exit 1; }

while true; do
  PCT=""; TEMP=""
  BAT=$(termux-battery-status 2>/dev/null || true)
  if [ -n "$BAT" ]; then
    PCT=$(printf '%s' "$BAT" | sed -n 's/.*"percentage": *\([0-9]*\).*/\1/p')
    TEMP=$(printf '%s' "$BAT" | sed -n 's/.*"temperature": *\([0-9.]*\).*/\1/p')
  fi
  LOAD=$(awk '{print $1}' /proc/loadavg 2>/dev/null)
  MEMTOTAL=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)
  MEMAVAIL=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo 2>/dev/null)
  MEMUSED=0
  [ -n "$MEMTOTAL" ] && [ -n "$MEMAVAIL" ] && MEMUSED=$((MEMTOTAL - MEMAVAIL))

  curl -s -X POST "$ORCH/api/phones/$PHONE_ID/heartbeat" -H 'content-type: application/json' \
    -d "{\"battery\":${PCT:-0},\"batteryTempC\":${TEMP:-0},\"cpuLoad\":${LOAD:-0},\"memUsedMB\":${MEMUSED:-0},\"memTotalMB\":${MEMTOTAL:-0}}" \
    >/dev/null 2>&1

  sleep 3
done
