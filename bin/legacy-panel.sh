#!/data/data/com.termux/files/usr/bin/bash
# Explicit, reversible, read-only MHC integration into ORIGINAL hosting panel (9090).
# This patch is for a confirmed clean Vsmart-style LAB node ONLY.
set -Eeuo pipefail;umask 077
BASE="$HOME/.local/share/mhc-full-installer"
SOURCE="$BASE/bin/legacy-panel-src"
DEST="$HOME/android-hosting-panel"
MARK="$HOME/.config/mhc-full-installer/installed"
BACKUPS="$BASE/legacy-panel-rollbacks"
FILES=(src/server.mjs src/system.mjs public/index.html public/app.js public/style.css)
NEW=(src/mhc-integration.mjs src/mhc-remote-access.mjs)
fail(){ echo "STOP: $*" >&2;exit 1; }
preflight(){
 [[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || fail 'Termux required'
 [[ -f "$MARK" && ! -e "$HOME/.config/mhc-full-installer/install-incomplete" ]] || fail 'Completed TEST MHC marker required'
 [[ ! -e "$HOME/apps/thophuongpro/.env" && ! -e "$HOME/.config/mini-hosting-cluster/ha.json" ]] || fail 'Production/HA footprint; update denied'
 [[ -d "$DEST" && -f "$DEST/src/server.mjs" && -f "$DEST/data/admin.json" ]] || fail 'Original configured Panel 9090 not found'
 [[ -d "$SOURCE" ]] || fail 'Source assets not installed: run TEST source-only upgrade first'
 grep -Fq 'Android Mini Hosting Panel listening' "$DEST/src/server.mjs" || fail 'Unknown Panel implementation; do not overwrite'
 for f in "${FILES[@]}";do
  [[ -f "$DEST/$f" && ! -L "$DEST/$f" && -f "$SOURCE/$f" && ! -L "$SOURCE/$f" ]] || fail "Unsafe/missing $f"
 done
 [[ ! -L "$DEST/src" && ! -L "$DEST/public" && ! -L "$DEST/data" ]] || fail 'Symlink directory; refuse'
 for f in "${NEW[@]}";do [[ ! -e "$DEST/$f" || ( -f "$DEST/$f" && ! -L "$DEST/$f" ) ]] || fail "Unsafe bridge path: $f";done
 node --check "$SOURCE/src/server.mjs" && node --check "$SOURCE/src/mhc-integration.mjs" && node --check "$SOURCE/src/mhc-remote-access.mjs" && node --check "$SOURCE/public/app.js" || fail 'Source syntax invalid'
}
if [[ "${1:-}" == plan ]];then
 preflight
 echo 'PASS: original Panel 9090 LAB ready for additive module/cluster read-only integration'
 echo 'Will back up 4 existing UI files, update MHC bridge and add remote Access validator. WILL NOT touch admin.json, website, PHP/Nginx, DB, SSH, tunnel or HA.'
 echo 'No changes made; apply is a separate confirmed action.'
 exit 0
fi
if [[ "${1:-}" == apply ]];then
 preflight
 read -r -p 'Type UPGRADE_ORIGINAL_PANEL_LAB to proceed: ' YES
 [[ "$YES" == UPGRADE_ORIGINAL_PANEL_LAB ]] || { echo Cancelled;exit 0; }
 mkdir -p -m 700 "$BACKUPS"
 stamp="$(date +%Y%m%d-%H%M%S)-$$"
 backup="$BACKUPS/$stamp"
 mkdir -m 700 "$backup"
 for f in "${FILES[@]}";do mkdir -p "$backup/$(dirname "$f")";cp -p "$DEST/$f" "$backup/$f";done
 for f in "${NEW[@]}";do if [[ -f "$DEST/$f" ]];then mkdir -p "$backup/src";cp -p "$DEST/$f" "$backup/$f";else touch "$backup/$(basename "$f")-absent";fi;done
 # Staged copy under destination filesystem; files are atomically renamed one by one.
 staged="$(mktemp -d "$DEST/.mhc-panel-upgrade.XXXXXXXX")"
 rollback_on_error(){
  for f in "${FILES[@]}";do cp -p "$backup/$f" "$DEST/$f" 2>/dev/null || true;done
  for f in "${NEW[@]}";do if [[ -e "$backup/$(basename "$f")-absent" || ( "$f" == src/mhc-integration.mjs && -e "$backup/bridge-absent" ) ]];then rm -f -- "$DEST/$f";elif [[ -f "$backup/$f" ]];then cp -p "$backup/$f" "$DEST/$f" 2>/dev/null || true;fi;done
  rm -rf -- "$staged";echo 'Update failed; source rollback attempted. Inspect Panel before restarting.' >&2
 }
 trap rollback_on_error ERR
 for f in "${FILES[@]}" "${NEW[@]}";do
  mkdir -p "$staged/$(dirname "$f")"
  cp "$SOURCE/$f" "$staged/$f"
  chmod 600 "$staged/$f"
 done
 for f in "${FILES[@]}" "${NEW[@]}";do mv -f -- "$staged/$f" "$DEST/$f";done
 rm -rf -- "$staged"
 trap - ERR
 echo "UPDATED original Panel source in $DEST"
 echo "ROLLBACK_ID=$stamp"
 echo 'Current process is unchanged until explicitly running: sv restart amh-panel'
 echo 'No other service is restarted; admin account and data retained.'
 exit 0
fi
if [[ "${1:-}" == rollback ]];then
 preflight
 id="${2:-}";[[ "$id" =~ ^[0-9]{8}-[0-9]{6}-[0-9]+$ ]] || fail 'Supply exact ROLLBACK_ID'
 backup="$BACKUPS/$id";[[ -d "$backup" && ! -L "$backup" ]] || fail 'Backup not found'
 for f in "${FILES[@]}";do [[ -f "$backup/$f" ]] || fail "Backup incomplete: $f";done
 read -r -p 'Type ROLLBACK_ORIGINAL_PANEL_LAB to proceed: ' YES
 [[ "$YES" == ROLLBACK_ORIGINAL_PANEL_LAB ]] || { echo Cancelled;exit 0; }
 for f in "${FILES[@]}";do cp -p "$backup/$f" "$DEST/$f";done
 for f in "${NEW[@]}";do if [[ -e "$backup/$(basename "$f")-absent" || ( "$f" == src/mhc-integration.mjs && -e "$backup/bridge-absent" ) ]];then rm -f -- "$DEST/$f";elif [[ -f "$backup/$f" ]];then cp -p "$backup/$f" "$DEST/$f";elif [[ "$f" == src/mhc-remote-access.mjs ]];then rm -f -- "$DEST/$f";else fail "Backup incomplete: $f";fi;done
 echo 'Restored saved Panel code. Explicitly restart only: sv restart amh-panel'
 exit 0
fi
echo 'Usage: ~/mhc-full hosting-panel plan|apply|rollback ROLLBACK_ID';exit 2
