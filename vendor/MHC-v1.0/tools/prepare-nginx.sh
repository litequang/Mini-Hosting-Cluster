#!/data/data/com.termux/files/usr/bin/bash
# Create nginx candidate, never edit active site until explicit --apply and confirmation.
set -Eeuo pipefail
[[ "${PREFIX:-}" == '/data/data/com.termux/files/usr' ]] || { echo 'Termux only';exit 1; }
SRC="$HOME/.nginx/nginx.conf";DEST="$HOME/mhc-v1/nginx-gateway.candidate.conf"
[[ -f "$SRC" ]] || { echo "Missing $SRC";exit 1; }
mkdir -p "$HOME/mhc-v1"
if [[ "${1:-}" != --apply ]];then
 python - "$SRC" "$DEST" <<'PY'
import sys
src,dest=sys.argv[1:];text=open(src).read();needle='proxy_pass http://127.0.0.1:3000;'
if text.count(needle)!=1:
 raise SystemExit('Expected exactly 1 proxy_pass to Node 3000. Manual review required.')
open(dest,'w').write(text.replace(needle,'proxy_pass http://127.0.0.1:3070;'))
PY
 nginx -p "$HOME/.nginx" -c "$DEST" -t
 echo "CANDIDATE created at $DEST. No live config changed."
 exit 0
fi
[[ "${MHC_CONFIRM_CUTOVER:-}" == 'PUBLIC_WORKER_ROUTING_READY' ]] || { echo 'Set MHC_CONFIRM_CUTOVER=PUBLIC_WORKER_ROUTING_READY only after origin/gateway/Worker route checked';exit 1; }
[[ -f "$DEST" ]] || { echo "Candidate missing: run without --apply";exit 1; }
nginx -p "$HOME/.nginx" -c "$DEST" -t
BKP="$SRC.before-mhc-$(date +%Y%m%d-%H%M%S)"
cp -p "$SRC" "$BKP"
cp "$DEST" "$SRC";nginx -p "$HOME/.nginx" -c "$SRC" -t || { cp "$BKP" "$SRC";echo 'Syntax error, restored';exit 1; }
nginx -p "$HOME/.nginx" -c "$SRC" -s reload
printf 'Nginx routed via gated 127.0.0.1:3070. Backup: %s\n' "$BKP"
