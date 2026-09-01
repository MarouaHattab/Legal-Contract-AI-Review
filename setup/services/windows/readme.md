## Automatic Temporal Startup on Windows

The Temporal development stack can be started automatically on Windows using **PowerShell**, **Docker Desktop**, and **Windows Task Scheduler**.

The startup flow is:

```text
Windows Login
    ↓
Docker Desktop starts
    ↓
Task Scheduler runs the PowerShell script
    ↓
Docker Engine becomes ready
    ↓
docker compose up -d
    ↓
Temporal + PostgreSQL + Temporal UI
```

### 1. Create the PowerShell Startup Script

The Windows startup script is located at:

```text
setup/services/windows/temporal-service.ps1
```

The script starts the Docker Compose stack located at:

```text
setup/samples-server/compose/docker-compose-postgres.yml
```

Before configuring automatic startup, test the script manually from the repository root:

```powershell
.\setup\services\windows\temporal-service.ps1
```

Verify that the containers are running:

```powershell
docker ps
```

You can also check the Compose services directly:

```powershell
docker compose -f ".\setup\samples-server\compose\docker-compose-postgres.yml" ps
```

---

### 2. Enable Docker Desktop Auto-Start

The Temporal stack requires the Docker Engine to be running.

In Docker Desktop, enable:

```text
Settings
→ General
→ Start Docker Desktop when you sign in to your computer
```

The PowerShell startup script waits until the Docker Engine becomes available before starting the Temporal containers.

---

### 3. Open PowerShell as Administrator

Open **PowerShell as Administrator** and move to the repository root:

```powershell
cd "C:\path\to\temporal-101-course"
```

Replace the path above with the location where you cloned the repository.

---

### 4. Resolve the Startup Script Path

Resolve the absolute path of the Windows startup script:

```powershell
$script = (Resolve-Path ".\setup\services\windows\temporal-service.ps1").Path
```

You can verify the resolved path with:

```powershell
$script
```

---

### 5. Create the Scheduled Task Action

Create the action that Windows Task Scheduler will execute:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
```

This only defines what Windows should execute when the scheduled task is triggered.

It does not start Temporal yet.

---

### 6. Create the Login Trigger

Configure the task to run automatically when the user logs into Windows:

```powershell
$trigger = New-ScheduledTaskTrigger -AtLogOn
```

---

### 7. Register the Temporal Task

Register the task with Windows Task Scheduler:

```powershell
Register-ScheduledTask `
    -TaskName "Temporal" `
    -Description "Start the Temporal Docker Compose development stack" `
    -Action $action `
    -Trigger $trigger `
    -RunLevel Highest
```

The Temporal startup task is now registered.

Check that it exists:

```powershell
Get-ScheduledTask -TaskName "Temporal"
```

A successful registration should show the task in the `Ready` state.

---

### 8. Test the Scheduled Task

To test the automation without restarting Windows, first stop the Temporal stack:

```powershell
docker compose -f ".\setup\samples-server\compose\docker-compose-postgres.yml" down
```

Verify that the containers are stopped:

```powershell
docker ps
```

Then manually trigger the scheduled task:

```powershell
Start-ScheduledTask -TaskName "Temporal"
```

Wait a few seconds and verify that the containers started again:

```powershell
docker ps
```

Or:

```powershell
docker compose -f ".\setup\samples-server\compose\docker-compose-postgres.yml" ps
```

---

### 9. Verify the Scheduled Task Configuration

Check the current task state:

```powershell
Get-ScheduledTask -TaskName "Temporal" |
    Select-Object TaskName, State
```

You can also inspect the action configured for the task:

```powershell
(Get-ScheduledTask -TaskName "Temporal").Actions
```

The action should point to:

```text
setup\services\windows\temporal-service.ps1
```

---

### 10. Access Temporal UI

Once the Temporal stack is running, open:

```text
http://localhost:8080
```

---

### 11. View Temporal Logs

View Docker Compose logs:

```powershell
docker compose -f ".\setup\samples-server\compose\docker-compose-postgres.yml" logs -f
```

Press `Ctrl+C` to stop following the logs.

---

### 12. Stop the Temporal Stack

Stop and remove the Temporal containers:

```powershell
docker compose -f ".\setup\samples-server\compose\docker-compose-postgres.yml" down
```

This stops the containers but does not remove or disable the Windows scheduled task.

The containers will remain stopped until the task runs again or the stack is started manually.

---

### 13. Start the Temporal Stack Manually

Start the stack manually with:

```powershell
docker compose -f ".\setup\samples-server\compose\docker-compose-postgres.yml" up -d
```

---

### 14. Restart the Temporal Stack

Restart the running containers:

```powershell
docker compose -f ".\setup\samples-server\compose\docker-compose-postgres.yml" restart
```

---

### 15. Disable Automatic Startup

Disable the scheduled task without deleting it:

```powershell
Disable-ScheduledTask -TaskName "Temporal"
```

Enable it again with:

```powershell
Enable-ScheduledTask -TaskName "Temporal"
```

---

### 16. Run the Scheduled Task Manually

The registered startup task can be executed manually at any time:

```powershell
Start-ScheduledTask -TaskName "Temporal"
```

---

### 17. Remove the Scheduled Task

Completely remove the Temporal scheduled task:

```powershell
Unregister-ScheduledTask -TaskName "Temporal" -Confirm:$false
```

---

## Updating the Scheduled Task After Moving the Script

Windows Task Scheduler stores the absolute path of the PowerShell script when the task is registered.

If `temporal-service.ps1` is moved to another directory, the scheduled task must be updated.

Resolve the new path:

```powershell
$script = (Resolve-Path ".\setup\services\windows\temporal-service.ps1").Path
```

Create the updated action:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
```

Update the existing task:

```powershell
Set-ScheduledTask `
    -TaskName "Temporal" `
    -Action $action
```

Verify the configured path:

```powershell
(Get-ScheduledTask -TaskName "Temporal").Actions
```

---

## Manual Startup

Automatic startup is optional.

The Temporal stack can always be started manually from the repository root:

```powershell
docker compose -f ".\setup\samples-server\compose\docker-compose-postgres.yml" up -d
```

And stopped with:

```powershell
docker compose -f ".\setup\samples-server\compose\docker-compose-postgres.yml" down
```

---

## Windows Startup Flow

After automatic startup has been configured:

```text
Windows Login
     ↓
Docker Desktop starts
     ↓
Windows Task Scheduler triggers Temporal
     ↓
temporal-service.ps1 runs
     ↓
The script waits for Docker Engine
     ↓
docker compose up -d
     ↓
PostgreSQL + Temporal Server + Temporal UI start
```