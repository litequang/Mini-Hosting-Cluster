#!/data/data/com.termux/files/usr/bin/bash
# MHC Monitor V2: LAB-only live Panel + authority agent rollout, with backup/rollback.
# Does NOT deploy Cloudflare Worker, modify secrets, Primary, DB, Tunnel or website data.
set -Eeuo pipefail
umask 077
fail(){ echo "STOP: $*" >&2;exit 1; }
[[ "${PREFIX:-}" == '/data/data/com.termux/files/usr' ]] || fail 'Termux only'
[[ "${1:-}" == '--apply' ]] || fail 'Usage: bash apply-monitor-all-nodes.sh --apply'
mark="$HOME/.config/mhc-full-installer/installed"
[[ -f "$mark" && ! -L "$mark" && "$(cat "$mark")" == 'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux' ]] || fail 'Unknown MHC LAB marker'
[[ ! -e "$HOME/.config/mhc-full-installer/install-incomplete" ]] || fail 'Partial installer state'
for forbid in "$HOME/apps/thophuongpro/.env" "$HOME/.config/mini-hosting-cluster/ha.json" "$HOME/.config/mini-hosting-cluster/node.json";do
 [[ ! -e "$forbid" ]] || fail 'Production footprint; no LAB patch'
done
base="$HOME/.local/share/mhc-full-installer/bin"
panel="$HOME/android-hosting-panel"
svc="$PREFIX/var/service/amh-panel"
agent="$PREFIX/var/service/mhc-authority-agent"
[[ -d "$base" && ! -L "$base" && -d "$panel/src" && ! -L "$panel/src" && -d "$panel/public" && ! -L "$panel/public" ]] || fail 'Panel/BIN directory missing or symlinked'
[[ -f "$panel/data/admin.json" && ! -L "$panel/data/admin.json" && -d "$svc" ]] || fail 'Original configured Panel 9090 not found'
[[ "$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/)" == '200' ]] || fail 'Panel not HTTP healthy before install'
command -v git >/dev/null || fail 'git hash-object required'
command -v node >/dev/null || fail 'Node runtime required'
mkdir -p "$HOME/.cache";chmod 700 "$HOME/.cache"
work="$(mktemp -d "$HOME/.cache/mhc-monitor.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
pin='e7f7aa913155392235219c265627ac9e0c2877dc'
origin="https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/$pin"
paths=(
 'bin/node-monitor.mjs'
 'bin/cluster-authority.mjs'
 'bin/legacy-panel-src/src/mhc-integration.mjs'
 'bin/legacy-panel-src/src/server.mjs'
 'bin/legacy-panel-src/public/app.js'
)
hashes=(
 'a77aa0399277af0ef5fc3c7afe7b69b0217d700a'
 'c34a9ca409dc9cfdea7d50bb030a36a361033769'
 'fad031b93eaf451b9797fdda5d3b85d4aa95ecd4'
 '46f6396764f7acdb4e3defecda4c085cd88d57d7'
 'b160dbe8ac1a36257f05f33be108ca20f4708899'
)
dest=(
 "$base/node-monitor.mjs"
 "$base/cluster-authority.mjs"
 "$panel/src/mhc-integration.mjs"
 "$panel/src/server.mjs"
 "$panel/public/app.js"
)
for i in "${!paths[@]}";do
 f="$work/$i"
 curl -fsSL --retry 2 --connect-timeout 8 --max-time 45 "$origin/${paths[$i]}" -o "$f" || fail "GitHub download failed: ${paths[$i]}"
 [[ "$(git hash-object "$f")" == "${hashes[$i]}" ]] || fail "Git blob mismatch: ${paths[$i]}"
 node --check "$f" || fail "Source syntax error: ${paths[$i]}"
 [[ ! -L "${dest[$i]}" ]] || fail "Refusing symlink destination: ${paths[$i]}"
done
grep -Fq 'MHC_MONITOR_ALL_NODES_V2' "$work/4" || fail 'Missing monitor UI'
grep -Fq 'crypto.verify' "$work/3" || fail 'Unexpected auth module in Panel'
# Collector self-test before touching runtime; does not reveal private node data.
node --input-type=module -e 'import(process.argv[1]).then(async m=>{const v=await m.collectNodeMetrics();if(v.v!==1||!v.battery||!v.services)process.exit(2)}).catch(()=>process.exit(3))' "$work/0" || fail 'Monitor collector self-check failed'
state="$HOME/.local/state/mhc-monitor-v2-backups"
mkdir -p "$state";chmod 700 "$state"
backup="$state/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -m 700 "$backup"
for i in "${!dest[@]}";do
 if [[ -f "${dest[$i]}" ]];then cp -p -- "${dest[$i]}" "$backup/$i";else : > "$backup/$i.absent";fi
done
agent_running=false
if [[ -d "$agent" ]] && sv status "$agent" 2>/dev/null | grep -q '^run:';then agent_running=true;fi
rollback(){
 echo 'ROLLBACK: restoring previous Panel/Agent source' >&2
 for i in "${!dest[@]}";do
  if [[ -f "$backup/$i.absent" ]];then rm -f -- "${dest[$i]}" || true
  else cp -p -- "$backup/$i" "${dest[$i]}" || true;fi
 done
 sv restart "$svc" || true
 if [[ "$agent_running" == true ]];then sv restart "$agent" || true;fi
 echo "ROLLBACK_BACKUP=$backup" >&2
}
for i in "${!dest[@]}";do
 dst="${dest[$i]}"
 stage="$(dirname "$dst")/.mhc-monitor-$(basename "$dst").$$"
 cp -- "$work/$i" "$stage" || { rollback;fail 'Stage copy failed'; }
 chmod 600 "$stage" || { rollback;fail 'Stage chmod failed'; }
 mv -f -- "$stage" "$dst" || { rollback;fail 'Atomic replace failed'; }
done
if ! sv restart "$svc";then rollback;fail 'Panel restart failed';fi
if [[ "$agent_running" == true ]] && ! sv restart "$agent";then rollback;fail 'Authority agent restart failed';fi
healthy=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15;do
 sleep 1
 if [[ "$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/ 2>/dev/null||true)" == 200 ]] &&
    [[ "$(curl -fsS --max-time 4 http://127.0.0.1:9090/app.js | git hash-object --stdin)" == "${hashes[4]}" ]];then
  healthy=1;break
 fi
done
if [[ "$healthy" != 1 ]];then rollback;fail 'Panel HTTP / app.js verify failed; original code restored';fi
echo 'APPLIED_OK: local full Monitor v2 and telemetry agent code installed'
echo "BACKUP=$backup"
echo "AGENT_RESTARTED=$agent_running"
echo 'Cloudflare Worker still needs compatible deploy for shared multi-node metrics/history.'
echo 'No Primary switch, DNS, Cloudflare Tunnel or hosting data touched.'
