param([string]$BuildOutput = 'work/msix/ci')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:ZEBBY_MSIX_QA_RUNNER -ne 'github-hosted') {
  throw 'Installed MSIX validation is restricted to a disposable GitHub-hosted Windows runner.'
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $BuildOutput))
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'work\msix')) + '\'
if (-not $buildRoot.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected MSIX validation directory.' }
$resultRoot = Join-Path $buildRoot 'Validation\installed'
New-Item -ItemType Directory -Path $resultRoot -Force | Out-Null
$packageStatus = Get-Content -LiteralPath (Join-Path $buildRoot 'Validation\package-status.json') -Raw | ConvertFrom-Json
if ($packageStatus.status -ne 'packaged' -or $packageStatus.identity.identityName -ne 'Zebby.StoreQA' -or $packageStatus.identity.publisher -ne 'CN=Zebby Store QA') {
  throw 'Only the dedicated Zebby.StoreQA package can be installed by this validation script.'
}
if (@(Get-AppxPackage -Name 'Zebby.StoreQA').Count -ne 0) { throw 'The temporary QA package is already installed. Use a fresh runner.' }
$packageFamily = $packageStatus.identity.packageFamilyName
if ($packageFamily -notmatch '^Zebby\.StoreQA_[a-z0-9]{13}$') { throw 'Unexpected QA package family.' }
$candidates = @(Get-ChildItem -LiteralPath (Join-Path $buildRoot 'Packages\Individual architectures') -Filter '*-x64.msix' -File)
if ($candidates.Count -ne 1) { throw 'Expected exactly one unsigned x64 MSIX.' }
$unsigned = $candidates[0].FullName
$originalHash = (Get-FileHash -LiteralPath $unsigned -Algorithm SHA256).Hash
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$sdk = Get-ChildItem -LiteralPath $sdkRoot -Directory |
  Where-Object { $_.Name -match '^10\.\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.Name } -Descending |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'x64\signtool.exe') } |
  Select-Object -First 1
if (-not $sdk) { throw 'SignTool is required on the validation runner.' }
$signTool = Join-Path $sdk.FullName 'x64\signtool.exe'
$scratch = Join-Path $env:RUNNER_TEMP ('zebby-msix-installed-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
$signedCopy = Join-Path $scratch 'Zebby-QA-signed.msix'
Copy-Item -LiteralPath $unsigned -Destination $signedCopy
$certificate = $null
$trustedCertificate = $null
$installed = $null
$failure = $null
$report = [ordered]@{ status = 'running'; identity = 'Zebby.StoreQA'; publisher = 'CN=Zebby Store QA'; packageFamilyName = $packageFamily; unsignedSha256 = $originalHash; checks = @() }
$startedAt = Get-Date

function Invoke-QaCommand([string]$Executable, [string[]]$Arguments, [string]$Log) {
  # Windows PowerShell treats native stderr as ErrorRecord objects, including harmless Node warnings.
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Executable @Arguments 2>&1 | Out-File -LiteralPath $Log -Encoding utf8
    $commandExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($commandExitCode -ne 0) { throw "Native validation command failed ($commandExitCode). See $Log." }
}

try {
  # This key is non-exportable, lives only on the disposable runner, and never signs an upload artifact.
  $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Zebby Store QA' -KeyAlgorithm RSA -KeyLength 2048 `
    -CertStoreLocation 'Cert:\CurrentUser\My' -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddDays(1)
  $certificateFile = Join-Path $scratch 'QA-public.cer'
  Export-Certificate -Cert $certificate -FilePath $certificateFile | Out-Null
  $trustedCertificate = Import-Certificate -FilePath $certificateFile -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople'
  Invoke-QaCommand $signTool @('sign', '/fd', 'SHA256', '/sha1', $certificate.Thumbprint, '/s', 'My', $signedCopy) (Join-Path $resultRoot 'signing.log')
  Invoke-QaCommand $signTool @('verify', '/pa', '/v', $signedCopy) (Join-Path $resultRoot 'signature-verification.log')
  if ((Get-FileHash -LiteralPath $unsigned -Algorithm SHA256).Hash -ne $originalHash) { throw 'The unsigned upload artifact changed during QA signing.' }
  $report.checks += 'Only a copied MSIX received the temporary signature; the unsigned package hash is unchanged.'

  Add-AppxPackage -Path $signedCopy -ErrorAction Stop
  $installed = Get-AppxPackage -Name 'Zebby.StoreQA'
  if (-not $installed -or $installed.PackageFamilyName -ne $packageFamily) { throw 'Windows registered an unexpected package identity.' }
  $metadata = [ordered]@{ name = $installed.Name; packageFamilyName = $installed.PackageFamilyName; packageFullName = $installed.PackageFullName; installLocation = $installed.InstallLocation }
  $metadataPath = Join-Path $resultRoot 'installed-package.json'
  [IO.File]::WriteAllText($metadataPath, ($metadata | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
  $report.checks += 'Windows registered the expected package family.'
  Invoke-QaCommand 'node' @((Join-Path $repoRoot 'scripts\qa-msix-installed.mjs'), '--installed', $metadataPath, '--output', $resultRoot, '--phase', 'smoke') (Join-Path $resultRoot 'smoke.log')
  $report.checks += 'Installed native process, update guards, settings providers and durable storage checks passed.'

  Remove-AppxPackage -Package $installed.PackageFullName -ErrorAction Stop
  $installed = $null
  if (@(Get-AppxPackage -Name 'Zebby.StoreQA').Count -ne 0) { throw 'Windows still reports the QA package as installed.' }
  Invoke-QaCommand 'node' @((Join-Path $repoRoot 'scripts\qa-msix-installed.mjs'), '--installed', $metadataPath, '--output', $resultRoot, '--phase', 'after-uninstall') (Join-Path $resultRoot 'uninstall.log')
  $report.checks += 'After removal, original and working databases survive, while package models and settings are removed.'
  $report.status = 'passed'
} catch {
  $failure = $_
  $report.status = 'failed'
  $report.error = $_.Exception.Message
} finally {
  # Capture deployment failures before cleanup. Never collect private settings or certificate material.
  try {
    Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-AppXDeploymentServer/Operational'; StartTime = $startedAt } -ErrorAction Stop |
      Select-Object -First 80 TimeCreated, Id, LevelDisplayName, Message |
      Format-List | Out-File -LiteralPath (Join-Path $resultRoot 'deployment.log') -Encoding utf8
  } catch { }
  if ($installed) {
    try {
      $packageLogs = Join-Path $env:LOCALAPPDATA ('Packages\' + $packageFamily + '\LocalState\Zebby\Logs')
      if (Test-Path -LiteralPath $packageLogs) { Copy-Item -LiteralPath $packageLogs -Destination (Join-Path $resultRoot 'profile-logs') -Recurse -Force }
      Remove-AppxPackage -Package $installed.PackageFullName -ErrorAction Stop
    } catch { $report.cleanupError = $_.Exception.Message; $report.status = 'failed' }
  }
  try {
    if ($trustedCertificate) { Remove-Item -LiteralPath ('Cert:\LocalMachine\TrustedPeople\' + $trustedCertificate.Thumbprint) -Force -ErrorAction Stop }
    if ($certificate) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $certificate.Thumbprint) -DeleteKey -Force -ErrorAction Stop }
  } catch { $report.certificateCleanupError = $_.Exception.Message; $report.status = 'failed' }
  $scratchTarget = [IO.Path]::GetFullPath($scratch)
  $runnerTempRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
  if ($scratchTarget.StartsWith($runnerTempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $scratchTarget -Leaf).StartsWith('zebby-msix-installed-')) {
    Remove-Item -LiteralPath $scratchTarget -Recurse -Force
  } else { throw 'Refusing cleanup outside the temporary runner directory.' }
  $report.finishedAt = (Get-Date).ToUniversalTime().ToString('o')
  [IO.File]::WriteAllText((Join-Path $resultRoot 'runner-report.json'), ($report | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
}
if ($failure) { throw $failure }
if ($report.status -ne 'passed') { throw 'Installed MSIX validation did not finish successfully.' }
Write-Output 'Installed MSIX validation passed.'
