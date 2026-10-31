param(
  [string]$ArtifactsRoot = $PSScriptRoot,
  [string]$IdentityPath,
  [string]$OutputRoot,
  [string]$SdkBin
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ArtifactsRoot = (Resolve-Path -LiteralPath $ArtifactsRoot).Path
if (-not $OutputRoot) { $OutputRoot = $ArtifactsRoot }
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$buildRoot = Join-Path $ArtifactsRoot 'Source and build'
$payloadRoot = Join-Path $buildRoot 'payloads'
if (-not (Test-Path -LiteralPath (Join-Path $buildRoot 'AppxManifest.template.xml'))) {
  throw 'Use this script from the prepared Microsoft Store listing folder.'
}

if ($IdentityPath) {
  $identity = Get-Content -LiteralPath $IdentityPath -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
  Write-Host "Paste the three values from Zebby's Partner Center Product identity page."
  $identity = [pscustomobject]@{
    identityName = Read-Host 'Package/Identity/Name'
    publisher = Read-Host 'Package/Identity/Publisher (including CN=)'
    publisherDisplayName = Read-Host 'Package/Properties/PublisherDisplayName'
  }
}
if ($identity.identityName -cnotmatch '^[A-Za-z0-9][A-Za-z0-9.-]{2,49}$') { throw 'Invalid package identity name.' }
if ($identity.publisher -cnotmatch '^CN=.' -or $identity.publisher.Length -gt 8192) { throw 'Invalid publisher. Include the exact CN= value.' }
if (-not $identity.publisherDisplayName -or $identity.publisherDisplayName.Length -gt 256) { throw 'Invalid publisher display name.' }
foreach ($value in @($identity.identityName, $identity.publisher, $identity.publisherDisplayName)) {
  if ($value -ne $value.Trim() -or $value -match '[\r\n\x00]|REPLACE_ME|YOUR_PUBLISHER|TODO') { throw 'Use exact identity values, with no placeholders or surrounding whitespace.' }
}

$sha = [Security.Cryptography.SHA256]::Create()
try { $bytes = $sha.ComputeHash([Text.Encoding]::Unicode.GetBytes($identity.publisher)) } finally { $sha.Dispose() }
$bits = -join ($bytes[0..7] | ForEach-Object { [Convert]::ToString($_, 2).PadLeft(8, '0') })
$bits += '0'
$alphabet = '0123456789abcdefghjkmnpqrstvwxyz'
$publisherId = -join (0..12 | ForEach-Object { $alphabet[[Convert]::ToInt32($bits.Substring($_ * 5, 5), 2)] })
$family = $identity.identityName + '_' + $publisherId
if ($identity.PSObject.Properties.Name -contains 'packageFamilyName' -and $identity.packageFamilyName -cne $family) {
  throw 'Package Family Name does not match the name and publisher.'
}

if (-not $SdkBin) {
  $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  $candidates = @(Get-ChildItem -LiteralPath $sdkRoot -Directory | Where-Object { $_.Name -match '^10\.\d+\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending)
  foreach ($candidate in $candidates) {
    $folder = Join-Path $candidate.FullName 'x64'
    if ((Test-Path -LiteralPath (Join-Path $folder 'makeappx.exe')) -and (Test-Path -LiteralPath (Join-Path $folder 'makepri.exe'))) { $SdkBin = $folder; break }
  }
}
if (-not $SdkBin) { throw 'Install the Windows SDK with MakeAppx and MakePri, then run this script again.' }
$makeappx = Join-Path $SdkBin 'makeappx.exe'
$makepri = Join-Path $SdkBin 'makepri.exe'
$validation = Join-Path $OutputRoot 'Validation'
$packages = Join-Path $OutputRoot 'Packages'
$individual = Join-Path $packages 'Individual architectures'
New-Item -ItemType Directory -Path $validation, $individual -Force | Out-Null
$identity | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputRoot 'Store identity.json') -Encoding UTF8

function Invoke-PackagingTool([string]$Executable, [string[]]$Arguments, [string]$Label) {
  Write-Host $Label
  $logPath = Join-Path $validation ($Label.Replace(' ', '-') + '.log')
  & $Executable @Arguments 2>&1 | Out-File -LiteralPath $logPath -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw "$Label failed. See $logPath" }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$stageParent = Join-Path $buildRoot '.staging'
New-Item -ItemType Directory -Path $stageParent -Force | Out-Null
$stageId = [guid]::NewGuid().ToString('N')
$stageRoot = Join-Path $stageParent $stageId
New-Item -ItemType Directory -Path $stageRoot | Out-Null
$records = @()
$version = ''
try {
  foreach ($arch in @('x64', 'arm64')) {
    $index = Get-Content -LiteralPath (Join-Path $payloadRoot "$arch.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($index.architecture -cne $arch -or $index.folder -cnotmatch "^$arch-[A-Za-z0-9]+$") { throw "Invalid $arch payload index." }
    if ($index.version -notmatch '^\d+\.\d+\.\d+\.0$') { throw 'Invalid prepared version.' }
    if ($version -and $version -cne $index.version) { throw 'The prepared architecture versions do not match.' }
    $version = $index.version
    $payload = Join-Path $payloadRoot $index.folder
    $actualHash = (Get-FileHash -LiteralPath (Join-Path $payload 'resources\app.asar') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -cne $index.asarSha256) { throw "The $arch application changed after preparation. Prepare a fresh payload." }
    $stage = Join-Path $stageRoot $arch
    New-Item -ItemType Directory -Path $stage | Out-Null
    Copy-Item -LiteralPath $payload -Destination (Join-Path $stage 'app') -Recurse
    Copy-Item -LiteralPath (Join-Path $buildRoot 'Assets') -Destination (Join-Path $stage 'Assets') -Recurse
    [xml]$manifest = Get-Content -LiteralPath (Join-Path $buildRoot 'AppxManifest.template.xml') -Raw -Encoding UTF8
    $manifest.Package.Identity.SetAttribute('Name', $identity.identityName)
    $manifest.Package.Identity.SetAttribute('Publisher', $identity.publisher)
    $manifest.Package.Identity.SetAttribute('Version', $version)
    $manifest.Package.Identity.SetAttribute('ProcessorArchitecture', $arch)
    $manifest.Package.Properties.PublisherDisplayName = $identity.publisherDisplayName
    $manifest.Save((Join-Path $stage 'AppxManifest.xml'))
    $runtimeIdentity = [ordered]@{ identityName = $identity.identityName; publisher = $identity.publisher;
      publisherDisplayName = $identity.publisherDisplayName; packageFamilyName = $family;
      version = $version; architecture = $arch; distributionChannel = 'store' }
    [IO.File]::WriteAllText((Join-Path $stage 'app\resources\store-identity.json'), ($runtimeIdentity | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $config = Join-Path $stageRoot "$arch-priconfig.xml"
    Invoke-PackagingTool $makepri @('createconfig', '/cf', $config, '/dq', 'en-US', '/o') "Create $arch resource config"
    Invoke-PackagingTool $makepri @('new', '/pr', $stage, '/cf', $config, '/mn', (Join-Path $stage 'AppxManifest.xml'), '/of', (Join-Path $stage 'resources.pri'), '/o') "Index $arch resources"
    $filename = "Zebby-$version-$arch.msix"
    $target = Join-Path $individual $filename
    Invoke-PackagingTool $makeappx @('pack', '/d', $stage, '/p', $target, '/h', 'SHA256', '/o') "Validate and pack $arch"
    $zip = [IO.Compression.ZipFile]::OpenRead($target)
    try {
      if ($zip.GetEntry('AppxSignature.p7x')) { throw 'A Store upload must not contain the QA signing certificate.' }
      foreach ($entry in @('AppxManifest.xml', 'resources.pri', 'app/resources/store-identity.json')) {
        if (-not $zip.GetEntry($entry)) { throw "Missing $entry in $filename" }
      }
    } finally { $zip.Dispose() }
    Copy-Item -LiteralPath (Join-Path $stage 'AppxManifest.xml') -Destination (Join-Path $validation "AppxManifest-$arch.xml")
    $records += [pscustomobject]@{ name = "Individual architectures/$filename"; architecture = $arch;
      sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant(); size = (Get-Item -LiteralPath $target).Length }
  }
  $bundleInput = Join-Path $stageRoot 'bundle'
  New-Item -ItemType Directory -Path $bundleInput | Out-Null
  foreach ($record in $records) { Copy-Item -LiteralPath (Join-Path $packages $record.name) -Destination $bundleInput }
  $bundle = Join-Path $packages "Zebby-$version.msixbundle"
  Invoke-PackagingTool $makeappx @('bundle', '/d', $bundleInput, '/p', $bundle, '/bv', $version, '/o') 'Validate and bundle architectures'
  $records += [pscustomobject]@{ name = [IO.Path]::GetFileName($bundle); architecture = 'bundle';
    sha256 = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant(); size = (Get-Item -LiteralPath $bundle).Length }
  ($records | ForEach-Object { $_.sha256 + '  ' + $_.name }) | Set-Content -LiteralPath (Join-Path $packages 'SHA256SUMS.txt') -Encoding UTF8
  [ordered]@{ status = 'packaged'; version = $version; identityName = $identity.identityName; publisher = $identity.publisher;
    packageFamilyName = $family; signature = 'Unsigned Store upload; Microsoft signs after certification'; files = $records } |
    ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $validation 'package-status.json') -Encoding UTF8
  Write-Host "`nUpload this bundle in Partner Center:`n$bundle" -ForegroundColor Green
} finally {
  # Only remove this invocation's newly created, verified staging directory.
  $resolvedStage = [IO.Path]::GetFullPath($stageRoot)
  $expectedStage = Join-Path ([IO.Path]::GetFullPath($stageParent)) $stageId
  if ($resolvedStage -ceq $expectedStage -and $stageId -match '^[a-f0-9]{32}$' -and (Test-Path -LiteralPath $resolvedStage)) {
    $links = @(Get-ChildItem -LiteralPath $resolvedStage -Recurse -Force -Attributes ReparsePoint)
    if ($links.Count -eq 0) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
  }
}
