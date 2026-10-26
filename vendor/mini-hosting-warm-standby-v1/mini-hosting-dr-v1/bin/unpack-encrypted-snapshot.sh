#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Run inside Termux';exit 1; }
ENC="${1:-}"
[[ -f "$ENC" ]] || { echo 'Usage: unpack-encrypted-snapshot.sh ~/recovery-input/snapshot-...tar.gz.enc';exit 1; }
BASE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/recovery-input";chmod 700 "$HOME/recovery-input"
TMP="$(mktemp "$HOME/.dr-snapshot-XXXXXX.tar.gz")";rm -f "$TMP"
trap 'rm -f -- "$TMP"' EXIT
read -r -s -p 'Encrypted snapshot passphrase: ' DR_PWD;echo
DR_PASSWORD="$DR_PWD" node "$BASE/secure-file.mjs" decrypt "$ENC" "$TMP"
unset DR_PWD
LIST="$(tar -tzf "$TMP")"
if printf '%s\n' "$LIST" | grep -Eq '(^/|(^|/)\.\.(/|$))';then echo 'UNSAFE: bad path in archive';exit 1;fi
if ! printf '%s\n' "$LIST" | grep -q '^snapshot-[0-9].*/SHA256SUMS$';then echo 'ERROR: not a snapshot archive';exit 1;fi
if tar -tvzf "$TMP" | grep -q '^l';then echo 'ERROR: symlink found in archive';exit 1;fi
tar -xzf "$TMP" -C "$HOME/recovery-input" --no-same-owner --no-same-permissions
echo 'DECRYPTED: snapshot directory extracted under ~/recovery-input/'
find "$HOME/recovery-input" -maxdepth 2 -name SHA256SUMS -print
