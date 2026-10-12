#!/usr/bin/env bash
# Бэкап базы из работающего контейнера в том /data/backups (cron: 0 3 * * * /opt/erp-ammir/backup.sh).
set -euo pipefail
cd "$(dirname "$0")"
docker compose exec -T erp node dist/server/src/backup-cli.js "${1:-daily}"
