#!/data/data/com.termux/files/usr/bin/bash
# Reuse proven staging/dual-DB standby sync, parameterized for any primary node.
set -Eeuo pipefail;umask 077
HOST="${1:-}";USER="${2:-}";PORT="${3:-8022}"
[[ "$HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ && "$USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ && "$PORT" =~ ^[0-9]+$ ]] || exit 1
ROOT="$HOME/standby-sync";CFG="$ROOT/config";SRC="$(cd "$(dirname "$0")/.." && pwd)"
[[ -f "$HOME/recovery-input/RECOVERED.txt" && -f "$HOME/apps/thophuongpro/.env" ]] || exit 1
for n in mini-web named-tunnel;do if sv status "$n" 2>/dev/null | grep -q '^run:';then echo "STOP: $n is running";exit 1;fi;done
if [[ -e "$ROOT/.standby-installed" ]];then
  echo 'Standby sync already exists. Preserving existing config and release slots. Heartbeat must be installed separately in a future upgrade.'
  exit 0
fi
[[ -f "$SRC/sync/sync-once.sh" && -f "$SRC/sync/apply-snapshot.sh" ]] || { echo 'Missing full distribution sync modules';exit 1; }
mkdir -p "$ROOT" "$ROOT/snapshots" "$ROOT/releases" "$HOME/.local/state/standby-sync/log"
chmod 700 "$ROOT"
cat > "$CFG" <<CFG
PRIMARY_HOST=$HOST
PRIMARY_USER=$USER
PRIMARY_PORT=$PORT
CFG
chmod 600 "$CFG"
for f in sync-once.sh apply-snapshot.sh status.sh;do cp "$SRC/sync/$f" "$ROOT/$f";chmod 700 "$ROOT/$f";done
sv-disable named-tunnel;sv down named-tunnel || true
sv-disable mini-web;sv down mini-web || true
sv-disable tpp-backup || true;sv down tpp-backup || true
# Safety: do not run restored MariaDB scheduled EVENTs on standby.
mariadb --no-defaults -u root -e "SET GLOBAL event_scheduler=OFF" || { echo "STOP: could not disable DB event scheduler";exit 1; }
SV="$PREFIX/var/service/standby-sync";mkdir -p "$SV/log"
cat > "$SV/run" <<RUN
#!/data/data/com.termux/files/usr/bin/bash
while :; do
  "$HOME/standby-sync/sync-once.sh" || echo "[\$(date -Iseconds)] Sync not applied; preserve last good snapshot."
  sleep 600
done
RUN
cat > "$SV/log/run" <<LOG
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/standby-sync/log"
LOG
chmod 700 "$SV/run" "$SV/log/run"
touch "$ROOT/.standby-installed";chmod 600 "$ROOT/.standby-installed"
sv-enable standby-sync;sv up standby-sync || true
# Heartbeats are metadata-only and cannot trigger promotion. They let the primary show node health without inbound SSH.
HB="$PREFIX/var/service/mhc-heartbeat";mkdir -p "$HB/log" "$HOME/.local/state/mini-hosting-cluster/heartbeat-log"
cat > "$HB/run" <<RUN
#!/data/data/com.termux/files/usr/bin/bash
while :;do
  node "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" send-heartbeat || true
  sleep 60
done
RUN
cat > "$HB/log/run" <<LOG
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/mini-hosting-cluster/heartbeat-log"
LOG
chmod 700 "$HB/run" "$HB/log/run"
sv-enable mhc-heartbeat;sv up mhc-heartbeat || true
printf 'STANDBY SYNC ON (poll=600s, source=%s; source snapshot cadence may be daily).\n' "$HOST"
