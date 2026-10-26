#!/data/data/com.termux/files/usr/bin/bash
# Full clone: source = current primary. Target = clean phone with Mini Hosting base installed.
# NO changes to primary, NO tunnel promotion. Interactive recovery passphrase required.
set -Eeuo pipefail;umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Termux only';exit 1; }
HOST="${1:-}";USER="${2:-}";PORT="${3:-8022}";LABEL="${4:-Node$(date +%s)}"
[[ "$HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ && "$USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ && "$PORT" =~ ^[0-9]+$ && "$LABEL" =~ ^[a-zA-Z0-9_.-]{1,40}$ ]] || { echo 'Usage: mhc bootstrap-new PRIMARY_IP PRIMARY_USER [SSH_PORT] [NODE_LABEL]';exit 1; }
(( PORT>0 && PORT<65536 )) || exit 1
[[ -d "$HOME/android-hosting-panel" && -d "$HOME/.nginx" ]] || { echo 'Install baseline Mini Hosting first: mini-hosting-dr-v1/bin/install-new-phone.sh';exit 1; }
[[ ! -f "$HOME/apps/thophuongpro/.env" && ! -f "$HOME/recovery-input/RECOVERED.txt" ]] || { echo 'STOP: this phone already has application/restore marker; no overwrite';exit 1; }
[[ ! -f "$HOME/.config/mini-hosting-cluster/node.json" ]] || { echo 'STOP: already a cluster member';exit 1; }
BASE="$HOME/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/bin"
[[ -f "$BASE/restore-new-phone.sh" ]] || { echo 'Missing restore-new-phone.sh from bundled package';exit 1; }
for c in ssh ssh-copy-id ssh-keygen rsync scp sha256sum gzip tar node;do command -v "$c" >/dev/null || { echo "Missing $c";exit 1;};done
FREE_KB="$(df -Pk "$HOME" | tail -1 | awk '{print $4}')"
[[ "$FREE_KB" =~ ^[0-9]+$ ]] || exit 1
(( FREE_KB >= 3145728 )) || { echo "Require >=3 GiB free for clone/staging, only $((FREE_KB/1024)) MiB available";exit 1; }
echo '=== New node FULL CLONE from primary ==='
echo 'This will create a LOCAL database/app on this clean phone, not alter the primary.'
read -r -p 'Enter CLONE to continue: ' A
[[ "$A" == CLONE ]] || { echo 'Cancelled';exit 1; }
KEY="$HOME/.ssh/mini-hosting-standby-ed25519";mkdir -p "$HOME/.ssh";chmod 700 "$HOME/.ssh"
[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -a 40 -N '' -f "$KEY" -C 'mini-hosting-cluster-clone'
chmod 600 "$KEY"
REMOTE="$USER@$HOST"
echo 'Before accepting SSH host key, compare fingerprint on the physical primary phone.'
ssh -o StrictHostKeyChecking=ask -o ConnectTimeout=10 -p "$PORT" "$REMOTE" 'printf "Primary reachable\n"'
ssh-copy-id -i "$KEY.pub" -p "$PORT" "$REMOTE"
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -i "$KEY" -p "$PORT")
IDENT="$("${SSH[@]}" "$REMOTE" 'node "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" identity-json')"
node -e 'let x=JSON.parse(process.argv[1]);if(x.role!=="primary"||!x.clusterId||!x.nodeId)process.exit(1)' "$IDENT" || { echo 'STOP: source is not registered primary';exit 1; }
SNAP="$("${SSH[@]}" "$REMOTE" 'cat "$HOME/hosting-backups/thophuongpro/latest-success-path"')"
[[ "$SNAP" =~ ^/data/data/com\.termux/files/home/hosting-backups/thophuongpro/(snapshot-[0-9]{8}-[0-9]{6}-[0-9]+)$ ]] || { echo 'Unexpected primary snapshot path';exit 1; }
NAME="${BASH_REMATCH[1]}"
mkdir -p "$HOME/recovery-input";chmod 700 "$HOME/recovery-input"
RECV="$HOME/recovery-input/$NAME";mkdir -p "$RECV";chmod 700 "$RECV"
SSH_RSH="ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -i $KEY -p $PORT"
export RSYNC_RSH="$SSH_RSH"
echo "Copying VERIFIED primary snapshot: $NAME"
rsync -a --partial --chmod=D700,F600 "$REMOTE:$SNAP/" "$RECV/"
(cd "$RECV" && sha256sum -c SHA256SUMS)
for f in app-release.tar.gz storage.tar.gz database.sql.gz INFO.txt SHA256SUMS;do [[ -s "$RECV/$f" ]] || { echo "Missing $f";exit 1;};done
scp -q -P "$PORT" -i "$KEY" -o StrictHostKeyChecking=yes "$REMOTE:mini-hosting-recovery.enc" "$HOME/recovery-input/mini-hosting-recovery.enc"
[[ -s "$HOME/recovery-input/mini-hosting-recovery.enc" ]] || { echo 'Encrypted recovery config not on primary';exit 1; }
sv-disable named-tunnel || true;sv down named-tunnel || true
printf '\nSnapshot verified and encrypted config received. RECOVERY PASSPHRASE will be asked locally.\n'
bash "$BASE/restore-new-phone.sh" "$RECV" "$HOME/recovery-input/mini-hosting-recovery.enc"
[[ -f "$HOME/recovery-input/RECOVERED.txt" ]] || { echo 'STOP: restore incomplete';exit 1; }
sv-disable mini-web;sv down mini-web
sv-disable named-tunnel;sv down named-tunnel
sv-disable tpp-backup || true;sv down tpp-backup || true
"$HOME/.local/share/mini-hosting-cluster/bin/join-standby.sh" "$HOST" "$USER" "$PORT" "$LABEL"
printf '\nNEW NODE COMPLETE: Full snapshot restored and standby sync configured.\n'
