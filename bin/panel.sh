#!/data/data/com.termux/files/usr/bin/bash
# Dedicated localhost-only test panel, never exposed via Cloudflare or WAN.
set -Eeuo pipefail; umask 077
BASE="$HOME/.local/share/mhc-full-installer"; PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
TOKEN="$HOME/.config/mhc-full-installer/panel-admin-token"
fail(){ echo "ERROR: $*" >&2;exit 1; }
case "${1:-}" in
  token)
    [[ -f "$TOKEN" && ! -L "$TOKEN" ]] || fail 'Start panel first to create token'
    echo 'Admin token: keep private; do NOT send it through chat/logs.' >&2
    cat "$TOKEN";;
  status)
    echo 'Panel listens ONLY 127.0.0.1:19090 if running'
    if command -v sv >/dev/null;then sv status mhc-full-panel 2>/dev/null || echo 'mhc-full-panel: not provisioned';else echo 'runit not present';fi;;
  start)
    [[ "$PREFIX" == /data/data/com.termux/files/usr ]] || fail 'Termux only; for Linux tests run node bin/local-panel.mjs manually'
    command -v sv >/dev/null && command -v sv-enable >/dev/null || fail 'termux-services required'
    [[ -f "$BASE/bin/local-panel.mjs" ]] || fail 'Panel JS not installed'
    node --check "$BASE/bin/local-panel.mjs" || fail 'Panel JS syntax failed'
    DIR="$PREFIX/var/service/mhc-full-panel"
    if [[ -e "$DIR/run" ]];then
      [[ -f "$DIR/run" && ! -L "$DIR/run" ]] || fail 'Existing unsafe run script'
      grep -Fqx "exec \"$PREFIX/bin/node\" \"$BASE/bin/local-panel.mjs\" 2>&1" "$DIR/run" || fail 'Existing service is not the MHC managed panel; will not enable'
      echo 'Existing known MHC panel service found; not overwriting.'
    else
      mkdir -p "$DIR"
      cat > "$DIR/run" <<RUN
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/node" "$BASE/bin/local-panel.mjs" 2>&1
RUN
      chmod 700 "$DIR/run"
    fi
    sv-enable mhc-full-panel || fail 'Cannot enable managed Panel; inspect runit'
    ready=0
    for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20;do
      if [[ -e "$DIR/supervise/ok" ]];then ready=1;break;fi
      sleep 0.3
    done
    [[ "$ready" == 1 ]] || fail 'runit has not adopted Panel service; check runsvdir, do NOT start a second Panel'
    sv up mhc-full-panel || fail 'Panel service could not start; inspect local runit logs'
    echo 'Open via SSH port forwarding, http://127.0.0.1:19090 ; token via ~/mhc-full panel token'
    echo 'DO NOT expose port 19090 over LAN/WAN or configure Cloudflare to proxy it.';;
  stop)
    [[ "$PREFIX" == /data/data/com.termux/files/usr ]] || fail 'Termux only'
    [[ -f "$PREFIX/var/service/mhc-full-panel/run" ]] || fail 'Panel service not installed'
    sv-disable mhc-full-panel;sv down mhc-full-panel;;
  *)echo 'Usage: ~/mhc-full panel start|stop|status|token';exit 2;;
esac
