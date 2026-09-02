[CmdletBinding()]
param(
    [string]$PythonPath = (Join-Path $PSScriptRoot '.venv\Scripts\python.exe')
)

$workerDirectory = $PSScriptRoot
$workerScript = Join-Path $workerDirectory 'worker.py'

if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
    throw "Python executable not found: $PythonPath"
}

if (-not (Test-Path -LiteralPath $workerScript -PathType Leaf)) {
    throw "Worker script not found: $workerScript"
}

$exitCode = 0
Push-Location -LiteralPath $workerDirectory
try {
    while ($true) {
        & $PythonPath $workerScript
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0) {
            break
        }

        Write-Warning "Temporal worker exited with code $exitCode. Restarting in 5 seconds..."
        Start-Sleep -Seconds 5
    }
}
finally {
    Pop-Location
}

exit $exitCode
