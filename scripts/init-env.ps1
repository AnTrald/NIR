$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
    Write-Output '.env уже существует; файл не изменён.'
    exit 0
}
$bytes = New-Object byte[] 32
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
$password = ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
$template = [System.IO.File]::ReadAllText((Join-Path $projectRoot '.env.example'))
$content = $template.Replace('GENERATE_WITH_INIT_ENV', $password)
$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, $content, $encoding)
Write-Output '.env создан со случайным локальным паролем PostgreSQL.'
