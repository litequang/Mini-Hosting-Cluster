#!/data/data/com.termux/files/usr/bin/bash
# Pull verified snapshot from PRIMARY over SSH; apply in dual DB/release slots on secondary.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Termux only';exit 1; }
ROOT="$HOME/standby-sync"; CFG="$ROOT/config"
[[ -f "$ROOT/.standby-installed" && -r "$CFG" && -f "$HOME/recovery-input/RECOVERED.txt" ]] || { echo 'Not a configured secondary';exit 1; }
if sv status "$PREFIX/var/service/named-tunnel" 2>/dev/null | grep -q '^run:';then
 echo 'SECURITY STOP: standby Tunnel running; sync disabled to avoid split-brain';exit 1
fi
if sv status "$PREFIX/var/service/mini-web" 2>/dev/null | grep -q '^run:';then
 echo 'STANDBY PAUSED: mini-web active (possible promotion). Do not sync a serving node.';exit 1
fi
# Config created by setup-standby after strict input validation.
source "$CFG"
# Reject cloned configuration running on an unexpected role or with a changed primary.
CLUSTER_CONFIG="$HOME/.config/mini-hosting-cluster/node.json"
[[ -r "$CLUSTER_CONFIG" ]] || { echo 'CLUSTER STOP: no local identity';exit 1; }
node - "$CLUSTER_CONFIG" "$PRIMARY_HOST" "$PRIMARY_USER" "$PRIMARY_PORT" <<'NODE'
const fs=require('fs');const [f,h,u,p]=process.argv.slice(2);const c=JSON.parse(fs.readFileSync(f,'utf8'));
if(c.role!=='standby'||c.primary.host!==h||c.primary.user!==u||String(c.primary.port)!==String(p)){
  console.error('CLUSTER STOP: source identity or role mismatch');process.exit(1);
}
NODE
KEY="$HOME/.ssh/mini-hosting-standby-ed25519"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=2 -i "$KEY" -p "$PRIMARY_PORT")
REMOTE="$PRIMARY_USER@$PRIMARY_HOST"
REMOTE_ID="$("${SSH[@]}" "$REMOTE" 'node "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" identity-json' 2>/dev/null)" || { echo 'CLUSTER STOP: primary identity unavailable';exit 1; }
node - "$CLUSTER_CONFIG" "$REMOTE_ID" <<'NODE'
const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const r=JSON.parse(process.argv[3]);
if(r.role!=='primary'||r.clusterId!==c.clusterId||r.nodeId!==c.primary.nodeId){
 console.error('CLUSTER STOP: primary identity changed or no longer primary');process.exit(1);
}
NODE
ROOT_REMOTE='/data/data/com.termux/files/home/hosting-backups/thophuongpro'
mkdir -p "$ROOT/snapshots" "$ROOT/releases"
if ! mkdir "$ROOT/.sync-lock" 2>/dev/null;then echo 'Already syncing (or stale lock). Inspect before retry.'; exit 1;fi
trap 'rmdir "$ROOT/.sync-lock" 2>/dev/null || true' EXIT
SNAP="$("${SSH[@]}" "$REMOTE" 'cat "$HOME/hosting-backups/thophuongpro/latest-success-path"' 2>/dev/null)" || { echo 'Primary unavailable, preserving last verified standby'; exit 1; }
[[ "$SNAP" =~ ^/data/data/com\.termux/files/home/hosting-backups/thophuongpro/(snapshot-[0-9]{8}-[0-9]{6}-[0-9]+)$ ]] || { echo 'Primary provided unexpected snapshot path'; exit 1; }
NAME="${BASH_REMATCH[1]}"
APPLIED="$(cat "$ROOT/latest-applied" 2>/dev/null || true)"
[[ "$APPLIED" != "$NAME" ]] || { echo "UP TO DATE: $NAME";exit 0; }
LOCAL="$ROOT/snapshots/$NAME"
if [[ ! -d "$LOCAL" ]];then
 STAGE="$ROOT/snapshots/.$NAME.pending"
 mkdir -p "$STAGE"; chmod 700 "$STAGE"
 # rsync transport: host & user were validated in setup; snapshot path is strictly anchored.
 RSYNC_RSH="$(command -v ssh) -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -i $KEY -p $PRIMARY_PORT"
 export RSYNC_RSH
 rsync -a --partial --chmod=D700,F600 "$REMOTE:$SNAP/" "$STAGE/"
 (cd "$STAGE" && sha256sum -c SHA256SUMS)
 for f in database.sql.gz storage.tar.gz app-release.tar.gz INFO.txt SHA256SUMS;do [[ -s "$STAGE/$f" ]] || { echo "Missing $f";exit 1; };done
 gzip -t "$STAGE/database.sql.gz"
 for f in "$STAGE"/*.tar.gz;do tar -tzf "$f" >/dev/null;done
 mv "$STAGE" "$LOCAL"
fi
if [[ -L "$HOME/apps/thophuongpro" && "$(readlink -f "$HOME/apps/thophuongpro")" == "$ROOT/releases/$NAME" ]];then
 echo "Previous application succeeded, recording status: $NAME"
else
 "$ROOT/apply-snapshot.sh" "$LOCAL"
fi
printf '%s\n' "$NAME" > "$ROOT/latest-applied"
printf '%s\n' "$(date -Iseconds)" > "$ROOT/last-applied-at"
echo "STANDBY PREPARED (LOCAL ONLY; TUNNEL OFF): $NAME"
# Keep last 3 downloaded snapshots, never delete active target.
mapfile -t ALL < <(find "$ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d -name 'snapshot-*' | sort)
if (( ${#ALL[@]} > 3 ));then
 for ((i=0;i<${#ALL[@]}-3;i++));do [[ "${ALL[i]}" != "$LOCAL" ]] && rm -rf -- "${ALL[i]}";done
fi
