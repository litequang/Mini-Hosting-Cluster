#!/data/data/com.termux/files/usr/bin/bash
# MHC LAB original Panel 9090: deploy private Access rejection diagnostics, keep JWT required.
set -Eeuo pipefail
PREFIX_EXPECTED=/data/data/com.termux/files/usr
if [[ "${PREFIX:-}" != "$PREFIX_EXPECTED" ]]; then echo 'STOP: Not Termux'; exit 2; fi
if [[ "${1:-}" != '--apply' ]]; then echo 'Usage: bash apply-remote-access-diagnostics.sh --apply'; exit 2; fi
src="$HOME/android-hosting-panel/src/mhc-remote-access.mjs"
svc="$PREFIX/var/service/amh-panel"
if [[ ! -f "$src" || ! -d "$svc" ]]; then echo 'STOP: original Panel 9090 not found'; exit 3; fi
if [[ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 http://127.0.0.1:9090/)" != 200 ]]; then
 echo 'STOP: Panel localhost is not healthy before change'; exit 4
fi
mkdir -p "$HOME/.cache"
chmod 700 "$HOME/.cache"
work="$(mktemp -d "$HOME/.cache/mhc-remote-diagnostic.XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
url='https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/ce9a2307cb5c9614c76d5dc8f7ef9fff3b428b53/bin/legacy-panel-src/src/mhc-remote-access.mjs'
if ! curl -fLsS --retry 2 --connect-timeout 8 --max-time 30 "$url" -o "$work/mhc-remote-access.mjs"; then
 echo 'FAIL: could not download pinned source'; exit 5
fi
if ! grep -q 'MHC_REMOTE_ACCESS_DENIED' "$work/mhc-remote-access.mjs" || ! grep -q 'crypto.verify' "$work/mhc-remote-access.mjs"; then
 echo 'FAIL: downloaded source does not match expected guard'; exit 6
fi
node --check "$work/mhc-remote-access.mjs"
backup="$HOME/.local/state/mhc-panel-auth-backups"
mkdir -p "$backup"
chmod 700 "$backup"
saved="$backup/mhc-remote-access.$(date +%Y%m%d-%H%M%S).$$.mjs"
cp -p -- "$src" "$saved"
dest_tmp="$HOME/android-hosting-panel/src/.mhc-remote-access.$$.mjs"
cp -- "$work/mhc-remote-access.mjs" "$dest_tmp"
chmod 600 "$dest_tmp"
mv -f -- "$dest_tmp" "$src"
if ! sv restart "$svc"; then
 cp -p -- "$saved" "$src"
 sv restart "$svc" || true
 echo 'ROLLED_BACK: failed to restart original Panel service; restored old auth source'
 exit 8
fi
healthy=0
for _ in $(seq 1 15); do
 sleep 1
 if [[ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:9090/ 2>/dev/null || true)" == 200 ]]; then
   healthy=1; break
 fi
done
if [[ "$healthy" != 1 ]]; then
 cp -p -- "$saved" "$src"
 sv restart "$svc" || true
 echo 'ROLLED_BACK: Panel HTTP did not recover; restored previous auth module'
 exit 7
fi
echo "APPLIED_OK: safe auth diagnostics live; localhost Panel HTTP 200"
echo "BACKUP=$saved"
echo 'Next: Access login, then grep MHC_REMOTE_ACCESS_DENIED in private Panel logs if still rejected.'
