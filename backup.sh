#!/bin/bash
# Daily backup to a private git repo.
# Copies configs, website files, services, and dumps databases.
# Run via cron: 0 3 * * * /path/to/backup.sh

set -e
REPO_DIR="${BACKUP_REPO:-$HOME/homelab-config}"
cd "$REPO_DIR"

# -- add your copy commands here, e.g.:
# cp ~/website/index.html websites/
# cp ~/alertmanager/alertmanager.yml configs/
# pg_dump -U umami umami > configs/umami_backup.sql

git add -A
git diff --cached --quiet && exit 0  # nothing changed
git commit -m "backup: $(date '+%Y-%m-%d %H:%M')"
git push origin main
