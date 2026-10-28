$ErrorActionPreference = 'Stop'
$mhcRoot = Split-Path -Parent $PSScriptRoot
$mhcHelper = Join-Path $PSScriptRoot 'configure-cloudflare-n1.mjs'
if (!(Test-Path -LiteralPath $mhcHelper -PathType Leaf)) { throw 'N1 helper missing' }
Write-Host 'Nhap API token chi co Account > Cloudflare Tunnel > Edit cho tai khoan MHC. Gia tri se duoc an.'
$mhcSecret = Read-Host 'Cloudflare Tunnel API token' -AsSecureString
$mhcPointer = [IntPtr]::Zero
try {
    $mhcPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mhcSecret)
    $mhcProcessInfo = New-Object Diagnostics.ProcessStartInfo
    $mhcProcessInfo.FileName = 'node.exe'
    $mhcProcessInfo.Arguments = '"' + $mhcHelper + '"'
    $mhcProcessInfo.WorkingDirectory = $mhcRoot
    $mhcProcessInfo.UseShellExecute = $false
    $mhcProcessInfo.CreateNoWindow = $true
    $mhcProcessInfo.RedirectStandardInput = $true
    $mhcProcess = [Diagnostics.Process]::Start($mhcProcessInfo)
    $mhcProcess.StandardInput.WriteLine([Runtime.InteropServices.Marshal]::PtrToStringBSTR($mhcPointer))
    $mhcProcess.StandardInput.Close()
    $mhcProcess.WaitForExit()
    if ($mhcProcess.ExitCode -ne 0) { throw 'N1 secret setup failed; token was not printed or saved on PC' }
} finally {
    if ($mhcPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($mhcPointer) }
    $mhcSecret.Dispose()
}
