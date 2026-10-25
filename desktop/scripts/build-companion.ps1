$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$desktop = Join-Path $root 'desktop'
$companion = Join-Path $root 'companion'
$out = Join-Path $desktop 'resources\companion'
$build = Join-Path $desktop '.pyinstaller'

if (-not (Test-Path (Join-Path $companion 'run.py'))) {
  throw "companion source not found at $companion"
}

New-Item -ItemType Directory -Force -Path $out | Out-Null
New-Item -ItemType Directory -Force -Path $build | Out-Null

Write-Host '[desktop] installing PyInstaller if needed...'
py -3 -m pip install --disable-pip-version-check --quiet pyinstaller

Write-Host '[desktop] building utopia-companion.exe...'
py -3 -m PyInstaller --noconfirm --clean --onefile --noconsole --name utopia-companion --distpath $out --workpath $build --specpath $build (Join-Path $companion 'run.py')

Write-Host "[desktop] companion built: $(Join-Path $out 'utopia-companion.exe')"