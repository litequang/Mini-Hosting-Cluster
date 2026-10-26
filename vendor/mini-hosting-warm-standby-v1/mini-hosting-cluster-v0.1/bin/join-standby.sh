#!/data/data/com.termux/files/usr/bin/bash
# Pair existing RESTORED standby to an existing primary over trusted SSH.
set -Eeuo pipefail;umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Termux only';exit 1; }
PRIMARY_HOST="${1:-}";PRIMARY_USER="${2:-}";PRIMARY_PORT="${3:-8022}";LABEL="${4:-$(getprop ro.product.model 2>/dev/null | tr ' ' '-' | cut -c1-30 || echo node)}"
[[ "$PRIMARY_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ && "$PRIMARY_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ && "$PRIMARY_PORT" =~ ^[0-9]+$ ]] || { echo 'Usage: mhc join-standby IP USER [PORT] [LABEL]';exit 1; }
[[ "$LABEL" =~ ^[a-zA-Z0-9_.-]{1,40}$ ]] || { echo 'Use node label like X7b, Node03';exit 1; }
(( PRIMARY_PORT>0 && PRIMARY_PORT<65536 )) || exit 1
[[ -f "$HOME/recovery-input/RECOVERED.txt" && -f "$HOME/apps/thophuongpro/.env" ]] || { echo 'STOP: first restore complete snapshot and recovery config on this phone';exit 1; }
for n in mini-web named-tunnel;do
 if sv status "$n" 2>/dev/null | grep -q '^run:';then echo "STOP: $n is RUNNING; disable it manually before joining standby: sv-disable $n && sv down $n";exit 1;fi
done
for cmd in ssh ssh-keygen ssh-copy-id rsync mariadb node;do command -v "$cmd" >/dev/null || { echo "Missing $cmd; pkg install openssh rsync nodejs";exit 1; };done
KEY="$HOME/.ssh/mini-hosting-standby-ed25519"
mkdir -p "$HOME/.ssh";chmod 700 "$HOME/.ssh"
[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -a 40 -N '' -f "$KEY" -C 'mini-hosting-cluster-standby'
chmod 600 "$KEY"
REMOTE="$PRIMARY_USER@$PRIMARY_HOST"
echo 'ATTENTION: verify the ED25519 SSH host fingerprint against the primary PHONE before accepting yes.'
ssh -o StrictHostKeyChecking=ask -o ConnectTimeout=10 -p "$PRIMARY_PORT" "$REMOTE" 'printf "Verified primary SSH host handshake\n"'
echo 'Authorize this phone SSH key on primary (primary password once):'
ssh-copy-id -i "$KEY.pub" -p "$PRIMARY_PORT" "$REMOTE"
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -i "$KEY" -p "$PRIMARY_PORT")
ID_JSON="$("${SSH[@]}" "$REMOTE" 'node "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" identity-json')"
readarray -t IDS < <(node -e 'let s=JSON.parse(process.argv[1]); if(s.role!=="primary"||!s.clusterId||!s.nodeId)process.exit(1);console.log(s.clusterId);console.log(s.nodeId)' "$ID_JSON")
[[ "${#IDS[@]}" == 2 ]] || { echo 'Remote peer is not an initialized PRIMARY node';exit 1; }
CID="${IDS[0]}";PID="${IDS[1]}"
LOCAL_ID="$(node "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" identity-json 2>/dev/null || true)"
if [[ -n "$LOCAL_ID" ]];then
 node -e 'let s=JSON.parse(process.argv[1]);if(s.role!=="standby"||s.clusterId!==process.argv[2]||s.primary.host!==process.argv[3])process.exit(1)' "$LOCAL_ID" "$CID" "$PRIMARY_HOST" || { echo 'STOP: This node belongs to another cluster/role';exit 1; }
else
 node "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" adopt-standby "$CID" "$PID" "$LABEL" "$PRIMARY_HOST" "$PRIMARY_USER" "$PRIMARY_PORT"
fi
MY_ID="$(node "$HOME/.local/share/mini-hosting-cluster/src/cli.mjs" identity-json)"
MY_UUID="$(node -p 'JSON.parse(process.argv[1]).nodeId' "$MY_ID")"
# Registration contact uses caller-provided LOCAL_LAN_IP, not automatically inferred host address.
# Mandatory explicit IP avoids accepting untrusted SSH_CONNECTION or Wi-Fi IP guesses.
echo "Enter this node's LAN address (for primary to check it), e.g. 192.168.1.35:"
read -r -p 'Standby LAN IP: ' LOCAL_IP
[[ "$LOCAL_IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || { echo 'Must specify IPv4 LAN address';exit 1; }
node -e 'let a=process.argv[1].split(".").map(Number);if(a.some(x=>x>255))process.exit(1)' "$LOCAL_IP"
"${SSH[@]}" "$REMOTE" "node \"\$HOME/.local/share/mini-hosting-cluster/src/cli.mjs\" register '$CID' '$MY_UUID' '$LABEL' '$LOCAL_IP' '$(id -un)' '8022'"
echo '--- Configure safe snapshot polling on standby ---'
"$HOME/.local/share/mini-hosting-cluster/bin/setup-sync.sh" "$PRIMARY_HOST" "$PRIMARY_USER" "$PRIMARY_PORT"
echo "JOINED: $LABEL; snapshots will be synced from $PRIMARY_HOST; named-tunnel must remain OFF"
echo 'Inspect: ~/mhc status --remote; ~/standby-sync/status.sh'
