param(
    [string]$Url = "http://localhost:8081",
    [int]$TimeoutSeconds = 300
)

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
            $content = [string]$response.Content
            if ($content -match '<html|<!doctype html|<div id="root"') {
                Start-Process $Url
                exit 0
            }
        }
    } catch {
        Start-Sleep -Seconds 1
        continue
    }

    Start-Sleep -Seconds 1
}

