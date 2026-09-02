#!/usr/bin/env bash
# PostgreSQL backup script for Clever Campus ERP
# Usage: ./backup-postgres.sh
# Cron:  0 2 * * * /opt/clever-campus/deploy/scripts/backup-postgres.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/clever-campus}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="clever_campus_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

: "${DATABASE_URL:?DATABASE_URL is required}"

echo "[$(date -Iseconds)] Starting backup → ${BACKUP_DIR}/${FILENAME}"

pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "${BACKUP_DIR}/${FILENAME}"

echo "[$(date -Iseconds)] Backup complete ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "clever_campus_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "[$(date -Iseconds)] Cleaned backups older than ${RETENTION_DAYS} days"
