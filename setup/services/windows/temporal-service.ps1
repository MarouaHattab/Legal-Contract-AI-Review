[CmdletBinding()]
param(
    [string]$DockerPath = ""
)

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (
    Join-Path $PSScriptRoot "..\..\.."
)).Path
$composeDirectory = Join-Path $repositoryRoot "setup\samples-server\compose"
$composeFile = Join-Path $composeDirectory "docker-compose-postgres.yml"

if ($DockerPath) {
    if (-not (Test-Path -LiteralPath $DockerPath -PathType Leaf)) {
        throw "Docker executable not found: $DockerPath"
    }
    $docker = (Resolve-Path -LiteralPath $DockerPath).Path
}
else {
    $dockerCommand = Get-Command docker -CommandType Application -ErrorAction SilentlyContinue
    if (-not $dockerCommand) {
        throw "Docker CLI was not found on PATH. Pass -DockerPath with its full path."
    }
    $docker = $dockerCommand.Source
}

if (-not (Test-Path -LiteralPath $composeFile -PathType Leaf)) {
    throw "Temporal Compose file not found: $composeFile"
}

Write-Host "Waiting for Docker..."
$maxAttempts = 60

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    & $docker info *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker is ready."
        break
    }

    if ($attempt -eq $maxAttempts) {
        throw "Docker did not become ready."
    }

    Start-Sleep -Seconds 5
}

Push-Location -LiteralPath $composeDirectory
try {
    Write-Host "Starting Temporal Docker Compose stack..."
    & $docker compose -f $composeFile up -d

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to start Temporal stack."
    }

    Write-Host "Temporal stack started."
    & $docker compose -f $composeFile ps

    if ($LASTEXITCODE -ne 0) {
        throw "Temporal stack started, but its status could not be read."
    }
}
finally {
    Pop-Location
}
