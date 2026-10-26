#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Run from Termux';exit 1; }
BASE="$(cd "$(dirname "$0")" && pwd)"
SNAP="${1:-}"
[[ -d "$SNAP" && -f "$SNAP/SHA256SUMS" ]] || { echo 'Usage: export-snapshot-encrypted.sh ~/hosting-backups/thophuongpro/snapshot-...';exit 1; }
SNAP="$(cd "$SNAP" && pwd)"
(cd "$SNAP" && sha256sum -c SHA256SUMS)
NAME="$(basename "$SNAP")"
TMP="$(mktemp "$HOME/.dr-data-XXXXXX.tar.gz")"
trap 'rm -f -- "$TMP"' EXIT
tar -czf "$TMP" -C "$(dirname "$SNAP")" "$NAME"
OUT="$HOME/$NAME.tar.gz.enc"
[[ ! -e "$OUT" ]] || { echo "Already exists: $OUT";exit 1; }
read -r -s -p 'Encryption passphrase (16+ chars; store safely): ' PW1;echo
read -r -s -p 'Confirm passphrase: ' PW2;echo
[[ "$PW1" == "$PW2" && ${#PW1} -ge 16 ]] || { echo 'Passphrase mismatch';exit 1; }
DR_PASSWORD="$PW1" node "$BASE/secure-file.mjs" encrypt "$TMP" "$OUT"
unset PW1 PW2
chmod 600 "$OUT"
echo "ENCRYPTED DATA: $OUT"
echo 'Copy outside the device. On new phone, decrypt then extract into ~/recovery-input/.'
