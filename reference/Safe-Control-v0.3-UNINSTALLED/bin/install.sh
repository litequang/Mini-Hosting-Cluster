#!/data/data/com.termux/files/usr/bin/bash
# Install SAME node code on all Android phones. Never edits running TPP/DB/Tunnel.
set -Eeuo pipefail; umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'ERROR: Run in Termux on the target Android';exit 1; }
command -v node >/dev/null || { echo 'Install nodejs first: pkg install nodejs';exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)";DEST="$HOME/.local/share/mini-hosting-cluster"
mkdir -p "$DEST/src" "$DEST/bin" "$DEST/sync" "$HOME/.config/mini-hosting-cluster" "$HOME/.local/state/mini-hosting-cluster/log"
chmod 700 "$HOME/.config/mini-hosting-cluster"
cp "$SRC/src/cli.mjs" "$SRC/src/dashboard.mjs" "$SRC/src/online-agent.mjs" "$SRC/src/control-agent.mjs" "$SRC/src/fence-guard.mjs" "$SRC/src/doctor.mjs" "$DEST/src/"
cp "$SRC/sync/"*.sh "$DEST/sync/"
chmod 700 "$DEST/sync/"*.sh
cp "$SRC/bin/join-standby.sh" "$SRC/bin/bootstrap-new.sh" "$SRC/bin/setup-sync.sh" "$DEST/bin/"
chmod 700 "$DEST/bin/"*.sh
cat > "$DEST/bin/mhc" <<'WRAPPER'
#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
ROOT="$HOME/.local/share/mini-hosting-cluster"
CMD="${1:-help}"
case "$CMD" in
doctor) exec node "$ROOT/src/doctor.mjs";;
control-status) exec node "$ROOT/src/control-agent.mjs" status;;
control-once) exec node "$ROOT/src/control-agent.mjs" once;;
control-arm) shift; exec node "$ROOT/src/control-agent.mjs" arm "$@";;
control-disarm) shift; exec node "$ROOT/src/control-agent.mjs" disarm "$@";;
control-fence) exec node "$ROOT/src/control-agent.mjs" fence;;
seal-files) exec node "$ROOT/src/control-agent.mjs" seal-files;;
join-standby) shift;exec "$ROOT/bin/join-standby.sh" "$@";;
bootstrap-new) shift;exec "$ROOT/bin/bootstrap-new.sh" "$@";;
sync-once) exec "$HOME/standby-sync/sync-once.sh";;
dashboard) exec node "$ROOT/src/dashboard.mjs";;
online-enroll) shift; node "$ROOT/src/online-agent.mjs" enroll "$@"; sv-enable mhc-online; sv up mhc-online; sv-enable mhc-control; sv up mhc-control;;
online-push) exec node "$ROOT/src/online-agent.mjs" push;;
online-status) exec node "$ROOT/src/online-agent.mjs" status;;
*) exec node "$ROOT/src/cli.mjs" "$@";;
esac
WRAPPER
chmod 700 "$DEST/bin/mhc"
ln -sfn "$DEST/bin/mhc" "$HOME/mhc"
SVD="$PREFIX/var/service/mhc-dashboard"
mkdir -p "$SVD/log"
cat > "$SVD/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec node "$HOME/.local/share/mini-hosting-cluster/src/dashboard.mjs" 2>&1
RUN
cat > "$SVD/log/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/mini-hosting-cluster/log"
RUN
chmod 700 "$SVD/run" "$SVD/log/run"
if command -v sv-enable >/dev/null 2>&1;then
  sv-enable mhc-dashboard
  sv up "$SVD" || true
  sv restart "$SVD" || true
else
  echo 'Install termux-services if you want auto-start dashboard: pkg install termux-services'
fi
# Optional outbound telemetry is off until explicit enrollment from online dashboard.
SVON="$PREFIX/var/service/mhc-online"
mkdir -p "$SVON/log" "$HOME/.local/state/mini-hosting-cluster/online-log"
cat > "$SVON/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec node "$HOME/.local/share/mini-hosting-cluster/src/online-agent.mjs" loop 2>&1
RUN
cat > "$SVON/log/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/mini-hosting-cluster/online-log"
RUN
chmod 700 "$SVON/run" "$SVON/log/run"
if [[ -f "$HOME/.config/mini-hosting-cluster/online.json" ]];then
  sv-enable mhc-online; sv up mhc-online || true
else
  sv-disable mhc-online || true; sv down mhc-online || true
fi
printf '\nINSTALL OK: identical cluster agent on this node.\n'
printf 'Identity is retained across upgrades: %s\n' "$HOME/.config/mini-hosting-cluster/node.json"
printf 'No app, database, Cloudflare Tunnel or M51 web service was changed.\n'
printf 'Commands: ~/mhc help ; ~/mhc status\n'
printf 'Dashboard local only: http://127.0.0.1:9092\n'

# v0.3: safety watchdog is inert until explicit control-arm, does NOT touch running services.
SVGUARD="$PREFIX/var/service/mhc-fence-guard"
SVCTRL="$PREFIX/var/service/mhc-control"
mkdir -p "$SVGUARD/log" "$SVCTRL/log" "$HOME/.local/state/mini-hosting-cluster/guard-log" "$HOME/.local/state/mini-hosting-cluster/control-log"
cat > "$SVGUARD/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec node "$HOME/.local/share/mini-hosting-cluster/src/fence-guard.mjs" 2>&1
RUN
cat > "$SVGUARD/log/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/mini-hosting-cluster/guard-log"
RUN
cat > "$SVCTRL/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec node "$HOME/.local/share/mini-hosting-cluster/src/control-agent.mjs" loop 2>&1
RUN
cat > "$SVCTRL/log/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/mini-hosting-cluster/control-log"
RUN
chmod 700 "$SVGUARD/run" "$SVGUARD/log/run" "$SVCTRL/run" "$SVCTRL/log/run"
if command -v sv-enable >/dev/null 2>&1;then
 sv-enable mhc-fence-guard; sv up mhc-fence-guard || true
 # Only run the controller once cloud enrollment exists. Observer cannot change production.
 if [[ -f "$HOME/.config/mini-hosting-cluster/online.json" ]];then
  sv-enable mhc-control; sv up mhc-control || true
 else
  sv-disable mhc-control || true; sv down mhc-control || true
 fi
fi
printf 'v0.3 Control Plane installed. OBSERVE ONLY until explicit arm.\n'
