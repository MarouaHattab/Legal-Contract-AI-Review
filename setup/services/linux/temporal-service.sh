[Unit]
Description=Temporal Workflow Engine (Docker Compose)
Documentation=https://docs.temporal.io
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
Environment=TEMPORAL_PROJECT_ROOT=/opt/temporal-101
EnvironmentFile=-/etc/default/temporal

ExecStartPre=/usr/bin/test -f ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose/docker-compose-postgres.yml
ExecStartPre=/usr/bin/test -f ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose/.env
ExecStart=/usr/bin/env docker compose --project-directory ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose --env-file ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose/.env -f ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose/docker-compose-postgres.yml up -d
ExecStop=/usr/bin/env docker compose --project-directory ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose --env-file ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose/.env -f ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose/docker-compose-postgres.yml down
ExecReload=/usr/bin/env docker compose --project-directory ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose --env-file ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose/.env -f ${TEMPORAL_PROJECT_ROOT}/setup/samples-server/compose/docker-compose-postgres.yml restart

Restart=on-failure
RestartSec=10s
TimeoutStartSec=300
TimeoutStopSec=120
LimitNOFILE=65536
LimitNPROC=8192
StandardOutput=journal
StandardError=journal
SyslogIdentifier=temporal

[Install]
WantedBy=multi-user.target
