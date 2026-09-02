$ErrorActionPreference = "Continue"
$BASE = "http://localhost:4711/api"

function Login($email, $pass) {
  $r = Invoke-RestMethod -Uri "$BASE/auth/login" -Method Post -ContentType "application/json" `
    -Body (@{ email = $email; password = $pass } | ConvertTo-Json)
  return @{ Authorization = "Bearer $($r.accessToken)" }
}

function TryGetPdf($name, $url, $h) {
  try {
    $out = Join-Path $env:TEMP "pdfsmoke-$name.pdf"
    $r = Invoke-WebRequest -Uri $url -Headers $h -UseBasicParsing -OutFile $out -PassThru
    $bytes = [System.IO.File]::ReadAllBytes($out)
    $magic = [System.Text.Encoding]::ASCII.GetString($bytes[0..3])
    if ($magic -ne "%PDF") { Write-Output "[FAIL] $name -> not a PDF (magic='$magic', $($bytes.Length) bytes)" }
    elseif ($bytes.Length -lt 800) { Write-Output "[WARN] $name -> valid PDF but suspiciously small ($($bytes.Length) bytes)" }
    else { Write-Output "[PASS] $name -> $($r.StatusCode), valid %PDF, $($bytes.Length) bytes" }
  } catch {
    Write-Output "[FAIL] $name -> $($_.Exception.Message) :: $($_.ErrorDetails.Message)"
  }
}

function TryCall($name, $method, $url, $h, $body) {
  try {
    if ($body) {
      $r = Invoke-RestMethod -Uri $url -Method $method -Headers $h -ContentType "application/json" -Body $body
    } else {
      $r = Invoke-RestMethod -Uri $url -Method $method -Headers $h
    }
    Write-Output "[PASS] $name"
    return $r
  } catch {
    Write-Output "[FAIL] $name -> $($_.ErrorDetails.Message)"
    return $null
  }
}

function ExpectFail($name, $method, $url, $h, $body) {
  try {
    if ($body) { Invoke-RestMethod -Uri $url -Method $method -Headers $h -ContentType "application/json" -Body $body | Out-Null }
    else { Invoke-RestMethod -Uri $url -Method $method -Headers $h | Out-Null }
    Write-Output "[FAIL] $name -> was ALLOWED but should have been rejected"
  } catch {
    $msg = $_.ErrorDetails.Message
    Write-Output "[PASS] $name -> correctly rejected: $msg"
  }
}
