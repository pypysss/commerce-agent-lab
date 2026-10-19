param([switch]$Foreground)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Use-LabEnvironment.ps1')
$mysqlState = Join-Path $LabRoot 'state/mysql-connection.json'
$mysqlExe = Join-Path $LabRuntime.mysql_home 'bin/mysql.exe'
$mysqldExe = Join-Path $LabRuntime.mysql_home 'bin/mysqld.exe'
$mysqlLog = Join-Path $LabRoot 'state/mysql-error.log'

function Test-LabMysql {
    $tcp = [System.Net.Sockets.TcpClient]::new()
    try { $tcp.Connect('127.0.0.1', $LabRuntime.mysql_port); return $true }
    catch { return $false }
    finally { $tcp.Dispose() }
}

if (!(Test-LabMysql)) {
    $arguments = @('--no-defaults', "--basedir=$($LabRuntime.mysql_home)",
        "--datadir=$($LabRuntime.mysql_data)", '--bind-address=127.0.0.1',
        "--port=$($LabRuntime.mysql_port)", '--mysqlx=OFF', '--no-monitor',
        '--innodb-buffer-pool-size=128M', '--max-connections=30', "--log-error=$mysqlLog")
    if ($Foreground) { & $mysqldExe @arguments; exit $LASTEXITCODE }
    $quotedArguments = $arguments | ForEach-Object { '"' + $_ + '"' }
    $process = Start-Process -FilePath $mysqldExe -ArgumentList $quotedArguments -WindowStyle Hidden -PassThru
    $process.Id | Set-Content -LiteralPath (Join-Path $LabRoot 'state/mysql.pid')
    $deadline = (Get-Date).AddSeconds(30)
    while (!(Test-LabMysql)) {
        if ((Get-Date) -gt $deadline -or $process.HasExited) { throw "MySQL not ready; see $mysqlLog" }
        Start-Sleep -Milliseconds 250
    }
}

if (!(Test-Path -LiteralPath $mysqlState)) {
    # Initial empty-password root exists only until this local bootstrap completes.
    $rootSecret = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    $readerSecret = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    $sql = "ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootSecret'; CREATE DATABASE IF NOT EXISTS commerce CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE USER IF NOT EXISTS 'commerce_reader'@'localhost' IDENTIFIED BY '$readerSecret'; GRANT SELECT ON commerce.* TO 'commerce_reader'@'localhost';"
    $sql | & $mysqlExe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($LabRuntime.mysql_port)" --user=root --default-character-set=utf8mb4
    if ($LASTEXITCODE -ne 0) { throw 'Initial MySQL account bootstrap failed; inspect before retrying.' }
    @{ root_password=$rootSecret; user='commerce_reader'; password=$readerSecret; database='commerce' } |
        ConvertTo-Json | Set-Content -LiteralPath $mysqlState -Encoding utf8
}
$connection = Get-Content -LiteralPath $mysqlState -Raw | ConvertFrom-Json
$env:MYSQL_PWD = $connection.password
try {
    & $mysqlExe --no-defaults --protocol=TCP --host=127.0.0.1 "--port=$($LabRuntime.mysql_port)" "--user=$($connection.user)" --batch --skip-column-names --execute='SELECT VERSION();'
    if ($LASTEXITCODE -ne 0) { throw 'Existing listener is not the expected lab MySQL instance.' }
} finally { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
Write-Host "MySQL ready on 127.0.0.1:$($LabRuntime.mysql_port); application account has SELECT only."
