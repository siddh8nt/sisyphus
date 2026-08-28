<#
.SYNOPSIS
  Deploy the llama.cpp Hexagon bundle + model to a phone over adb, then start the
  NPU llama-server and register it with Sisyphus. Run this once per phone (after
  the phone's CPU endpoint is already online via the Termux one-liner).

.DESCRIPTION
  Expects a prebuilt bundle at phone/npu/bundle/ (from build-npu.ps1 / the Docker
  toolchain - see docs/NPU_SETUP.md), containing bin/, lib/, and gguf/<model>.

.EXAMPLE
  ./deploy-npu.ps1 -Name iqoo-1
  ./deploy-npu.ps1 -Name iqoo-2 -Serial 1a2b3c4d
#>
param(
  [Parameter(Mandatory = $true)][string]$Name,   # MUST match the phone's CPU endpoint name
  [string]$Serial = "",
  [string]$Model = "Qwen2.5-Coder-3B-Instruct-Q4_0.gguf",
  [string]$Arch = "v81",
  [string]$HtpDevice = "HTP0",
  [int]$Port = 8080,
  [int]$Ctx = 4096,
  [string]$OrchBase = "http://127.0.0.1:4100",
  [string]$BundleDir = "$PSScriptRoot\bundle",
  [switch]$SkipPush
)
$ErrorActionPreference = "Stop"
$dir = "/data/local/tmp/llama.cpp"

function Adb { param([Parameter(ValueFromRemainingArguments)]$args)
  if ($Serial) { & adb -s $Serial @args } else { & adb @args }
}

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  throw "adb not found on PATH. Install Android platform-tools (see docs/NPU_SETUP.md)."
}

# Confirm a device is connected + authorized.
$state = ((Adb get-state) -join "").Trim()
if ($state -ne "device") {
  throw "No authorized adb device (state='$state'). Enable USB debugging + accept the RSA prompt. See docs/NPU_SETUP.md."
}
Write-Host "adb device OK." -ForegroundColor Green

if (-not $SkipPush) {
  # Validate the local bundle.
  $server = Join-Path $BundleDir "bin\llama-server"
  $libDir = Join-Path $BundleDir "lib"
  if (-not (Test-Path $server)) { throw "Bundle missing bin/llama-server at $BundleDir. Build it first (docs/NPU_SETUP.md, build-npu.ps1)." }
  if (-not (Test-Path $libDir)) { throw "Bundle missing lib/ at $BundleDir." }
  $htp = Get-ChildItem -Path $libDir -Filter "libggml-htp-$Arch.so" -ErrorAction SilentlyContinue
  if (-not $htp) { Write-Host "WARNING: libggml-htp-$Arch.so not found in bundle lib/. Wrong arch? Continuing." -ForegroundColor Yellow }

  # Locate the model (bundle/gguf/<model> or bundle/<model>).
  $modelPath = Join-Path $BundleDir "gguf\$Model"
  if (-not (Test-Path $modelPath)) { $modelPath = Join-Path $BundleDir $Model }
  if (-not (Test-Path $modelPath)) { throw "Model $Model not found under $BundleDir (gguf/ or root). Download a Q4_0 GGUF - see docs/NPU_SETUP.md." }

  Write-Host "Pushing bundle to $dir (this can take a minute)..." -ForegroundColor Cyan
  Adb shell "mkdir -p $dir/gguf"
  Adb push "$BundleDir\bin" "$dir/" | Out-Null
  Adb push "$BundleDir\lib" "$dir/" | Out-Null
  Adb push "$modelPath" "$dir/gguf/$Model" | Out-Null
  Adb shell "chmod 755 $dir/bin/*" 2>$null
  Write-Host "Bundle + model pushed." -ForegroundColor Green
}

# Start the server + register (delegates to start-npu.ps1).
& "$PSScriptRoot\start-npu.ps1" -Name $Name -Serial $Serial -Model $Model -Arch $Arch `
  -HtpDevice $HtpDevice -Port $Port -Ctx $Ctx -OrchBase $OrchBase
