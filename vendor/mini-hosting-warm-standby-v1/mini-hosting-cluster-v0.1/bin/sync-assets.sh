#!/data/data/com.termux/files/usr/bin/bash
# Run ONLY on stopped standby. Verify SHA256 all files on both nodes then checkpoint.
set -Eeuo pipefail;umask 077
ROOT="$HOME/.local/share/mini-hosting-cluster"
CONF="$HOME/.config/mini-hosting-cluster/node.json"
[[ -s "$CONF" ]] || { echo 'No cluster identity';exit 1; }
readarray -t V < <(node - "$CONF" <<'NODE'
const c=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));
if(c.role!=='standby'||!c.primary)process.exit(2);
for(const x of [c.primary.host,c.primary.user,c.primary.port])console.log(x);
NODE
)
(( ${#V[@]} == 3 )) || { echo 'Not standby';exit 1; }
[[ "$(sv status mini-web 2>/dev/null)" != run:* && "$(sv status named-tunnel 2>/dev/null)" != run:* ]] || { echo 'Standby is serving; cannot sync';exit 1; }
KEY="$HOME/.ssh/mini-hosting-standby-ed25519"
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=8 -i "$KEY" -p "${V[2]}")
REMOTE="${V[1]}@${V[0]}"
REMOTE_ROLE="$("${SSH[@]}" "$REMOTE" 'node "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" identity-json')"
node - "$CONF" "$REMOTE_ROLE" <<'NODE'
const fs=require('fs'),c=JSON.parse(fs.readFileSync(process.argv[2])),r=JSON.parse(process.argv[3]);
if(r.clusterId!==c.clusterId||r.nodeId!==c.primary.nodeId||r.role!=='primary')throw Error('Upstream role or ID changed');
NODE
mkdir -p "$HOME/apps/thophuongpro/storage" "$HOME/standby-sync"
# Preserve newer standalone files by refusing destructive --delete. Changed source will be copied.
RSYNC_RSH="$(command -v ssh) -o BatchMode=yes -o StrictHostKeyChecking=yes -i $KEY -p ${V[2]}"
export RSYNC_RSH
rsync -a --partial --chmod=D700,F600 "$REMOTE:/data/data/com.termux/files/home/apps/thophuongpro/storage/" "$HOME/apps/thophuongpro/storage/"
LOCAL="$(node "$ROOT/src/asset-digest.mjs" digest)"
UPSTREAM="$("${SSH[@]}" "$REMOTE" 'node "$HOME/.local/share/mini-hosting-cluster/src/asset-digest.mjs" digest')"
[[ "$LOCAL" == "$UPSTREAM" ]] || { echo 'ASSET MISMATCH: source changed or extra local files; no checkpoint';exit 1; }
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node "$ROOT/src/asset-digest.mjs" stamp "$LOCAL" "$STAMP"
"${SSH[@]}" "$REMOTE" "node \"\$HOME/.local/share/mini-hosting-cluster/src/asset-digest.mjs\" stamp '$LOCAL' '$STAMP'"
echo "SYNC ASSETS VERIFIED: $LOCAL"
