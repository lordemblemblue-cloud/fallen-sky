# Fallen Sky graphics-card bridge for Windows.
# Read-only. It never changes the GPU, and it listens only on 127.0.0.1.
#
# Connect while this window stays open:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\Export-FallenSkyGpu.ps1
# Or write a report file and stop:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\Export-FallenSkyGpu.ps1 -ExportOnly
param(
  [switch]$ExportOnly,
  [int]$Port = 47321,
  [string]$OutFile = $(Join-Path $env:USERPROFILE 'fallen-sky-gpu.json')
)

$ErrorActionPreference = 'Stop'

function New-PairingCode {
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.ToCharArray()
  -join (1..8 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

function Convert-AdapterObject($Name, $DedicatedBytes, $DriverVersion, $MemorySource) {
  [pscustomobject]@{
    name = [string]$Name
    dedicatedVideoMemoryBytes = $DedicatedBytes
    sharedSystemMemoryBytes = $null
    driverVersion = if ($DriverVersion) { [string]$DriverVersion } else { $null }
    memorySource = [string]$MemorySource
  }
}

function Get-BridgeAdapters {
  $found = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  $nvidia = Get-Command nvidia-smi -ErrorAction SilentlyContinue
  if ($nvidia) {
    $lines = @(& nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>$null)
    foreach ($line in $lines) {
      if (-not $line) { continue }
      $parts = @($line -split ',')
      if ($parts.Count -lt 2) { continue }
      $mb = 0L
      $parsed = [long]::TryParse($parts[1].Trim(), [ref]$mb)
      $bytes = if ($parsed -and $mb -gt 0) { $mb * 1MB } else { $null }
      $name = $parts[0].Trim()
      if (-not $name -or $seen.ContainsKey($name)) { continue }
      $seen[$name] = $true
      $driver = if ($parts.Count -ge 3) { $parts[2].Trim() } else { $null }
      $found.Add((Convert-AdapterObject $name $bytes $driver 'nvidia-smi'))
    }
  }
  $controllers = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue)
  foreach ($controller in $controllers) {
    $name = [string]$controller.Name
    if (-not $name -or $seen.ContainsKey($name)) { continue }
    $seen[$name] = $true
    # AdapterRAM is a 32-bit counter and saturates near 4 GB. A saturated
    # value is not dedicated video memory, so it is not reported as such.
    $ram = 0L
    $hasRam = $null -ne $controller.AdapterRAM -and [long]::TryParse([string]$controller.AdapterRAM, [ref]$ram)
    $trusted = if ($hasRam -and $ram -gt 0 -and $ram -lt 4000000000) { $ram } else { $null }
    $source = if ($trusted) { 'win32-adapter-ram' } else { 'name-only' }
    $found.Add((Convert-AdapterObject $name $trusted $controller.DriverVersion $source))
  }
  if ($found.Count -eq 0) {
    $found.Add((Convert-AdapterObject 'No graphics adapter reported by Windows' $null $null 'name-only'))
  }
  return $found
}

function Escape-JsonString([string]$Value) {
  if ($null -eq $Value) { return 'null' }
  $safe = $Value.Replace('\', '\\').Replace('"', '\"').Replace("`r", '').Replace("`n", ' ')
  return '"' + $safe + '"'
}

function Convert-ReportJson($Adapters, [string]$Code) {
  $rows = foreach ($adapter in @($Adapters)) {
    $dedicated = if ($null -eq $adapter.dedicatedVideoMemoryBytes) { 'null' } else { [string][int64]$adapter.dedicatedVideoMemoryBytes }
    $driver = if ($adapter.driverVersion) { Escape-JsonString ([string]$adapter.driverVersion) } else { 'null' }
    '{' +
      '"name":' + (Escape-JsonString ([string]$adapter.name)) +
      ',"dedicatedVideoMemoryBytes":' + $dedicated +
      ',"sharedSystemMemoryBytes":null' +
      ',"driverVersion":' + $driver +
      ',"memorySource":' + (Escape-JsonString ([string]$adapter.memorySource)) +
    '}'
  }
  $stamp = (Get-Date).ToUniversalTime().ToString('o')
  return '{' +
    '"kind":"fallen-sky-gpu-report","version":1' +
    ',"pairingCode":' + (Escape-JsonString $Code) +
    ',"collectedAt":' + (Escape-JsonString $stamp) +
    ',"adapters":[' + ($rows -join ',') + ']}'
}

$code = New-PairingCode
$json = Convert-ReportJson (Get-BridgeAdapters) $code
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($OutFile, $json, $utf8)

Write-Host ''
Write-Host 'Fallen Sky graphics-card bridge'
Write-Host "Pairing code: $code"
Write-Host "Report file:  $OutFile"
if ($ExportOnly) {
  Write-Host 'File written. In the game, use Load report file. This window does not stay connected.'
  return
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Could not listen on $prefix"
  Write-Host 'The report file was still written. Use Load report file in the game.'
  Write-Host $_.Exception.Message
  return
}

Write-Host "Listening on ${prefix}gpu"
Write-Host 'Leave this window open, enter the pairing code in the game, and press Connect.'
Write-Host 'Ctrl+C stops the bridge.'
$payload = $utf8.GetBytes($json)
try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    $response.Headers['Access-Control-Allow-Origin'] = '*'
    $response.Headers['Access-Control-Allow-Headers'] = 'X-Fallen-Sky-Token, Content-Type'
    $response.Headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    $response.Headers['Cache-Control'] = 'no-store'
    try {
      if ($request.HttpMethod -eq 'OPTIONS') {
        $response.StatusCode = 204
      } elseif ($request.HttpMethod -eq 'GET' -and $request.Url.AbsolutePath -eq '/gpu') {
        $token = [string]$request.Headers['X-Fallen-Sky-Token']
        if ($token -ne $code) {
          $response.StatusCode = 401
          $denied = $utf8.GetBytes('{"error":"rejected"}')
          $response.ContentType = 'application/json; charset=utf-8'
          $response.ContentLength64 = $denied.Length
          $response.OutputStream.Write($denied, 0, $denied.Length)
        } else {
          $response.StatusCode = 200
          $response.ContentType = 'application/json; charset=utf-8'
          $response.ContentLength64 = $payload.Length
          $response.OutputStream.Write($payload, 0, $payload.Length)
        }
      } else {
        $response.StatusCode = 404
      }
    } finally {
      $response.OutputStream.Close()
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
