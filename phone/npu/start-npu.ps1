<#
.SYNOPSIS
  Start (or stop) llama-server on a phone's Hexagon NPU and register it with the
  Sisyphus orchestrator as a runtime:"npu" endpoint. Assumes the bundle + model
  are already on the device (deploy-npu.ps1 does the pushing).

.EXAMPLE
  ./start-npu.ps1 -Name iqoo-1
  ./start-npu.ps1 -Name iqoo-1 -Stop      # chaos test: kill NPU, fallback to CPU
#>
param(
  [Parameter(Mandatory = $true)][string]$Name,   # MUST match the CPU endpoint name
  [string]$Serial = "",                          # adb serial (optional)
  [string]$Model = "Qwen2.5-Coder-3B-Instruct-Q4_0.gguf",
  [string]$Arch = "v81",                         # v81 = Snapdragon 8 Elite Gen 5 (iQOO 15)
  [string]$HtpDevice = "HTP0",
  [int]$Port = 8080,
  [int]$Ctx = 4096,
  [string]$OrchBase = "http://127.0.0.1:4100",
  [string]$AdbPath = "",
  [switch]$Stop
)
$ErrorActionPreference = "Stop"
$dir = "/data/local/tmp/llama.cpp"

# Resolve adb: explicit override -> PATH -> standard Android SDK location.
function Resolve-Adb { param([string]$Override)
  if ($Override -and (Test-Path $Override)) { return $Override }
  $onPath = Get-Command adb -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
  if (Test-Path $sdk) { return $sdk }
  throw "adb not found. Install Android platform-tools or pass -AdbPath (see docs/NPU_SETUP.md)."
}
$script:AdbExe = Resolve-Adb $AdbPath

function Adb { param([Parameter(ValueFromRemainingArguments)]$args)
  if ($Serial) { & $script:AdbExe -s $Serial @args } else { & $script:AdbExe @args }
}

if ($Stop) {
  Write-Host "Stopping llama-server on device ($Name)..." -ForegroundColor Yellow
  Adb shell "pkill -f llama-server" 2>$null
  Write-Host "Stopped. The NPU endpoint will go unhealthy; Sisyphus falls back to CPU." -ForegroundColor Yellow
  exit 0
}

# Kill any previous instance (idempotent restart)
Adb shell "pkill -f llama-server" 2>$null
Start-Sleep -Milliseconds 500

# Start llama-server on the NPU, backgrounded + detached (nohup).
$run = "cd $dir && ulimit -c unlimited && " +
       "LD_LIBRARY_PATH=./lib ADSP_LIBRARY_PATH=./lib " +
       "GGML_HEXAGON_DEVICES=$HtpDevice GGML_HEXAGON_ARCH=$Arch " +
       "nohup ./bin/llama-server -m gguf/$Model -ngl 99 -c $Ctx " +
       "--host 0.0.0.0 --port $Port > /data/local/tmp/llama-server.log 2>&1 </dev/null &"
Write-Host "Starting llama-server ($Model, arch $Arch) on the NPU..." -ForegroundColor Cyan
# `</dev/null` detaches stdin so the adb shell returns instead of hanging on the
# backgrounded server's inherited stdin pipe. Extra guard: bound the call so a
# stubborn adb shell can't block the whole deploy — the server keeps running.
$job = Start-Job { param($exe,$s,$cmd) if ($s) { & $exe -s $s shell $cmd } else { & $exe shell $cmd } } -ArgumentList $script:AdbExe, $Serial, $run
Wait-Job $job -Timeout 15 | Out-Null
Remove-Job $job -Force

# Detect the phone's Wi-Fi IP (reachable over the hotspot).
$ip = (Adb shell "ip route get 1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p'") -join ""
$ip = $ip.Trim()
if (-not $ip) { $ip = ((Adb shell "ip -4 addr show wlan0 2>/dev/null | sed -n 's/.*inet \([0-9.]*\).*/\1/p'") -join "").Trim() }
if (-not $ip) { throw "Could not detect the phone's Wi-Fi IP. Is it on the hotspot?" }
Write-Host "Phone Wi-Fi IP: $ip" -ForegroundColor Green

# Poll the OpenAI-compatible endpoint from the laptop until it answers.
$base = "http://${ip}:${Port}"
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-RestMethod -Uri "$base/v1/models" -TimeoutSec 3 | Out-Null
    $ok = $true; break
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $ok) {
  Write-Host "llama-server did not come up in 60s. Check the device log:" -ForegroundColor Red
  Write-Host "  adb shell cat /data/local/tmp/llama-server.log" -ForegroundColor Red
  throw "NPU endpoint not reachable at $base/v1/models"
}
Write-Host "NPU endpoint is UP at $base" -ForegroundColor Green

# Register the NPU endpoint (same name -> groups with the CPU endpoint).
$hw = ((Adb shell "getprop ro.product.model") -join "").Trim()
$body = @{ name = $Name; ip = $ip; port = $Port; model = $Model; runtime = "npu"; hw = "$hw (Hexagon $Arch)" } | ConvertTo-Json -Compress
$resp = Invoke-RestMethod -Uri "$OrchBase/api/phones/register" -Method Post -ContentType "application/json" -Body $body
Write-Host "Registered NPU endpoint for '$Name' -> phoneId $($resp.phoneId)" -ForegroundColor Green
Write-Host "Done. Sisyphus will now prefer the NPU for this phone." -ForegroundColor Green
