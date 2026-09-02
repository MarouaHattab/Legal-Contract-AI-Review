[Unit]
Description=Temporal PDF Pipeline Worker
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/workspace/apps/pdf-extraction-02-temporal
ExecStart=/root/miniconda3/envs/temporaldev/bin/python worker.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target