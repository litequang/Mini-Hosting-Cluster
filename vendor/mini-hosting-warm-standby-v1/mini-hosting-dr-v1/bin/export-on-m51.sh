#!/data/data/com.termux/files/usr/bin/bash
# Execute on existing M51 while still working. Produces authenticated encrypted server configuration.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Run in Termux';exit 1; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$HOME/android-hosting-panel/src/server.mjs" ]] || { echo 'Missing installed Panel source';exit 1; }
[[ -f "$HOME/.cloudflared/thophuong.token" ]] || { echo 'Missing named Tunnel token; cannot create complete recovery bundle';exit 1; }
if [[ -f "$HOME/mini-hosting-recovery.enc" ]];then echo 'An export already exists: ~/mini-hosting-recovery.enc. Move it to secure storage before exporting again.';exit 1;fi
STAGE="$(mktemp -d "$HOME/.dr-export.XXXXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT
mkdir -p "$STAGE/home" "$STAGE/meta" "$STAGE/services"
cp -a "$HOME/android-hosting-panel" "$STAGE/home/"
# Avoid bundling unrelated website backups, staged uploads and outdated versions in Panel data.
rm -rf "$STAGE/home/android-hosting-panel/data/backups" "$STAGE/home/android-hosting-panel/data/upgrade-backups" "$STAGE/home/android-hosting-panel/data/trash"
mkdir -p "$STAGE/home/.cloudflared"
cp -p "$HOME/.cloudflared/thophuong.token" "$STAGE/home/.cloudflared/"
if [[ -f "$HOME/.cloudflared/config.yml" ]];then cp -p "$HOME/.cloudflared/config.yml" "$STAGE/home/.cloudflared/";fi
if [[ -d "$HOME/.nginx" ]];then cp -a "$HOME/.nginx" "$STAGE/home/";fi
if [[ -d "$HOME/.termux/boot" ]];then mkdir -p "$STAGE/home/.termux";cp -a "$HOME/.termux/boot" "$STAGE/home/.termux/";fi
if [[ -d "$HOME/.local/share/tpp-backup" ]];then mkdir -p "$STAGE/home/.local/share";cp -a "$HOME/.local/share/tpp-backup" "$STAGE/home/.local/share/";fi
if [[ -f "$PREFIX/etc/nginx/nginx.conf" ]];then cp -p "$PREFIX/etc/nginx/nginx.conf" "$STAGE/meta/nginx-original.conf";fi
if [[ -d "$PREFIX/var/service" ]];then
 for source in "$PREFIX"/var/service/*;do
  [[ -d "$source" && -f "$source/run" ]] || continue
  service="$(basename "$source")"
  mkdir -p "$STAGE/services/$service"
  cp -p "$source/run" "$STAGE/services/$service/run"
  [[ ! -f "$source/down" ]] || cp -p "$source/down" "$STAGE/services/$service/down"
 done
fi
{ date -Iseconds;uname -m; command -v node >/dev/null && node -v; command -v mariadb >/dev/null && mariadb --version; } > "$STAGE/meta/primary-version.txt"
TAR="$STAGE/config.tar.gz"
tar -czf "$TAR" -C "$STAGE" home meta services
read -r -s -p 'Encryption passphrase (16+ chars; SAVE IT OFF-DEVICE): ' PWD1;echo
read -r -s -p 'Confirm passphrase: ' PWD2;echo
if [[ "$PWD1" != "$PWD2" || ${#PWD1} -lt 16 ]];then echo 'Passphrases mismatch or too short';exit 1;fi
DR_PASSWORD="$PWD1" node "$SCRIPT_DIR/secure-file.mjs" encrypt "$TAR" "$HOME/mini-hosting-recovery.enc"
unset PWD1 PWD2
chmod 600 "$HOME/mini-hosting-recovery.enc"
echo 'EXPORT COMPLETE: ~/mini-hosting-recovery.enc'
echo 'CRITICAL: copy encrypted file, recovery ZIP and a VERIFIED snapshot directory to PC or PRIVATE cloud storage. Remember passphrase.'
