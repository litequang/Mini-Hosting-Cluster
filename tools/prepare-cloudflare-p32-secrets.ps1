param([ValidateSet('All', 'Control', 'Dns')][string]$Kind = 'All', [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows DPAPI is required; do not use this helper on another OS.' }
# Run by the Windows user. No secrets in arguments, console output, Git or clipboard.
$mhcPrivateDir = Join-Path $env:LOCALAPPDATA 'MHC-P32'
if ((Test-Path -LiteralPath $mhcPrivateDir) -and ((Get-Item -LiteralPath $mhcPrivateDir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Private directory must not be a link.' }
[void][IO.Directory]::CreateDirectory($mhcPrivateDir)
$mhcSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$mhcAcl = [Security.AccessControl.DirectorySecurity]::new()
$mhcAcl.SetAccessRuleProtection($true, $false)
$mhcInheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$mhcPropagation = [Security.AccessControl.PropagationFlags]::None
$mhcAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($mhcSid, 'FullControl', $mhcInheritance, $mhcPropagation, 'Allow'))
$mhcAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'), 'FullControl', $mhcInheritance, $mhcPropagation, 'Allow'))
# Persist only the modified DACL. Set-Acl can also request SACL privileges on
# Windows PowerShell; token storage must work without SeSecurityPrivilege/UAC.
if ($PSVersionTable.PSVersion.Major -ge 7) {
    [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($mhcPrivateDir), $mhcAcl)
    $mhcActualAcl = [IO.FileSystemAclExtensions]::GetAccessControl([IO.DirectoryInfo]::new($mhcPrivateDir), [Security.AccessControl.AccessControlSections]::Access)
} else {
    [IO.Directory]::SetAccessControl($mhcPrivateDir, $mhcAcl)
    $mhcActualAcl = [IO.Directory]::GetAccessControl($mhcPrivateDir, [Security.AccessControl.AccessControlSections]::Access)
}
$mhcActualRules = @($mhcActualAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
if (-not $mhcActualAcl.AreAccessRulesProtected -or $mhcActualRules.Count -ne 2) { throw 'Private directory ACL verification failed; no credential requested.' }
foreach ($mhcRule in $mhcActualRules) {
    if ($mhcRule.IdentityReference.Value -notin @($mhcSid.Value, 'S-1-5-18') -or
        $mhcRule.AccessControlType -ne 'Allow' -or $mhcRule.FileSystemRights -ne 'FullControl' -or
        $mhcRule.InheritanceFlags -ne $mhcInheritance) { throw 'Unexpected private directory permissions; no credential requested.' }
}
if ($CheckOnly) { Write-Host 'PRIVATE_DIRECTORY_DACL_PASS; no credentials read or requested.'; return }
$mhcEntries = @()
if ($Kind -in @('All', 'Control')) { $mhcEntries += @{ Name='control-token.xml'; Prompt='Cloudflare CONTROL token (Access Apps/Policies Edit; hidden)' } }
if ($Kind -in @('All', 'Dns')) { $mhcEntries += @{ Name='dns-token.xml'; Prompt='Cloudflare DNS-ONLY token (giaouoc.com DNS Edit + Zone Read; hidden)' } }
foreach ($mhcEntry in $mhcEntries) {
    $mhcTarget = Join-Path $mhcPrivateDir $mhcEntry.Name
    if (Test-Path -LiteralPath $mhcTarget) { Write-Host ($mhcEntry.Name + ' exists; kept unchanged.'); continue }
    $mhcSecret = Read-Host -Prompt $mhcEntry.Prompt -AsSecureString
    try {
        if ($mhcSecret.Length -lt 25 -or $mhcSecret.Length -gt 8192) { throw 'Invalid credential length; nothing saved.' }
        $mhcSecret | Export-Clixml -LiteralPath $mhcTarget -NoClobber
        Write-Host ($mhcEntry.Name + ' saved with Windows DPAPI for this user; no token displayed.')
    } finally { $mhcSecret.Dispose() }
}
Write-Host 'Ready. Tell Codex the private credentials are saved; do not send token values.'
