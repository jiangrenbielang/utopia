$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$desktop = Join-Path $root 'desktop'
$out = Join-Path $desktop 'resources\mpv'
$source = if ($env:MPV_SOURCE) { $env:MPV_SOURCE } else { 'C:\Program Files\MPV Player' }

if (-not (Test-Path (Join-Path $source 'mpv.exe'))) {
  throw "mpv.exe not found at $source. Set MPV_SOURCE to the folder containing mpv.exe."
}

New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item (Join-Path $source 'mpv.exe') $out -Force
$d3d = Join-Path $source 'd3dcompiler_43.dll'
if (Test-Path $d3d) { Copy-Item $d3d $out -Force }
$portable = Join-Path $source 'mpv'
if (Test-Path $portable) {
  Copy-Item $portable $out -Recurse -Force
}
Write-Host "[desktop] mpv copied: $(Join-Path $out 'mpv.exe')"
