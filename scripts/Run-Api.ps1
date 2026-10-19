$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Use-LabEnvironment.ps1')
Set-LabDatabaseEnvironment
$jar = Join-Path $LabRoot 'services/commerce/target/commerce-service-0.1.0.jar'
if (!(Test-Path -LiteralPath $jar)) { throw 'Build first: scripts/Build-Lab.ps1' }
& (Join-Path $LabRuntime.java_home 'bin/java.exe') -jar $jar
exit $LASTEXITCODE
