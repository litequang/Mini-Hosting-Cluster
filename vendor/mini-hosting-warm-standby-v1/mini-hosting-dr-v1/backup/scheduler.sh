#!/data/data/com.termux/files/usr/bin/bash
set -u
BACKUP_ROOT="${TPP_BACKUP_ROOT:-$HOME/hosting-backups/thophuongpro}"
SCRIPT="$HOME/.local/share/tpp-backup/backup-now.sh"
mkdir -p "$BACKUP_ROOT"
while :; do
  TODAY="$(date '+%Y-%m-%d')"
  HM="$(date '+%H%M')"
  SUCCESS="$(cat "$BACKUP_ROOT/last-success-date" 2>/dev/null || true)"
  NOW_EPOCH="$(date '+%s')"
  LAST_ATTEMPT="$(cat "$BACKUP_ROOT/last-attempt-epoch" 2>/dev/null || echo 0)"
  [[ "$LAST_ATTEMPT" =~ ^[0-9]+$ ]] || LAST_ATTEMPT=0
  if [[ "$HM" > '0259' && "$SUCCESS" != "$TODAY" ]] && (( NOW_EPOCH - LAST_ATTEMPT >= 3600 )); then
    printf '%s\n' "$NOW_EPOCH" > "$BACKUP_ROOT/last-attempt-epoch"
    if ! "$SCRIPT"; then
      echo "[$(date -Iseconds)] Backup failed; will retry in >=1 hour. Existing snapshots remain."
    fi
  fi
  sleep 300
done
