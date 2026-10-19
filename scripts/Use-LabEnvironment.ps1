$ErrorActionPreference = 'Stop'
$LabRoot = Split-Path $PSScriptRoot -Parent
$LabRuntime = Get-Content -LiteralPath (Join-Path $LabRoot 'state/runtime.json') -Raw | ConvertFrom-Json
$env:JAVA_HOME = $LabRuntime.java_home
$env:Path = "$($LabRuntime.java_home)\bin;$($LabRuntime.maven_home)\bin;$(Split-Path $LabRuntime.node -Parent);$env:Path"
$env:PYTHONUTF8 = '1'
$env:COMMERCE_DB_PORT = [string]$LabRuntime.mysql_port
$env:COMMERCE_PORT = [string]$LabRuntime.api_port
$env:SERVER_PORT = [string]$LabRuntime.api_port
$env:COMMERCE_WEB_PORT = [string]$LabRuntime.web_port
$env:COMMERCE_API_TARGET = "http://127.0.0.1:$($LabRuntime.api_port)"
$LabMavenRepo = Join-Path $LabRoot 'work\maven-repository'
$env:MAVEN_SKIP_RC = '1'
$env:MAVEN_OPTS = "-Dmaven.repo.local=$LabMavenRepo -Dfile.encoding=UTF-8"
$env:MAVEN_ARGS = "-s `"$(Join-Path $LabRoot 'infra/maven-settings.xml')`""

function Set-LabDatabaseEnvironment {
    param([switch]$IncludeTestAdmin)
    # Called after MySQL bootstrap, so all three launch paths use the same account.
    $databaseConfig = Get-Content -LiteralPath (Join-Path $LabRoot 'state/mysql-writer.json') -Raw | ConvertFrom-Json
    $env:COMMERCE_DB_USER = $databaseConfig.user
    $env:COMMERCE_DB_PASSWORD = $databaseConfig.password
    $env:COMMERCE_DB_URL = "jdbc:mysql://127.0.0.1:$($LabRuntime.mysql_port)/$($databaseConfig.database)?characterEncoding=UTF-8&connectionTimeZone=UTC&connectTimeout=2000&socketTimeout=3000"
    if ($IncludeTestAdmin) {
        $testAdmin = Get-Content -LiteralPath (Join-Path $LabRoot 'state/mysql-connection.json') -Raw | ConvertFrom-Json
        $env:COMMERCE_TEST_ADMIN_URL = $env:COMMERCE_DB_URL
        $env:COMMERCE_TEST_ADMIN_USER = 'root'
        $env:COMMERCE_TEST_ADMIN_PASSWORD = $testAdmin.root_password
    }
}
# These variables affect this PowerShell process and its children, never the global PATH.
