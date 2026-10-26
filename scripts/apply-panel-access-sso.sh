#!/data/data/com.termux/files/usr/bin/bash
# LAB-only Cloudflare Access SSO for the original Panel; local password recovery retained.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'STOP: Termux only'; exit 2; }
[[ "${1:-}" == '--apply' ]] || { echo 'Usage: bash apply-panel-access-sso.sh --apply'; exit 2; }
root="$HOME/android-hosting-panel";svc="$PREFIX/var/service/amh-panel"
[[ -f "$root/src/server.mjs" && -f "$root/src/mhc-remote-access.mjs" && -f "$root/public/app.js" && -f "$root/data/admin.json" && -d "$svc" ]] || { echo 'STOP: original Panel runtime not found'; exit 3; }
[[ ! -L "$root/src" && ! -L "$root/public" && ! -L "$root/data" ]] || { echo 'STOP: unsafe symlinked Panel directory'; exit 3; }
for f in src/server.mjs src/mhc-remote-access.mjs public/app.js; do
 [[ -f "$root/$f" && ! -L "$root/$f" ]] || { echo "STOP: unsafe Panel source $f"; exit 3; }
done
[[ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:9090/)" == 200 ]] || { echo 'STOP: pre-upgrade Panel HTTP not 200'; exit 4; }
source_commit=d8fcb0ab233c58973dd3b70a857c9090e25850f8
download_base="https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/$source_commit/bin/legacy-panel-src"
temp="$(mktemp -d "$root/.mhc-access-sso.XXXXXXXX")"
trap 'rm -rf -- "$temp"' EXIT
for f in src/server.mjs src/mhc-remote-access.mjs public/app.js; do
 mkdir -p "$temp/$(dirname "$f")"
 curl -fsSL --retry 2 --connect-timeout 8 --max-time 45 "$download_base/$f" -o "$temp/$f"
 node --check "$temp/$f" || { echo "STOP: syntax error in $f"; exit 5; }
done
grep -Fq "startSession(req,res,'cloudflare-access')" "$temp/src/server.mjs" || { echo 'STOP: SSO source mismatch'; exit 5; }
grep -Fq 'window.location.assign' "$temp/public/app.js" || { echo 'STOP: SSO UI source mismatch'; exit 5; }
grep -Fq 'crypto.verify' "$temp/src/mhc-remote-access.mjs" || { echo 'STOP: missing JWT RSA signature verification'; exit 5; }
backup_dir="$HOME/.local/state/mhc-panel-sso-backups"
mkdir -p "$backup_dir";chmod 700 "$backup_dir"
backup="$backup_dir/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -m 700 "$backup"
for f in src/server.mjs src/mhc-remote-access.mjs public/app.js; do
 mkdir -p "$backup/$(dirname "$f")";cp -p -- "$root/$f" "$backup/$f"
done
rollback(){
 for f in src/server.mjs src/mhc-remote-access.mjs public/app.js; do
  cp -p -- "$backup/$f" "$root/$f"
 done
 sv restart "$svc" || true
 echo "ROLLED_BACK: restored Panel source from $backup"
}
for f in src/server.mjs src/mhc-remote-access.mjs public/app.js; do
 staged="$root/$(dirname "$f")/.mhc-stage-$(basename "$f")-$$"
 cp -- "$temp/$f" "$staged";chmod 600 "$staged"
 mv -f -- "$staged" "$root/$f"
done
if ! sv restart "$svc"; then rollback;exit 6;fi
healthy=0
for _ in $(seq 1 15); do
 sleep 1
 if [[ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:9090/ 2>/dev/null || true)" == 200 ]];then healthy=1;break;fi
done
if [[ "$healthy" != 1 ]];then rollback;exit 7;fi
echo 'APPLIED_OK: Access-only Panel login source active. HTTP 200 at localhost.'
echo "BACKUP=$backup"
echo 'Keep Cloudflare Access Allow policy narrow. Browser E2E login still needs confirmation.'
