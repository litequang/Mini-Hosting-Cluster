#!/data/data/com.termux/files/usr/bin/bash
# Restore a VERIFIED TPP snapshot and encrypted Mini Hosting config on a CLEAN replacement Android phone.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Run this in Termux';exit 1; }
SNAP="${1:-}";CONFIG="${2:-}"
[[ -d "$SNAP" && -f "$SNAP/SHA256SUMS" && -f "$CONFIG" ]] || { echo 'Usage: restore-new-phone.sh /path/snapshot-... /path/mini-hosting-recovery.enc';exit 1; }
SNAP="$(cd "$SNAP" && pwd)";CONFIG="$(cd "$(dirname "$CONFIG")" && pwd)/$(basename "$CONFIG")"
BASE="$(cd "$(dirname "$0")/.." && pwd)"
[[ -d "$HOME/android-hosting-panel" && -d "$HOME/.nginx" ]] || { echo 'Run install-new-phone.sh first';exit 1; }
[[ ! -f "$HOME/apps/thophuongpro/.env" ]] || { echo 'Application already exists, refusing overwrite';exit 1; }
[[ "$SNAP" == "$HOME"/* ]] || { echo 'Snapshot must be inside Termux home';exit 1; }
for f in database.sql.gz storage.tar.gz app-release.tar.gz INFO.txt SHA256SUMS;do [[ -f "$SNAP/$f" ]] || { echo "Missing: $f";exit 1;};done
echo '[1/8] Validate archive SHA-256 and content'
(cd "$SNAP" && sha256sum -c SHA256SUMS)
for f in "$SNAP"/*.tar.gz;do tar -tzf "$f" >/dev/null;done
gzip -t "$SNAP/database.sql.gz"
# Refuse suspicious archive paths, absolute members and symlinks for recovery bundle.
check_tar(){
 local f="$1" entries
 entries="$(tar -tzf "$f")"
 if printf '%s\n' "$entries" | grep -Eq '(^/|(^|/)\.\.(/|$))';then echo "Unsafe path in $f";exit 1;fi
 if tar -tvzf "$f" | grep -q '^l';then echo "Symlink in recovery archive; manual inspection required ($f)";exit 1;fi
}
check_tar "$SNAP/app-release.tar.gz";check_tar "$SNAP/storage.tar.gz"
read -r -s -p 'Recovery config passphrase: ' DR_PWD;echo
[[ ${#DR_PWD} -ge 16 ]] || { echo 'Passphrase too short';exit 1; }
TEMP="$(mktemp -d "$HOME/.dr-restore.XXXXXXXX")"
trap 'rm -rf -- "$TEMP"' EXIT
DR_PASSWORD="$DR_PWD" node "$BASE/bin/secure-file.mjs" decrypt "$CONFIG" "$TEMP/config.tar.gz"
unset DR_PWD
check_tar "$TEMP/config.tar.gz"
mkdir -p "$TEMP/extract"
tar -xzf "$TEMP/config.tar.gz" -C "$TEMP/extract" --no-same-owner --no-same-permissions
[[ -f "$TEMP/extract/home/android-hosting-panel/src/server.mjs" && -f "$TEMP/extract/home/android-hosting-panel/data/admin.json" ]] || { echo 'Encrypted config incomplete: missing Panel code/admin.json';exit 1; }
[[ -f "$TEMP/extract/home/.cloudflared/thophuong.token" ]] || { echo 'Encrypted config incomplete: Tunnel token missing';exit 1; }
echo '[2/8] Restore application release and data (new phone only)'
mkdir -p "$HOME/apps/thophuongpro";chmod 700 "$HOME/apps/thophuongpro"
tar -xzf "$SNAP/app-release.tar.gz" -C "$HOME/apps/thophuongpro" --no-same-owner --no-same-permissions
tar -xzf "$SNAP/storage.tar.gz" -C "$HOME/apps/thophuongpro" --no-same-owner --no-same-permissions
if [[ -f "$SNAP/external-sheets.tar.gz" ]];then
 echo 'EXTERNAL SHEET ARCHIVE EXISTS: inspect its original path before restore. Not extracted automatically.'
fi
APP="$HOME/apps/thophuongpro"
chmod 600 "$APP/.env"
[[ -f "$APP/dist/server.cjs" && -f "$APP/package-lock.json" ]] || { echo 'Incomplete app release';exit 1; }
DB_NAME="$(node --env-file="$APP/.env" -e 'process.stdout.write(process.env.MYSQL_DATABASE||"")')"
[[ "$DB_NAME" == 'thophuong_pro' ]] || { echo 'Unsafe DB name; expected thophuong_pro';exit 1; }
SHEET_ROOT="$(node --env-file="$APP/.env" -e 'process.stdout.write(process.env.SHEET_STORAGE_ROOT||"")')"
[[ "$SHEET_ROOT" == "$APP/storage/sheets" ]] || { echo "Unexpected SHEET_STORAGE_ROOT: $SHEET_ROOT. Manual restore needed.";exit 1; }
[[ -d "$SHEET_ROOT" ]] || { echo 'Sheet directory missing';exit 1; }
echo '[3/8] Check fresh MariaDB and import into EMPTY thophuong_pro'
for k in $(seq 1 20);do if mariadb --no-defaults -u root -e 'SELECT 1' >/dev/null 2>&1;then break;fi;sleep 2;done
mariadb --no-defaults -u root -e 'SELECT 1' >/dev/null || { echo 'MariaDB unavailable';exit 1; }
COUNT="$(mariadb --no-defaults -u root -N -s -e "SELECT count(*) FROM information_schema.tables WHERE table_schema='thophuong_pro'" | tr -d '\r[:space:]')"
[[ "$COUNT" == 0 ]] || { echo "Database not empty ($COUNT tables). Refusing overwrite.";exit 1; }
mariadb --no-defaults -u root -e 'CREATE DATABASE IF NOT EXISTS thophuong_pro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; SET GLOBAL max_allowed_packet=134217728;'
# Restore file is trusted (the user supplied and verified this backup), and server has max packet >=128M.
gzip -dc "$SNAP/database.sql.gz" | mariadb --no-defaults --max-allowed-packet=128M -u root thophuong_pro
EXPECTED="$(sed -n 's/^Database tables at backup: *//p' "$SNAP/INFO.txt" | tr -d '[:space:]')"
ACTUAL="$(mariadb --no-defaults -u root -N -s -e "SELECT count(*) FROM information_schema.tables WHERE table_schema='thophuong_pro'" | tr -d '\r[:space:]')"
echo "Database tables restored: $ACTUAL (snapshot $EXPECTED)"
[[ "$EXPECTED" =~ ^[0-9]+$ && "$ACTUAL" == "$EXPECTED" ]] || { echo 'Database table count mismatch; do not activate web';exit 1; }
echo '[4/8] Provision app DB account from restored .env (never print password)'
node --env-file="$APP/.env" - "$TEMP/app-user.sql" <<'NODE'
const fs=require('node:fs');const p=process.env.MYSQL_PASSWORD,u=process.env.MYSQL_USER;
if(!p||!u||!/^[a-zA-Z_][a-zA-Z0-9_]{1,50}$/.test(u))throw Error('Missing/invalid MYSQL_USER or MYSQL_PASSWORD');
const quote=s=>"'"+s.replace(/\\/g,'\\\\').replace(/'/g,"''")+"'";
const sql=['CREATE USER IF NOT EXISTS '+quote(u)+"@'127.0.0.1' IDENTIFIED BY "+quote(p)+';', 'ALTER USER '+quote(u)+"@'127.0.0.1' IDENTIFIED BY "+quote(p)+';', 'GRANT ALL PRIVILEGES ON `thophuong_pro`.* TO '+quote(u)+"@'127.0.0.1';", 'CREATE USER IF NOT EXISTS '+quote(u)+"@'localhost' IDENTIFIED BY "+quote(p)+';', 'ALTER USER '+quote(u)+"@'localhost' IDENTIFIED BY "+quote(p)+';', 'GRANT ALL PRIVILEGES ON `thophuong_pro`.* TO '+quote(u)+"@'localhost';"].join('\n')+'\n';
fs.writeFileSync(process.argv[2],sql,{mode:0o600});
NODE
mariadb --no-defaults -u root < "$TEMP/app-user.sql"
rm -f "$TEMP/app-user.sql"
echo '[5/8] Restore exact Panel source/admin data and saved Tunnel credential (do not activate Tunnel)'
sv down "$PREFIX/var/service/amh-panel" || true
cp -a "$TEMP/extract/home/android-hosting-panel/." "$HOME/android-hosting-panel/"
chmod 700 "$HOME/android-hosting-panel/data";chmod 600 "$HOME/android-hosting-panel/data/admin.json"
mkdir -p "$HOME/.cloudflared";chmod 700 "$HOME/.cloudflared"
cp "$TEMP/extract/home/.cloudflared/thophuong.token" "$HOME/.cloudflared/thophuong.token";chmod 600 "$HOME/.cloudflared/thophuong.token"
if [[ -f "$TEMP/extract/home/.cloudflared/config.yml" ]];then cp "$TEMP/extract/home/.cloudflared/config.yml" "$HOME/.cloudflared/config.yml";chmod 600 "$HOME/.cloudflared/config.yml";fi
# Preserve generated safe nginx config; store old routing config only as reference, not executable.
mkdir -p "$HOME/recovery-input/primary-reference"
[[ ! -d "$TEMP/extract/home/.nginx" ]] || cp -a "$TEMP/extract/home/.nginx" "$HOME/recovery-input/primary-reference/"
[[ ! -d "$TEMP/extract/services" ]] || cp -a "$TEMP/extract/services" "$HOME/recovery-input/primary-reference/"
echo '[6/8] Install Node runtime dependency versions from original lockfile'
(cd "$APP" && npm ci --omit=dev --no-audit --no-fund)
echo '[7/8] Setup automatic local backup (service initially disabled until approval)'
if [[ ! -e "$PREFIX/var/service/tpp-backup/run" ]];then
 mkdir -p "$HOME/.local/share/tpp-backup" "$PREFIX/var/service/tpp-backup/log" "$HOME/.local/state/tpp-backup/log"
 cp "$BASE/backup/backup-now.sh" "$BASE/backup/scheduler.sh" "$BASE/backup/verify-latest.sh" "$HOME/.local/share/tpp-backup/"
 chmod 700 "$HOME/.local/share/tpp-backup"/*.sh
 cat > "$PREFIX/var/service/tpp-backup/run" <<RUN
#!/data/data/com.termux/files/usr/bin/sh
exec "$HOME/.local/share/tpp-backup/scheduler.sh" 2>&1
RUN
 cat > "$PREFIX/var/service/tpp-backup/log/run" <<LOG
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/tpp-backup/log"
LOG
 chmod 700 "$PREFIX/var/service/tpp-backup/run" "$PREFIX/var/service/tpp-backup/log/run"
fi
sv-disable tpp-backup || true
sv down "$PREFIX/var/service/tpp-backup" || true
echo '[8/8] Local health checks, DO NOT bring up Cloudflare yet'
sv up "$PREFIX/var/service/amh-panel" || true
sv up "$PREFIX/var/service/nginx" || true
sv-enable mini-web || true
sv up "$PREFIX/var/service/mini-web" || true
sleep 3
for svc in mysqld nginx mini-web amh-panel;do sv status "$PREFIX/var/service/$svc" || true;done
NODE_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)"
NGINX_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' -H 'Host: pro.thophuong.com' http://127.0.0.1:8080/ || true)"
PANEL_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/ || true)"
echo "Local HTTP: Node=$NODE_HTTP Nginx=$NGINX_HTTP Panel=$PANEL_HTTP"
if [[ "$NODE_HTTP" != 200 || "$NGINX_HTTP" != 200 || "$PANEL_HTTP" != 200 ]];then
 echo 'HEALTH CHECK NOT COMPLETE. Tunnel remains DISABLED. Inspect service logs and fix before activate.';exit 1
fi
printf 'Recovery local restore completed at %s\n' "$(date -Iseconds)" > "$HOME/recovery-input/RECOVERED.txt"
echo 'LOCAL RECOVERY SUCCESS. Named Tunnel is OFF. Validate login, Sheets and security BEFORE activating Tunnel.'
echo "To enable local daily backups AFTER validation: sv-enable tpp-backup && sv up '$PREFIX/var/service/tpp-backup'"
echo "To switch domain traffic AFTER primary is disconnected: bash '$BASE/bin/activate-tunnel.sh'"
