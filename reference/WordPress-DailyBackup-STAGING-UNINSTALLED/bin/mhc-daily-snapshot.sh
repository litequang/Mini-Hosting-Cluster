#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
# Run on current PRIMARY only. Never auto-restore or auto-promote.
BASE="$HOME/hosting-backups/mhc-daily"; LOCK="$BASE/.lock"; mkdir -p "$BASE"
if ! mkdir "$LOCK" 2>/dev/null; then echo 'Snapshot already running'; exit 1; fi
trap 'rmdir "$LOCK"' EXIT
if [[ ! -f "$HOME/.mhc-backup-primary-approved" ]]; then echo 'Refusing: create approval marker manually on confirmed Primary only'; exit 2; fi
stamp=$(date +%Y%m%d-%H%M%S); tmp="$BASE/.snapshot-$stamp"; final="$BASE/snapshot-$stamp"; mkdir "$tmp"
# Only known configured roots; avoids accidental whole-home or secret collection.
if [[ -d "$HOME/mhc-wordpress/sites" ]]; then tar -czf "$tmp/sites.tar.gz" -C "$HOME/mhc-wordpress" sites; fi
if [[ -f "$HOME/.mhc-backup-db-list" ]]; then
 while IFS= read -r db; do
  [[ "$db" =~ ^[a-zA-Z0-9_]+$ ]] || { echo 'Unsafe DB name' >&2; exit 3; }
  mariadb-dump --single-transaction --routines --events --triggers "$db" | gzip -c > "$tmp/db-$db.sql.gz"
 done < "$HOME/.mhc-backup-db-list"
fi
( cd "$tmp"; sha256sum ./*.gz > SHA256SUMS 2>/dev/null || :; sha256sum -c SHA256SUMS )
mv "$tmp" "$final"; echo "Verified local snapshot: $final"
# Transfer to standby deliberately excluded until SSH target + MHC role integration verified.
