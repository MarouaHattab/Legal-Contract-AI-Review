$ErrorActionPreference = "Stop"

$Docker = "C:\Users\MSI\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe"

$ComposeDir = "C:\Users\MSI\Desktop\temporal-101-course\setup\samples-server\compose"

$ComposeFile = Join-Path $ComposeDir "docker-compose-postgres.yml"

Write-Host "Waiting for Docker Desktop..."

$maxAttempts = 60

for ($i = 1; $i -le $maxAttempts; $i++) {

    try {
        & $Docker info *> $null

        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker is ready."
            break
        }
    }
    catch {}

    if ($i -eq $maxAttempts) {
        throw "Docker did not become ready."
    }

    Start-Sleep -Seconds 5
}

Set-Location $ComposeDir

Write-Host "Starting Temporal Docker Compose stack..."

& $Docker compose `
    -f $ComposeFile `
    up -d

if ($LASTEXITCODE -ne 0) {
    throw "Failed to start Temporal stack."
}

Write-Host "Temporal stack started."

& $Docker compose -f $ComposeFile ps