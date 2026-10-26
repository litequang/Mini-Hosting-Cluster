#!/data/data/com.termux/files/usr/bin/bash
# M3 candidate selection UI only; neither writer nor Cloudflare route is changed.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == '/data/data/com.termux/files/usr' ]] || { echo 'STOP: Termux only';exit 2; }
[[ "${1:-}" == '--apply' ]] || { echo 'Usage: bash apply-primary-candidate-ui.sh --apply';exit 2; }
root="$HOME/android-hosting-panel"
live="$root/public/app.js"
marker="$HOME/.config/mhc-full-installer/installed"
[[ -f "$marker" && "$(cat "$marker")" == 'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux' ]] || { echo 'STOP: clean MHC LAB marker required'; exit 3; }
[[ ! -e "$HOME/apps/thophuongpro/.env" && ! -e "$HOME/.config/mini-hosting-cluster/ha.json" && ! -e "$HOME/.config/mini-hosting-cluster/node.json" ]] || { echo 'STOP: production footprint; refuses patch';exit 3; }
[[ -f "$live" && ! -L "$live" && -d "$root/public" && ! -L "$root/public" ]] || { echo 'STOP: original Panel asset missing or unsafe';exit 3; }
[[ "$(curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/)" == '200' ]] || { echo 'STOP: local Panel not healthy before patch';exit 4; }
mkdir -p "$HOME/.cache";chmod 700 "$HOME/.cache"
tmp="$(mktemp "$HOME/.cache/mhc-primary-ui.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
url='https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/bd9b02c95aede607a353e3471d9c43f832418ac8/bin/legacy-panel-src/public/app.js'
curl -fLsS --retry 2 --connect-timeout 8 --max-time 45 "$url" -o "$tmp" || { echo 'STOP: pinned GitHub source download failed';exit 5; }
[[ "$(git hash-object "$tmp")" == '1a73c25997270925214c6fc67a935966b8507a65' ]] || { echo 'STOP: Git blob SHA mismatch';exit 5; }
grep -Fq 'MHC_COMPACT_CLUSTER_UI_V1' "$tmp" || { echo 'STOP: missing compact UI baseline';exit 5; }
grep -Fq 'Chọn node — bắt đầu chuẩn bị' "$tmp" || { echo 'STOP: missing manual selection UI';exit 5; }
node --check "$tmp" || { echo 'STOP: JavaScript invalid';exit 5; }
backup_dir="$HOME/.local/state/mhc-primary-ui-backups"
mkdir -p "$backup_dir";chmod 700 "$backup_dir"
saved="$backup_dir/app.js.$(date +%Y%m%d-%H%M%S).$$.bak"
cp -p -- "$live" "$saved"
stage="$root/public/.mhc-primary-ui.$$.js"
cp -- "$tmp" "$stage";chmod 600 "$stage"
mv -f -- "$stage" "$live"
remote_sha="$(curl -fsS --max-time 6 http://127.0.0.1:9090/app.js | git hash-object --stdin)" || remote_sha='FETCH_FAILED'
if [[ "$remote_sha" != '1a73c25997270925214c6fc67a935966b8507a65' ]];then
 cp -p -- "$saved" "$live"
 echo 'ROLLED_BACK: Panel HTTP asset does not match new UI. Restored previous app.js'
 exit 6
fi
echo 'APPLIED_OK: shared Primary candidate selection is live in Cluster page.'
echo "BACKUP=$saved"
echo 'No Panel service restart, writer promotion, Tunnel/DNS or database change.'
echo 'Hard-refresh browser, then open Cluster > Chọn node dự kiến làm Primary.'
