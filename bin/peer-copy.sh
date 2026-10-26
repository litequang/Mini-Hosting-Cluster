#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail; umask 077
CONF="$HOME/.config/mhc-full-installer/peer.conf"
BIN="$HOME/.local/share/mhc-full-installer/bin"
fail(){ echo "ERROR: $*" >&2; exit 1; }
valid(){ [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_.-]{0,31}$ && "$2" =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,251}$ && "$3" =~ ^[0-9]{2,5}$ ]] && (( 10#$3 <= 65535 )); }
configure(){
  [[ $# == 3 ]] && valid "$1" "$2" "$3" || fail 'Usage: mhc-full peer configure SSH_USER HOST PORT'
  mkdir -p "$(dirname "$CONF")";chmod 700 "$(dirname "$CONF")"
  cat > "$CONF" <<EOF
PEER_USER=$1
PEER_HOST=$2
PEER_PORT=$3
EOF
  chmod 600 "$CONF"
  echo 'Peer configured. Pre-pin server SSH host key and authorize a restricted SSH key before peer push.'
  echo 'WARNING: snapshots contain secrets. Enable transfer only to trusted encrypted/off-device storage.'
}
configured(){ [[ -f "$CONF" ]]; }
load(){
  configured || fail 'Peer not configured. Run peer configure USER HOST PORT first.'
  PEER_USER="$(sed -n 's/^PEER_USER=//p' "$CONF")"
  PEER_HOST="$(sed -n 's/^PEER_HOST=//p' "$CONF")"
  PEER_PORT="$(sed -n 's/^PEER_PORT=//p' "$CONF")"
  valid "$PEER_USER" "$PEER_HOST" "$PEER_PORT" || fail 'Unsafe peer config'
}
push(){
  load
  local snapshot name node remote userhost stage
  [[ -f "$HOME/hosting-backups/mhc-full/latest-success-path" ]] || fail 'No local snapshot'
  snapshot="$(cat "$HOME/hosting-backups/mhc-full/latest-success-path")"
  "$BIN/backup-verify.sh" verify "$snapshot"
  name="$(basename "$snapshot")"; [[ "$name" =~ ^snapshot-[0-9]{8}$ ]] || fail 'Unexpected snapshot name'
  local nodefile="$HOME/.config/mhc-full-installer/backup-node-id"
  mkdir -p "$(dirname "$nodefile")"
  if [[ ! -f "$nodefile" ]];then
    (umask 077;openssl rand -hex 16 > "$nodefile")
  fi
  node="$(cat "$nodefile")"; [[ "$node" =~ ^[a-fA-F0-9]{32}$ ]] || fail 'Invalid backup node identity'
  # Remote locations are per source node to avoid colliding with other cluster members.
  remote="hosting-backups/mhc-full/incoming/$node"
  userhost="$PEER_USER@$PEER_HOST"
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -p "$PEER_PORT" "$userhost" "mkdir -p '$remote'"
  stage="$remote/.pending-$name"
  # Idempotent retry: a completed remote snapshot must independently verify.
  if ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -p "$PEER_PORT" "$userhost" "test -d '$remote/$name' && cd '$remote/$name' && sha256sum -c SHA256SUMS >/dev/null" 2>/dev/null;then
    echo "Already verified on receiver: $PEER_HOST:$remote/$name";return 0
  fi
  # An existing but corrupt destination MUST NOT be silently overwritten.
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -p "$PEER_PORT" "$userhost" "test ! -e '$remote/$name' && mkdir -p '$stage'" || fail 'Remote destination exists but is unverified, or access failed'
  rsync -az --partial -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -p $PEER_PORT" -- "$snapshot/" "$userhost:$stage/"
  # Remote verifies all hashes + compressed streams BEFORE the atomic publish.
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -p "$PEER_PORT" "$userhost" "cd '$stage' && sha256sum -c SHA256SUMS >/dev/null && for f in *.tar.gz databases/*.sql.gz; do if test -f \"\$f\"; then gzip -t \"\$f\" || exit 1; fi; done && cd .. && test ! -e '$name' && mv '.pending-$name' '$name'" || fail 'Remote transfer failed verification; .pending directory retained for inspection'
  echo "Remote verified snapshot: $PEER_HOST:$remote/$name"
}
case "${1:-}" in
 configure)shift; configure "$@";;
 push)push;;
 status) if configured;then load; echo "Peer: $PEER_USER@$PEER_HOST port $PEER_PORT";else echo 'Peer: not configured';fi;;
 *) echo 'Usage: mhc-full peer configure USER HOST PORT | push | status';exit 2;;
esac
