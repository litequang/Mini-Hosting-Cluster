#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
umask 077
: "${PREFIX:?Run this inside Termux}"
[[ "$PREFIX" == /data/data/com.termux/files/usr ]] || { echo 'Installer for standard Termux only'; exit 1; }
BASE="$HOME/.local/share/tpp-backup"
SVC="$PREFIX/var/service/tpp-backup"
[[ -f "$HOME/apps/thophuongpro/.env" ]] || { echo 'Missing ~/apps/thophuongpro/.env'; exit 1; }
command -v mariadb-dump >/dev/null || { echo 'Missing mariadb-dump. Install MariaDB client in Termux first.'; exit 1; }
command -v sv >/dev/null || { echo 'Missing runit / termux-services'; exit 1; }
[[ ! -e "$SVC/run" ]] || { echo "Service already exists ($SVC). Stop to avoid overwriting another installation."; exit 1; }
mkdir -p "$BASE" "$HOME/hosting-backups/thophuongpro" "$SVC/log" "$HOME/.local/state/tpp-backup/log"
chmod 700 "$BASE" "$HOME/hosting-backups/thophuongpro" "$HOME/.local/state/tpp-backup" "$HOME/.local/state/tpp-backup/log"
touch "$SVC/down"  # Do not start before all service files exist.
THIS_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
for f in backup-now.sh scheduler.sh verify-latest.sh; do
  cp -- "$THIS_DIR/$f" "$BASE/$f"
  chmod 700 "$BASE/$f"
done
cat > "$SVC/run" <<EOR
#!/data/data/com.termux/files/usr/bin/sh
exec "$BASE/scheduler.sh" 2>&1
EOR
cat > "$SVC/log/run" <<EOR
#!/data/data/com.termux/files/usr/bin/sh
mkdir -p "$HOME/.local/state/tpp-backup/log"
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/tpp-backup/log"
EOR
chmod 700 "$SVC/run" "$SVC/log/run"
rm -f "$SVC/down"
sv up "$SVC" || echo 'WARN: runit may need to discover the new service; check sv status later.'
echo 'INSTALLED: tpp-backup scheduler (daily at/after 03:00 local time)'
echo "BACKUP NOW: $BASE/backup-now.sh"
echo "VERIFY: $BASE/verify-latest.sh"
echo "STATUS: sv status '$SVC'"
echo "LOGS: tail -n 30 '$HOME/.local/state/tpp-backup/log/current'"
