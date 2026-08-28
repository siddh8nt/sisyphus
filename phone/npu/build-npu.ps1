<#
.SYNOPSIS
  One-time: build the llama.cpp Hexagon bundle via the official Docker toolchain
  and stage it at phone/npu/bundle/. No phone needed. Do this ahead of time.

.DESCRIPTION
  Requires Docker Desktop, git, and python on the laptop. Follows
  docs/NPU_SETUP.md. After it finishes, download a Q4_0 model into
  phone/npu/bundle/gguf/ (see the printed instructions), then run deploy-npu.ps1.
#>
param(
  [string]$WorkDir = "$PSScriptRoot\_build",
  [string]$BundleDir = "$PSScriptRoot\bundle"
)
$ErrorActionPreference = "Stop"

foreach ($tool in @("docker", "git", "python")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool not found on PATH. Need Docker Desktop + git + python (see docs/NPU_SETUP.md)."
  }
}
try { docker info *> $null } catch { throw "Docker daemon not running. Start Docker Desktop and retry." }

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$repo = Join-Path $WorkDir "llama.cpp"
if (-not (Test-Path $repo)) {
  Write-Host "Cloning ggml-org/llama.cpp..." -ForegroundColor Cyan
  git clone --depth 1 https://github.com/ggml-org/llama.cpp $repo
} else {
  Write-Host "Updating existing llama.cpp checkout..." -ForegroundColor Cyan
  git -C $repo pull --ff-only
}

Write-Host "Building Hexagon bundle in Docker (this takes a while the first time)..." -ForegroundColor Cyan
Push-Location $repo
try {
  python scripts/snapdragon/build.py --target adb
} finally {
  Pop-Location
}

# Auto-detect the install tree (build.py names it pkg-<target>/llama.cpp,
# e.g. pkg-adb or pkg-android depending on the target flag).
$pkg = Get-ChildItem -Path $repo -Directory -Filter "pkg-*" -ErrorAction SilentlyContinue |
  ForEach-Object { Join-Path $_.FullName "llama.cpp" } |
  Where-Object { Test-Path (Join-Path $_ "bin") } |
  Select-Object -First 1
if (-not $pkg) { throw "Build did not produce a pkg-*/llama.cpp tree with bin/. Check the build output above." }
Write-Host "Found install tree: $pkg" -ForegroundColor Green

Write-Host "Staging bundle -> $BundleDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $BundleDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $pkg "*") $BundleDir
New-Item -ItemType Directory -Force -Path (Join-Path $BundleDir "gguf") | Out-Null

Write-Host ""
Write-Host "Bundle ready at $BundleDir" -ForegroundColor Green
Get-ChildItem (Join-Path $BundleDir "lib") -Filter "libggml-htp-*.so" | ForEach-Object { Write-Host "  $($_.Name)" }
Write-Host ""
Write-Host "NEXT: download a Q4_0 model into $BundleDir\gguf\ , e.g.:" -ForegroundColor Yellow
Write-Host "  Qwen2.5-Coder-3B-Instruct-Q4_0.gguf  (bartowski/Qwen2.5-Coder-3B-Instruct-GGUF)" -ForegroundColor Yellow
Write-Host "  fallback: Llama-3.2-3B-Instruct-Q4_0.gguf" -ForegroundColor Yellow
Write-Host "Then: ./deploy-npu.ps1 -Name <phone-name>" -ForegroundColor Yellow
