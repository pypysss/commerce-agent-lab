# Keep this PowerShell open. Ctrl+C stops only processes created by this launcher.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Use-LabEnvironment.ps1')
$children = @()
$ownsMysql = $false
function Test-LocalPort([int]$port) {
    $tcp = [System.Net.Sockets.TcpClient]::new()
    try { $tcp.Connect('127.0.0.1', $port); return $true } catch { return $false }
    finally { $tcp.Dispose() }
}
try {
    $ownsMysql = !(Test-LocalPort $LabRuntime.mysql_port)
    & (Join-Path $PSScriptRoot 'Start-MySQL.ps1')
    Set-LabDatabaseEnvironment
    if (!(Test-LocalPort $LabRuntime.api_port)) {
        $jar = Join-Path $LabRoot 'services/commerce/target/commerce-service-0.1.0.jar'
        if (!(Test-Path -LiteralPath $jar)) { throw 'Build first: scripts/Build-Lab.ps1' }
        $children += Start-Process -FilePath (Join-Path $LabRuntime.java_home 'bin/java.exe') `
            -ArgumentList @('-jar', ('"' + $jar + '"')) -WorkingDirectory $LabRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $LabRoot 'state/api.out.log') `
            -RedirectStandardError (Join-Path $LabRoot 'state/api.err.log')
    }
    if (!(Test-LocalPort $LabRuntime.web_port)) {
        $vite = Join-Path $LabRoot 'web/node_modules/vite/bin/vite.js'
        $children += Start-Process -FilePath $LabRuntime.node `
            -ArgumentList @(('"' + $vite + '"')) `
            -WorkingDirectory (Join-Path $LabRoot 'web') -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $LabRoot 'state/web.out.log') `
            -RedirectStandardError (Join-Path $LabRoot 'state/web.err.log')
    }
    $apiUrl = "$($env:COMMERCE_API_TARGET)/api/v1/products?page=1&size=1"
    $webUrl = "http://127.0.0.1:$($LabRuntime.web_port)/"
    & $LabRuntime.python -X utf8 (Join-Path $PSScriptRoot 'wait_for_services.py') --api $apiUrl --web $webUrl
    if ($LASTEXITCODE -ne 0) { throw 'Lab readiness failed; see state/ logs.' }
    Write-Host "Open $webUrl - keep this terminal open; Ctrl+C to stop."
    while ($true) {
        foreach ($child in $children) {
            if ($child.HasExited) { throw "Lab process exited; see state/ logs ($($child.Id))" }
        }
        Start-Sleep -Seconds 1
    }
} finally {
    foreach ($child in $children) {
        if (!$child.HasExited) { Stop-Process -Id $child.Id -ErrorAction SilentlyContinue }
    }
    if ($ownsMysql) {
        $connection = Get-Content -LiteralPath (Join-Path $LabRoot 'state/mysql-connection.json') -Raw | ConvertFrom-Json
        $env:MYSQL_PWD = $connection.root_password
        try {
            & (Join-Path $LabRuntime.mysql_home 'bin/mysql.exe') --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($LabRuntime.mysql_port)" --user=root --execute='SHUTDOWN'
        } finally { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
    }
}
