[Unit]
Description=Temporal PDF Pipeline Worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Environment=TEMPORAL_PROJECT_ROOT=/opt/temporal-101
Environment=TEMPORAL_WORKER_PYTHON=/opt/temporal-venv/bin/python
EnvironmentFile=-/etc/default/temporal-pdf-worker
ExecStartPre=/usr/bin/test -x ${TEMPORAL_WORKER_PYTHON}
ExecStartPre=/usr/bin/test -f ${TEMPORAL_PROJECT_ROOT}/apps/pdf-extraction/worker.py
ExecStart=/usr/bin/env ${TEMPORAL_WORKER_PYTHON} ${TEMPORAL_PROJECT_ROOT}/apps/pdf-extraction/worker.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
