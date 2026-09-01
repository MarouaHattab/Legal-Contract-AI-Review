# Temporal Service Setup — Linux

This guide configures the Temporal Docker Compose stack to start automatically on Linux using **systemd**.

The setup uses:

- Docker Engine
- Docker Compose
- systemd
- `docker-compose-postgres.yml`

## How It Works

```text
Linux Boot
    ↓
systemd
    ↓
Docker Service
    ↓
Temporal Service
    ↓
Docker Compose
    ↓
PostgreSQL + Temporal Server + Temporal UI
```

The systemd service manages the Docker Compose stack, allowing it to start automatically when the system boots.

---

## 1. Prerequisites

Verify that Docker is installed:

```bash
docker --version
```

Verify Docker Compose:

```bash
docker compose version
```

Find the Docker executable:

```bash
which docker
```

It will usually return:

```text
/usr/bin/docker
```

Verify that Docker is running:

```bash
sudo systemctl status docker
```

If Docker is not running:

```bash
sudo systemctl start docker
```

Enable Docker at boot:

```bash
sudo systemctl enable docker
```

---

## 2. Verify the Temporal Stack

From the repository root, start the Temporal stack manually first:

```bash
docker compose \
  -f setup/samples-server/compose/docker-compose-postgres.yml \
  up -d
```

Check the containers:

```bash
docker compose \
  -f setup/samples-server/compose/docker-compose-postgres.yml \
  ps
```

Once verified, stop the stack:

```bash
docker compose \
  -f setup/samples-server/compose/docker-compose-postgres.yml \
  down
```

This confirms that the Docker Compose configuration works before systemd is configured.

---

## 3. Configure the Service Script

The Linux service configuration is located at:

```text
setup/services/linux/temporal-service.sh
```

Before installing it, make sure the paths inside the file match the location where the repository was cloned.

Get the absolute repository path:

```bash
pwd
```

For example:

```text
/home/user/temporal-101-course
```

The Compose file should therefore resolve to:

```text
/home/user/temporal-101-course/setup/samples-server/compose/docker-compose-postgres.yml
```

Do not use Windows paths such as:

```text
C:\Users\...
```

inside the Linux systemd configuration.

---

## 4. Install the systemd Service

Copy the service configuration into the systemd service directory:

```bash
sudo cp setup/services/linux/temporal-service.sh \
  /etc/systemd/system/temporal.service
```

The installed service will now be available at:

```text
/etc/systemd/system/temporal.service
```

---

## 5. Reload systemd

Tell systemd to reload its service definitions:

```bash
sudo systemctl daemon-reload
```

This is required whenever a systemd service file is added or modified.

---

## 6. Enable Temporal at Boot

Enable the service:

```bash
sudo systemctl enable temporal.service
```

This configures Temporal to start automatically when Linux boots.

You should see output similar to:

```text
Created symlink ...
temporal.service → /etc/systemd/system/temporal.service
```

---

## 7. Start the Temporal Service

Start it immediately without rebooting:

```bash
sudo systemctl start temporal.service
```

Check its status:

```bash
sudo systemctl status temporal.service
```

For a `Type=oneshot` service using `RemainAfterExit=yes`, a successful service may appear as:

```text
Active: active (exited)
```

This is expected.

The Docker Compose command exits after starting the containers in detached mode (`-d`), while the containers continue running in the background.

---

## 8. Verify the Containers

Check the running containers:

```bash
docker ps
```

Or check the Temporal Compose stack:

```bash
docker compose \
  -f setup/samples-server/compose/docker-compose-postgres.yml \
  ps
```

The Temporal services should now be running.

---

## 9. Access Temporal UI

If the Temporal UI port is exposed locally, open:

```text
http://localhost:8080
```

For a remote Linux server, the UI should generally not be exposed publicly without appropriate network and security configuration.

An SSH tunnel can be used when the UI is only available on the remote server:

```bash
ssh -L 8080:localhost:8080 user@SERVER_IP
```

Then open:

```text
http://localhost:8080
```

on the local machine.

The traffic flow is:

```text
Local Browser
     ↓
localhost:8080
     ↓
SSH Tunnel
     ↓
Remote Server
     ↓
localhost:8080
     ↓
Temporal UI
```

---

## 10. Stop Temporal

Stop the systemd service:

```bash
sudo systemctl stop temporal.service
```

The service's `ExecStop` command runs:

```text
docker compose down
```

which stops and removes the Temporal Compose containers.

---

## 11. Restart Temporal

Restart the service:

```bash
sudo systemctl restart temporal.service
```

This stops and starts the service again.

Check the result:

```bash
sudo systemctl status temporal.service
```

---

## 12. Reload the Temporal Containers

If the service defines `ExecReload`, reload it with:

```bash
sudo systemctl reload temporal.service
```

This can be used to restart the Docker Compose containers after configuration changes.

---

## 13. View Service Logs

View logs generated by the systemd service:

```bash
sudo journalctl -u temporal.service
```

Follow the logs in real time:

```bash
sudo journalctl -u temporal.service -f
```

For application/container logs, use Docker Compose:

```bash
docker compose \
  -f setup/samples-server/compose/docker-compose-postgres.yml \
  logs -f
```

Press `Ctrl+C` to stop following the logs.

---

## 14. Disable Automatic Startup

Prevent Temporal from starting automatically at boot:

```bash
sudo systemctl disable temporal.service
```

This does not necessarily stop the currently running service.

To disable and stop it:

```bash
sudo systemctl disable --now temporal.service
```

---

## 15. Re-enable Automatic Startup

Enable the service again:

```bash
sudo systemctl enable temporal.service
```

Or enable and start it immediately:

```bash
sudo systemctl enable --now temporal.service
```

---

## 16. Remove the Service

First stop and disable it:

```bash
sudo systemctl disable --now temporal.service
```

Remove the installed service file:

```bash
sudo rm /etc/systemd/system/temporal.service
```

Reload systemd:

```bash
sudo systemctl daemon-reload
```

Optionally reset failed service state:

```bash
sudo systemctl reset-failed
```

---

## Useful Commands

| Action | Command |
|---|---|
| Start | `sudo systemctl start temporal.service` |
| Stop | `sudo systemctl stop temporal.service` |
| Restart | `sudo systemctl restart temporal.service` |
| Reload | `sudo systemctl reload temporal.service` |
| Status | `sudo systemctl status temporal.service` |
| Enable at boot | `sudo systemctl enable temporal.service` |
| Disable at boot | `sudo systemctl disable temporal.service` |
| Service logs | `sudo journalctl -u temporal.service -f` |
| Container status | `docker ps` |
| Container logs | `docker compose ... logs -f` |

## Startup Flow

After the service has been enabled, the normal startup sequence is:

```text
Linux boots
     ↓
systemd starts
     ↓
docker.service starts
     ↓
temporal.service starts
     ↓
docker compose up -d
     ↓
PostgreSQL starts
     ↓
Temporal Server starts
     ↓
Temporal UI starts
     ↓
Temporal environment is ready
```