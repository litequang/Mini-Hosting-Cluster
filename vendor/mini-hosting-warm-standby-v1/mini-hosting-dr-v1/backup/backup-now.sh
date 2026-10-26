#!/data/data/com.termux/files/usr/bin/bash
# Tho Phuong Pro local, verified, snapshot backup for Termux (no production DB writes).
set -Eeuo pipefail
umask 077

APP_DIR="${TPP_APP_DIR:-$HOME/apps/thophuongpro}"
BACKUP_ROOT="${TPP_BACKUP_ROOT:-$HOME/hosting-backups/thophuongpro}"
DB_NAME="thophuong_pro"
RETAIN="${TPP_RETAIN:-7}"

say() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*"; }
fail() { say "ERROR: $*" >&2; exit 1; }
[[ "$RETAIN" =~ ^[1-9][0-9]?$ ]] || fail "TPP_RETAIN must be 1..99"
for command_name in node mariadb mariadb-dump gzip tar sha256sum find sort; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Missing command: $command_name"
done
[[ -f "$APP_DIR/.env" && -f "$APP_DIR/package.json" && -f "$APP_DIR/package-lock.json" && -d "$APP_DIR/dist" ]] || fail "Missing app files under $APP_DIR"
[[ -d "$APP_DIR/storage" ]] || fail "Missing $APP_DIR/storage"

