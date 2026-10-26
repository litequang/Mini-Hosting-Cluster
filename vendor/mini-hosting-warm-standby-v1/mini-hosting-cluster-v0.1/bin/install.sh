#!/data/data/com.termux/files/usr/bin/bash
# Install SAME node code on all Android phones. Never edits running TPP/DB/Tunnel.
set -Eeuo pipefail; umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'ERROR: Run in Termux on the target Android';exit 1; }
command -v node >/dev/null || { echo 'Install nodejs first: pkg install nodejs';exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)";DEST="$HOME/.local/share/mini-hosting-cluster"
if [[ -f "$DEST/src/cli.mjs" ]] && ! cmp -s "$DEST/src/cli.mjs" "$SRC/src/cli.mjs";then
 BACK="$HOME/.local/share/mini-hosting-cluster-code-backup-$(date +%Y%m%d-%H%M%S)-$$"
 cp -a "$DEST" "$BACK"
 chmod -R go-rwx "$BACK"
 echo "Previous cluster agent backed up to $BACK"
fi
mkdir -p "$DEST/src" "$DEST/bin" "$DEST/sync" "$HOME/.config/mini-hosting-cluster" "$HOME/.local/state/mini-hosting-cluster/log"
chmod 700 "$HOME/.config/mini-hosting-cluster"
cp "$SRC/src/cli.mjs" "$SRC/src/dashboard.mjs" "$SRC/src/online-agent.mjs" "$SRC/src/ha-local.mjs" "$SRC/src/ha-policy.mjs" "$SRC/src/asset-digest.mjs" "$DEST/src/"
cp "$SRC/sync/"*.sh "$DEST/sync/"
chmod 700 "$DEST/sync/"*.sh
cp "$SRC/bin/join-standby.sh" "$SRC/bin/bootstrap-new.sh" "$SRC/bin/setup-sync.sh" "$SRC/bin/sync-assets.sh" "$SRC/bin/pull-peer-backup.sh" "$DEST/bin/"
chmod 700 "$DEST/bin/"*.sh
cat > "$DEST/bin/mhc" <<'WRAPPER'
#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
ROOT="$HOME/.local/share/mini-hosting-cluster"
CMD="${1:-help}"
case "$CMD" in
ha) shift;exec node "$ROOT/src/ha-local.mjs" "$@";;
sync-assets) exec "$ROOT/bin/sync-assets.sh";;
backup-pull) exec "$ROOT/bin/pull-peer-backup.sh";;
join-standby) shift;exec "$ROOT/bin/join-standby.sh" "$@";;
bootstrap-new) shift;exec "$ROOT/bin/bootstrap-new.sh" "$@";;
sync-once) exec "$HOME/standby-sync/sync-once.sh";;
dashboard) exec node "$ROOT/src/dashboard.mjs";;
online-enroll) shift; node "$ROOT/src/online-agent.mjs" enroll "$@"; sv-enable mhc-online; sv up mhc-online;;
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
  sv-enable mhc-dashboard || echo "WARNING: mhc-dashboard enable deferred until runit supervises new directory" >&2
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
printf 'Commands: ~/mhc help ; ~/mhc status ; ~/mhc ha doctor ; ~/mhc ha status\n'
printf 'Dashboard local only: http://127.0.0.1:9092\n'

# HA guard is installed but deliberately DISABLED until explicit safe cutover.
HAG="$PREFIX/var/service/mhc-ha"
mkdir -p "$HAG/log" "$HOME/.local/state/mini-hosting-cluster/ha-log"
cat > "$HAG/run" <<'HAG_RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec node "$HOME/.local/share/mini-hosting-cluster/src/ha-local.mjs" loop 2>&1
HAG_RUN
cat > "$HAG/log/run" <<'HAG_LOG'
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/mini-hosting-cluster/ha-log"
HAG_LOG
chmod 700 "$HAG/run" "$HAG/log/run"
# Never disable an explicitly armed guard during a code upgrade.
if [[ "$(node -e 'try{const h=require(process.env.HOME+"/.config/mini-hosting-cluster/ha.json");process.stdout.write(h.armed?"yes":"no")}catch{process.stdout.write("no")}' )" == yes ]];then
  sv-enable mhc-ha;sv up mhc-ha || true
else
  sv-disable mhc-ha || true;sv down mhc-ha || true
fi
printf 'HA controller installed INACTIVE by default. No failover or database modifications.\n'

# Optional peer-archive polling, never touches live MariaDB or app. Off until configured.
SVPB="$PREFIX/var/service/mhc-peer-backup"
mkdir -p "$SVPB/log" "$HOME/.local/state/mini-hosting-cluster/peer-backup-log"
cat > "$SVPB/run" <<'PB_RUN'
#!/data/data/com.termux/files/usr/bin/bash
while :;do "$HOME/.local/share/mini-hosting-cluster/bin/pull-peer-backup.sh" || true;sleep 600;done
PB_RUN
cat > "$SVPB/log/run" <<'PB_LOG'
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/mini-hosting-cluster/peer-backup-log"
PB_LOG
chmod 700 "$SVPB/run" "$SVPB/log/run"
if [[ -f "$HOME/.config/mini-hosting-cluster/ha-backup.json" ]];then
 sv-enable mhc-peer-backup;sv up mhc-peer-backup || true
else
 sv-disable mhc-peer-backup || true;sv down mhc-peer-backup || true
fi
