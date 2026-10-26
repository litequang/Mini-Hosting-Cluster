#!/data/data/com.termux/files/usr/bin/bash
# Bidirectional/off-device safety archive. NEVER restores or edits a live database/app.
set -Eeuo pipefail;umask 077
CFG="$HOME/.config/mini-hosting-cluster/ha-backup.json"
[[ -f "$CFG" ]] || { echo 'BACKUP SOURCE NOT SET. Use mhc ha backup-source';exit 1; }
readarray -t V < <(node - "$CFG" <<'NODE'
const f=process.argv[2],v=JSON.parse(require('fs').readFileSync(f,'utf8'));
for(const x of [v.host,v.user,v.port,v.nodeId])console.log(x);
NODE
)
(( ${#V[@]}==4 )) || exit 1
KEY="$HOME/.ssh/mini-hosting-standby-ed25519"
[[ -r "$KEY" ]] || { echo 'No SSH key to peer; do not disable host key checks';exit 1; }
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=7 -i "$KEY" -p "${V[2]}")
REMOTE="${V[1]}@${V[0]}"
IDENTITY="$("${SSH[@]}" "$REMOTE" 'node "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" identity-json')"
node - "$HOME/.config/mini-hosting-cluster/node.json" "$IDENTITY" "${V[3]}" <<'NODE'
const fs=require('fs'),c=JSON.parse(fs.readFileSync(process.argv[2])),r=JSON.parse(process.argv[3]);
if(r.clusterId!==c.clusterId||r.nodeId!==process.argv[4]||c.nodeId===r.nodeId)throw Error('Cluster / peer identity mismatch');
NODE
SNAP="$("${SSH[@]}" "$REMOTE" 'cat "$HOME/hosting-backups/thophuongpro/latest-success-path"')"
[[ "$SNAP" =~ ^/data/data/com\.termux/files/home/hosting-backups/thophuongpro/(snapshot-[0-9]{8}-[0-9]{6}-[0-9]+)$ ]] || { echo 'Unexpected source snapshot path';exit 1; }
NAME="${BASH_REMATCH[1]}"
ROOT="$HOME/hosting-backups/peer-cluster/${V[3]}"
mkdir -p "$ROOT"
LOCK="$ROOT/.pull-lock"
mkdir "$LOCK" 2>/dev/null || { echo 'Backup pull in progress or stale lock';exit 1; }
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
TARGET="$ROOT/$NAME"
if [[ -d "$TARGET" ]];then
 (cd "$TARGET" && sha256sum -c SHA256SUMS >/dev/null)
 echo "PEER BACKUP UP TO DATE: $NAME";exit 0
fi
STAGE="$ROOT/.$NAME.pending"
mkdir -p "$STAGE"
export RSYNC_RSH="$(command -v ssh) -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=7 -i $KEY -p ${V[2]}"
rsync -a --partial --chmod=D700,F600 "$REMOTE:$SNAP/" "$STAGE/"
for f in SHA256SUMS database.sql.gz storage.tar.gz app-release.tar.gz INFO.txt;do
 [[ -s "$STAGE/$f" ]] || { echo "Missing verified artifact $f";exit 1; }
done
(cd "$STAGE" && sha256sum -c SHA256SUMS)
gzip -t "$STAGE/database.sql.gz"
for f in "$STAGE/storage.tar.gz" "$STAGE/app-release.tar.gz";do tar -tzf "$f" >/dev/null;done
mv "$STAGE" "$TARGET"
echo "PEER BACKUP VERIFIED: $TARGET"
mapfile -t ALL < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name 'snapshot-*' | sort)
if (( ${#ALL[@]} > 7 ));then
 for ((i=0;i<${#ALL[@]}-7;i++));do [[ "${ALL[i]}" != "$TARGET" ]] && rm -rf -- "${ALL[i]}";done
fi
