#!/data/data/com.termux/files/usr/bin/bash
# Install one-way snapshot sync on the RESTORED secondary Android ONLY.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Run in Termux'; exit 1; }
[[ -f "$HOME/recovery-input/RECOVERED.txt" ]] || { echo 'ERROR: restore-new-phone.sh must finish on secondary first.'; exit 1; }
[[ -f "$HOME/apps/thophuongpro/.env" ]] || { echo 'ERROR: restored app missing'; exit 1; }
[[ -f "$PREFIX/var/service/named-tunnel/run" ]] || { echo 'ERROR: named-tunnel service missing'; exit 1; }
[[ ! -f "$HOME/standby-sync/.standby-installed" ]] || { echo 'Already installed. Edit ~/standby-sync/config to change settings.'; exit 1; }
status="$(sv status "$PREFIX/var/service/named-tunnel" || true)"
[[ "$status" != run:* ]] || { echo 'STOP: Named Tunnel is running. Secondary must be isolated first.'; exit 1; }
for p in ssh rsync sha256sum gzip tar mariadb node;do command -v "$p" >/dev/null || { echo "Missing $p. On standby run: pkg install rsync openssh"; exit 1; };done
BASE="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/standby-sync" "$HOME/.ssh" "$HOME/.local/state/standby-sync/log"
chmod 700 "$HOME/.ssh" "$HOME/standby-sync"
read -r -p 'M51 IP address / LAN hostname: ' PRIMARY_HOST
read -r -p 'M51 Termux SSH user (e.g. u0_a288): ' PRIMARY_USER
read -r -p 'M51 SSH port [8022]: ' PRIMARY_PORT
PRIMARY_PORT="${PRIMARY_PORT:-8022}"
[[ "$PRIMARY_HOST" =~ ^[a-zA-Z0-9.-]+$ && "$PRIMARY_USER" =~ ^[a-zA-Z0-9_]+$ && "$PRIMARY_PORT" =~ ^[0-9]+$ ]] || { echo 'Invalid host/user/port'; exit 1; }
(( PRIMARY_PORT >= 1 && PRIMARY_PORT <= 65535 )) || { echo 'Invalid port'; exit 1; }
read -r -p 'Type STANDBY to install the secondary-only service: ' ANSWER
[[ "$ANSWER" == STANDBY ]] || { echo 'Cancelled'; exit 1; }
KEY="$HOME/.ssh/mini-hosting-standby-ed25519"
if [[ ! -f "$KEY" ]];then ssh-keygen -q -t ed25519 -a 40 -N '' -f "$KEY" -C 'mini-hosting-standby-sync'; fi
chmod 600 "$KEY"
echo '--- SSH authorization ---'
echo 'Next command will prompt for the M51 SSH password ONCE to install the standby public key.'
ssh-copy-id -i "$KEY.pub" -p "$PRIMARY_PORT" "$PRIMARY_USER@$PRIMARY_HOST"
echo '--- Checking SSH and remote rsync ---'
ssh -o BatchMode=yes -o ConnectTimeout=10 -i "$KEY" -p "$PRIMARY_PORT" "$PRIMARY_USER@$PRIMARY_HOST" 'command -v rsync && test -f "$HOME/hosting-backups/thophuongpro/latest-success-path"'
# No shell-sourced user settings: all values are constrained to safe chars above.
cat > "$HOME/standby-sync/config" <<CFG
PRIMARY_HOST=$PRIMARY_HOST
PRIMARY_USER=$PRIMARY_USER
PRIMARY_PORT=$PRIMARY_PORT
CFG
chmod 600 "$HOME/standby-sync/config"
cp "$BASE/bin/sync-once.sh" "$BASE/bin/apply-snapshot.sh" "$BASE/bin/status.sh" "$HOME/standby-sync/"
chmod 700 "$HOME/standby-sync/"*.sh
# Keep named tunnel, backup and app disabled while standby data is refreshed.
sv-disable named-tunnel
sv down "$PREFIX/var/service/named-tunnel" || true
sv-disable tpp-backup || true
sv down "$PREFIX/var/service/tpp-backup" || true
sv-disable mini-web
sv down "$PREFIX/var/service/mini-web" || true
SVD="$PREFIX/var/service/standby-sync"
mkdir -p "$SVD/log"
cat > "$SVD/run" <<RUN
#!/data/data/com.termux/files/usr/bin/bash
while :; do
  "$HOME/standby-sync/sync-once.sh" || echo "[\$(date -Iseconds)] Standby sync failed (previous good release retained)."
  sleep 600
done
RUN
cat > "$SVD/log/run" <<LOG
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/standby-sync/log"
LOG
chmod 700 "$SVD/run" "$SVD/log/run"
touch "$HOME/standby-sync/.standby-installed"
chmod 600 "$HOME/standby-sync/.standby-installed"
sv-enable standby-sync
sv up "$SVD"
echo 'INSTALLED: polling M51 every 10 minutes; Tunnel OFF; website Node service OFF on standby.'
echo 'Status: ~/standby-sync/status.sh'
