$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Use-LabEnvironment.ps1')
Push-Location (Join-Path $LabRoot 'web')
try { & $LabRuntime.node node_modules/vite/bin/vite.js }
finally { Pop-Location }
exit $LASTEXITCODE
