#!/data/data/com.termux/files/usr/bin/bash
# Read one-use token without command-line arguments or shell history.
set -Eeuo pipefail
JS="$HOME/.local/share/mhc-full-installer/bin/node-enroll.mjs"
[[ -f "$JS" ]] || { echo 'Node enrollment code is not installed' >&2; exit 1; }
if [[ "${1:-}" == service ]];then
  action="${2:-}"
  PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
  DIR="$PREFIX/var/service/mhc-full-heartbeat"
  MARK="$HOME/.config/mhc-full-installer/installed"
  [[ "$PREFIX" == /data/data/com.termux/files/usr ]] || { echo 'Heartbeat service: Termux only' >&2;exit 1; }
  case "$action" in
    status) command -v sv >/dev/null && sv status mhc-full-heartbeat 2>/dev/null || echo 'TEST heartbeat service not running';;
    start)
      [[ -f "$MARK" ]] && grep -Eq '^(TEST 0\.3\.([3-9]|9\.[12]|10|11)|TEST 0\.4\.0(A|B1|B2|B3|B4|C1|C2|C3|D)|TEST 0\.5\.0(A|B|B2|B3|B4|B5|C-LAB|C-INTEGRATION|C-PHYSICAL|C-FIELD|C-DRILL|C-FENCE-PROBE|C-WRITER-AUDIT|C-MANUAL-PRIMARY|C-AUTO-PRIMARY-LAB|C-ROUTE-RECOVERY|C-REMOTE-PANEL)) installed on clean Termux$' "$MARK" || { echo 'Completed TEST 0.3.3+ install required' >&2;exit 1; }
      [[ ! -e "$HOME/apps/thophuongpro/.env" && ! -e "$HOME/.config/mini-hosting-cluster/ha.json" ]] || { echo 'Production/HA guard blocks TEST heartbeat service' >&2;exit 1; }
      [[ -f "$HOME/.config/mhc-full-installer/joined.json" && -f "$HOME/.config/mhc-full-installer/node-auth.json" ]] || { echo 'This node has not joined a TEST controller' >&2;exit 1; }
      command -v sv-enable >/dev/null && command -v sv >/dev/null || { echo 'termux-services is required' >&2;exit 1; }
      echo 'Checking one authenticated heartbeat before enabling service...'
      node "$JS" heartbeat
      read -r -p 'Type ENABLE_TEST_HEARTBEAT to start 60-second reporting: ' AGREED
      [[ "$AGREED" == ENABLE_TEST_HEARTBEAT ]] || { echo 'Cancelled';exit 0; }
      if [[ -e "$DIR" && ! -e "$DIR/run" ]];then
        echo "Existing runit service directory is not recognized as MHC managed" >&2;exit 1
      fi
      if [[ -e "$DIR/run" ]];then
        [[ ! -L "$DIR/run" ]] && grep -Fqx '# MHC_FULL_HEARTBEAT_SERVICE_v1' "$DIR/run" || { echo 'Existing runit service is not managed by MHC Full' >&2;exit 1; }
      else
        mkdir -p "$DIR/log" "$HOME/.local/state/mhc-full/heartbeat"
        cat > "$DIR/run" <<RUN
#!/data/data/com.termux/files/usr/bin/bash
# MHC_FULL_HEARTBEAT_SERVICE_v1
while :; do
  "$PREFIX/bin/node" "$HOME/.local/share/mhc-full-installer/bin/node-enroll.mjs" heartbeat || echo 'Heartbeat failed; not HA eligible'
  sleep 60
done
RUN
        cat > "$DIR/log/run" <<RUN
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/mhc-full/heartbeat"
RUN
        chmod 700 "$DIR/run" "$DIR/log/run"
      fi
      sv-enable mhc-full-heartbeat;sv up mhc-full-heartbeat
      echo 'Only an inventory heartbeat service; not a replica or HA agent.';;
    stop)
      [[ -f "$DIR/run" && ! -L "$DIR/run" ]] && grep -Fqx '# MHC_FULL_HEARTBEAT_SERVICE_v1' "$DIR/run" || { echo 'No managed heartbeat service found' >&2;exit 1; }
      sv-disable mhc-full-heartbeat;sv down mhc-full-heartbeat;;
    *)echo 'Usage: mhc-full node service start|stop|status';exit 2;;
  esac
elif [[ "${1:-}" == join ]];then
  [[ $# -ge 3 && $# -le 4 ]] || { echo 'Usage: mhc-full node join HOST SSH_USER [SSH_PORT]' >&2;exit 2; }
  read -r -s -p 'One-time invite code (not shown): ' TOKEN </dev/tty
  printf '\n' >&2
  printf '%s\n' "$TOKEN" | node "$JS" "$@"
  unset TOKEN
else
  exec node "$JS" "$@"
fi
