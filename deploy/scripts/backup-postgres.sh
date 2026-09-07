#!/usr/bin/env bash
# PostgreSQL backup script for Clever Campus ERP (Docker Compose)
# Usage (from repo root or anywhere): ./deploy/scripts/backup-postgres.sh
# Cron:  0 2 * * * /root/school-erp-saas/deploy/scripts/backup-postgres.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/clever-campus}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FILENAME="clever_campus_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
cd "$COMPOSE_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-clevercampus}"
POSTGRES_DB="${POSTGRES_DB:-school_erp_saas}"

echo "[$(date -Iseconds)] Starting backup → ${BACKUP_DIR}/${FILENAME}"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" --no-owner --no-acl \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

echo "[$(date -Iseconds)] Backup complete ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"

find "$BACKUP_DIR" -name "clever_campus_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "[$(date -Iseconds)] Cleaned backups older than ${RETENTION_DAYS} days"
