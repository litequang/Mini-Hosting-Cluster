$ErrorActionPreference = 'Stop'
$mhcRoot = Split-Path -Parent $PSScriptRoot
$mhcHelper = Join-Path $PSScriptRoot 'configure-cloudflare-n1.mjs'
if (!(Test-Path -LiteralPath $mhcHelper -PathType Leaf)) { throw 'N1 helper missing' }
Write-Host 'Nhap API token Cloudflare One Connector: cloudflared > Edit (hoac Cloudflare Tunnel > Edit), dung tai khoan MHC. Gia tri se duoc an.'
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
    $mhcProcessInfo.RedirectStandardOutput = $true
    $mhcProcessInfo.RedirectStandardError = $true
    $mhcProcess = [Diagnostics.Process]::Start($mhcProcessInfo)
    $mhcProcess.StandardInput.WriteLine([Runtime.InteropServices.Marshal]::PtrToStringBSTR($mhcPointer))
    $mhcProcess.StandardInput.Close()
    $mhcOutput = $mhcProcess.StandardOutput.ReadToEnd()
    $mhcErrorOutput = $mhcProcess.StandardError.ReadToEnd()
    $mhcProcess.WaitForExit()
    if ($mhcProcess.ExitCode -ne 0) {
        $mhcErrorCode = [regex]::Match($mhcErrorOutput + ' ' + $mhcOutput, '\bN1_[A-Z0-9_]{1,90}\b').Value
        if (!$mhcErrorCode) { $mhcErrorCode = 'N1_HELPER_PROCESS_FAILED' }
        throw ($mhcErrorCode + ' - token khong duoc in hoac luu tren PC')
    }
    $mhcResult = ConvertFrom-Json $mhcOutput
    if ($mhcResult.secretInstalled -ne $true) { throw 'N1_HELPER_REPLY_INVALID' }
    Write-Host 'THANH CONG: da luu MHC_N1_CF_TOKEN vao Worker. Khong can gui token cho ai.'
} finally {
    if ($mhcPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($mhcPointer) }
    $mhcSecret.Dispose()
}
