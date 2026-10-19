$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Use-LabEnvironment.ps1')
Push-Location $LabRoot
try {
    & (Join-Path $PSScriptRoot 'Start-MySQL.ps1')
    & $LabRuntime.python -X utf8 scripts/initialize_database.py
    if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed' }
    Set-LabDatabaseEnvironment -IncludeTestAdmin
    try {
        & (Join-Path $LabRuntime.maven_home 'bin/mvn.cmd') -f services/commerce/pom.xml -B -ntp -Pmysql-it clean verify
        $javaExitCode = $LASTEXITCODE
    } finally {
        Remove-Item Env:COMMERCE_TEST_ADMIN_URL, Env:COMMERCE_TEST_ADMIN_USER, Env:COMMERCE_TEST_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    }
    if ($javaExitCode -ne 0) { throw 'Java verification failed' }
    & $LabRuntime.npm --prefix web --cache work/npm-cache ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    & $LabRuntime.npm --prefix web test
    if ($LASTEXITCODE -ne 0) { throw 'Frontend request tests failed' }
    & $LabRuntime.npm --prefix web run build
    if ($LASTEXITCODE -ne 0) { throw 'Vue build failed' }
} finally { Pop-Location }