# Read .env using Node's own parser; never shell-source .env.
SHEET_ROOT="$(node --env-file="$APP_DIR/.env" -e 'process.stdout.write(process.env.SHEET_STORAGE_ROOT || "")')" || fail 'Cannot parse .env'
CONFIGURED_DB="$(node --env-file="$APP_DIR/.env" -e 'process.stdout.write(process.env.MYSQL_DATABASE || "")')" || fail 'Cannot read database config'
[[ "$CONFIGURED_DB" == "$DB_NAME" ]] || fail "Configured app database ($CONFIGURED_DB) differs from backup target ($DB_NAME)"
[[ -n "$SHEET_ROOT" && -d "$SHEET_ROOT" ]] || fail "SHEET_STORAGE_ROOT not configured or inaccessible: $SHEET_ROOT"

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
LOCKDIR="$BACKUP_ROOT/.backup-lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  OLD_PID="$(cat "$LOCKDIR/pid" 2>/dev/null || true)"
  if [[ "$OLD_PID" =~ ^[0-9]+$ ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    OLD_CMD="$(ps -p "$OLD_PID" -o args= 2>/dev/null || true)"
    [[ "$OLD_CMD" == *backup-now.sh* ]] && fail 'A backup is already running'
  fi
  LOCK_MTIME="$(stat -c %Y "$LOCKDIR" 2>/dev/null || echo 0)"
  NOW_EPOCH="$(date +%s)"
  if (( NOW_EPOCH - LOCK_MTIME < 300 )); then
    fail 'Backup lock is recent; another invocation may be starting'
  fi
  say 'Recovering stale backup lock from interrupted run'
  rm -f -- "$LOCKDIR/pid"
  rmdir -- "$LOCKDIR" 2>/dev/null || fail 'Lock has unexpected files; inspect it manually'
  mkdir "$LOCKDIR" || fail 'Another backup acquired the lock'
fi
printf '%s\n' "$$" > "$LOCKDIR/pid"
STAGE=""
cleanup() {
  if [[ -n "$STAGE" && -d "$STAGE" ]]; then rm -rf -- "$STAGE"; fi
  rm -f -- "$LOCKDIR/pid"
  rmdir -- "$LOCKDIR" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

STAMP="$(date '+%Y%m%d-%H%M%S')"
STAGE="$BACKUP_ROOT/.pending-$STAMP-$$"
SNAPSHOT="$BACKUP_ROOT/snapshot-$STAMP-$$"
mkdir -m 700 "$STAGE"
say "START snapshot: $SNAPSHOT"

# Previous migration hit a 16 MiB packet limit. Set an adequate transient server
# limit if needed; client dump packet limit is specified separately.
PACKET="$(mariadb --no-defaults -u root -N -s -e "SELECT @@GLOBAL.max_allowed_packet" | tr -d '\r[:space:]')" || fail 'Cannot query MariaDB root via local socket'
[[ "$PACKET" =~ ^[0-9]+$ ]] || fail "Invalid MariaDB max_allowed_packet: $PACKET"
if (( PACKET < 134217728 )); then
  say 'Increasing live MariaDB max_allowed_packet to 128 MiB for safe export'
  mariadb --no-defaults -u root -e 'SET GLOBAL max_allowed_packet=134217728' || fail 'Cannot increase MariaDB packet limit'
fi

say 'Dumping MariaDB (consistent InnoDB snapshot)'
mariadb-dump --no-defaults -u root \
  --single-transaction --quick --routines --events --triggers \
  --hex-blob --default-character-set=utf8mb4 --max-allowed-packet=128M \
  "$DB_NAME" | gzip -1 > "$STAGE/database.sql.gz"
[[ -s "$STAGE/database.sql.gz" ]] || fail 'Empty database export'
gzip -t "$STAGE/database.sql.gz" || fail 'Invalid SQL gzip'

say 'Archiving persistent app storage (without staging or old local backups)'
# Cover entire storage/ so files beyond the sheets directory are not forgotten.
tar -czf "$STAGE/storage.tar.gz" -C "$APP_DIR" \
  --exclude='storage/backups' --exclude='storage/sheets/.staging' \
  --exclude='storage/.staging' storage
[[ -s "$STAGE/storage.tar.gz" ]] || fail 'Empty storage archive'
tar -tzf "$STAGE/storage.tar.gz" > /dev/null || fail 'Storage archive unreadable'

# Custom SHEET_STORAGE_ROOT outside storage/ is included separately, if applicable.
case "$SHEET_ROOT/" in
  "$APP_DIR/storage/"*) : ;; 
  *) say 'Archiving external SHEET_STORAGE_ROOT too'
     tar -czf "$STAGE/external-sheets.tar.gz" -C "$(dirname "$SHEET_ROOT")" \
       --exclude="$(basename "$SHEET_ROOT")/.staging" "$(basename "$SHEET_ROOT")"
     tar -tzf "$STAGE/external-sheets.tar.gz" > /dev/null || fail 'External sheets archive unreadable' ;;
esac

say 'Archiving current release and configuration'
tar -czf "$STAGE/app-release.tar.gz" -C "$APP_DIR" \
  .env package.json package-lock.json dist
tar -tzf "$STAGE/app-release.tar.gz" > /dev/null || fail 'App archive unreadable'

TABLE_COUNT="$(mariadb --no-defaults -u root -N -s -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'" | tr -d '\r[:space:]')" || fail 'Cannot count DB tables'
[[ "$TABLE_COUNT" =~ ^[0-9]+$ ]] && (( TABLE_COUNT >= 1 )) || fail "Database table count invalid or zero: $TABLE_COUNT"
SHEET_COUNT="$(find "$SHEET_ROOT" -type f ! -path '*/.staging/*' | wc -l | tr -d '[:space:]')"
cat > "$STAGE/INFO.txt" <<EOF
App: Tho Phuong Pro
Created: $(date -Iseconds)
Database: $DB_NAME
Database tables at backup: $TABLE_COUNT
Sheets configured path: $SHEET_ROOT
Non-staging sheet files at backup: $SHEET_COUNT
Release directory: $APP_DIR
Note: SQL consistent for InnoDB; files can change during a live backup.
Note: These archives include application secrets. Keep them private.
EOF
(
  cd "$STAGE"
  sha256sum *.gz > SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)
say "Validated archives; DB tables=$TABLE_COUNT, sheet files=$SHEET_COUNT"

# Publish completed snapshot atomically. Failed backups never count toward retention.
mv -- "$STAGE" "$SNAPSHOT"
STAGE=""
printf '%s\n' "$(date '+%Y-%m-%d')" > "$BACKUP_ROOT/last-success-date"
printf '%s\n' "$SNAPSHOT" > "$BACKUP_ROOT/latest-success-path"

mapfile -t SNAPSHOTS < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'snapshot-*' | sort)
if (( ${#SNAPSHOTS[@]} > RETAIN )); then
  REMOVE_COUNT=$(( ${#SNAPSHOTS[@]} - RETAIN ))
  for (( n=0; n<REMOVE_COUNT; n++ )); do
    # Only remove old completed snapshot directories under this exact backup root.
    [[ "${SNAPSHOTS[n]}" == "$BACKUP_ROOT"/snapshot-* ]] || fail 'Unexpected retention path'
    say "Retention: removing old snapshot ${SNAPSHOTS[n]}"
    rm -rf -- "${SNAPSHOTS[n]}"
  done
fi
say "SUCCESS: $SNAPSHOT"
