#!/data/data/com.termux/files/usr/bin/bash
# Existing LAB node: single source/UI/agent/boot update with file backup.
set -Eeuo pipefail;umask 077
fail(){ echo "STOP: $*" >&2;exit 1; }
[[ "$PREFIX" == /data/data/com.termux/files/usr && "$1" == --apply ]] || fail 'Termux --apply only'
mark="$HOME/.config/mhc-full-installer/installed"
[[ -f "$mark" && ! -e "$HOME/.config/mhc-full-installer/install-incomplete" ]] || fail 'MHC not fully installed'
grep -Fq 'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux' "$mark" || fail 'Unknown LAB version'
[[ ! -e "$HOME/apps/thophuongpro/.env" && ! -e "$HOME/.config/mini-hosting-cluster/ha.json" ]] || fail 'Existing production/HA configuration; no automatic overwrite'
base="$HOME/.local/share/mhc-full-installer/bin"
panel="$HOME/android-hosting-panel"
[[ -f "$panel/data/admin.json" && -f "$panel/src/server.mjs" ]] || fail 'Original Panel missing'
grep -Fq "crypto.verify('RSA-SHA256'" "$panel/src/mhc-remote-access.mjs" || fail 'JWT verification module differs'
[[ "$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/ 2>/dev/null||true)" == 200 ]] || fail 'Panel must be healthy before update'
mkdir -p "$HOME/.cache"
tmp="$(mktemp -d "$HOME/.cache/mhc-release.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
pin='7ea74bcc6dd519bac97cb2e4eb45d8d3570f51ed'
origin="https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/$pin"
# Each manifest line: relative source path | installed destination | immutable Git blob SHA1.
manifest="$tmp/manifest"
cat > "$manifest" <<'MANIFEST'
bin/cluster-authority.mjs|BIN/cluster-authority.mjs|8718e954a02f0cc6a94646db9a8da965c1854cf8
bin/node-monitor.mjs|BIN/node-monitor.mjs|e79689cfd868d35c4bc09ea3cea3d7ef57593636
bin/node-boot.sh|BIN/node-boot.sh|de0f6a0f5f281f257fe38fc72b7ab2b528010fa4
bin/node-doctor.sh|BIN/node-doctor.sh|9243c997e228368b551d87ab6518ebd0c2c269a9
bin/mhc-full-wrapper|HOME/mhc-full|3343a9d3646dbab3c16a370eef0014aeefa435c5
bin/legacy-panel-src/src/mhc-integration.mjs|PANEL/src/mhc-integration.mjs|33814da26919d26a7804d689b3f1123f2d6b92d1
bin/legacy-panel-src/src/server.mjs|PANEL/src/server.mjs|9cb48323d7ed1767e3d35219e047c70190c05c18
bin/legacy-panel-src/public/app.js|PANEL/public/app.js|bdf48f3575434a29237a99a29dbf22774bfe2d61
bin/legacy-panel-src/public/style.css|PANEL/public/style.css|dfff9b1af2446dc36d4cdbf4ba67f7ca7c8d8dbe
bin/legacy-panel-src/src/mhc-integration.mjs|SOURCE/src/mhc-integration.mjs|33814da26919d26a7804d689b3f1123f2d6b92d1
bin/legacy-panel-src/src/server.mjs|SOURCE/src/server.mjs|9cb48323d7ed1767e3d35219e047c70190c05c18
bin/legacy-panel-src/public/app.js|SOURCE/public/app.js|bdf48f3575434a29237a99a29dbf22774bfe2d61
bin/legacy-panel-src/public/style.css|SOURCE/public/style.css|dfff9b1af2446dc36d4cdbf4ba67f7ca7c8d8dbe
MANIFEST
i=0
while IFS='|' read -r path to sha;do
 case "$to" in BIN/*)dst="$base/$(basename "$to")";;HOME/*)dst="$HOME/$(basename "$to")";;PANEL/*)dst="$panel/$(echo "$to"|cut -d/ -f2-)";;SOURCE/*)dst="$base/legacy-panel-src/$(echo "$to"|cut -d/ -f2-)";;*)fail 'Invalid manifest destination';;esac
 [[ ! -L "$dst" && ! -L "$(dirname "$dst")" ]] || fail "Symlink destination: $to"
 curl -fLsS --retry 2 --connect-timeout 8 --max-time 45 "$origin/$path" -o "$tmp/$i" || fail "Download failed: $path"
 [[ "$(git hash-object "$tmp/$i")" == "$sha" ]] || fail "Wrong source SHA: $path"
 case "$path" in *.mjs)node --check --input-type=module < "$tmp/$i" || fail "Bad ESM syntax: $path";;*/app.js)node --check < "$tmp/$i" || fail "Bad JavaScript: $path";;*.sh|*/mhc-full-wrapper)bash -n "$tmp/$i" || fail "Bad shell: $path";;esac
 i=$((i+1))
done < "$manifest"
grep -Fq 'MHC_MONITOR_EXPANDED_ALL_NODES_V3' "$tmp/7" || fail 'Monitor release mismatch'
grep -Fq "from './mhc-remote-access.mjs'" "$tmp/6" || fail 'Missing Cloudflare Access gate'
grep -Fq '.mhc-all-nodes' "$tmp/8" || fail 'Monitor style mismatch'
root="$HOME/.local/state/mhc-upgrade-backups";mkdir -p "$root";chmod 700 "$root"
backup="$root/$(date +%Y%m%d-%H%M%S)-$$";mkdir -m 700 "$backup"
i=0
while IFS='|' read -r path to sha;do
 case "$to" in BIN/*)dst="$base/$(basename "$to")";;HOME/*)dst="$HOME/$(basename "$to")";;PANEL/*)dst="$panel/$(echo "$to"|cut -d/ -f2-)";;SOURCE/*)dst="$base/legacy-panel-src/$(echo "$to"|cut -d/ -f2-)";;esac
 echo "$dst" >> "$backup/paths"
 if [[ -f "$dst" ]];then cp -p "$dst" "$backup/$i";else touch "$backup/$i.absent";fi
 i=$((i+1))
done < "$manifest"
restore(){
 echo 'ROLLBACK: Restoring previous source' >&2
 i=0
 while IFS= read -r dst;do
  if [[ -f "$backup/$i.absent" ]];then rm -f "$dst";else cp -p "$backup/$i" "$dst";fi
  i=$((i+1))
 done < "$backup/paths"
 sv restart "$PREFIX/var/service/amh-panel" >/dev/null 2>&1 || true
 echo "RESTORE_BACKUP=$backup" >&2
}
rollback_needed=yes
trap 'exit_code=$?; trap - EXIT; if [[ "$rollback_needed" == yes ]];then restore || true;fi; rm -rf -- "$tmp";exit "$exit_code"' EXIT
i=0
while IFS= read -r dst;do
 stage="$(dirname "$dst")/.mhc-release-$$-$i"
 cp "$tmp/$i" "$stage"
 case "$dst" in *.mjs|*/app.js|*/style.css)chmod 600 "$stage";;*)chmod 700 "$stage";;esac
 mv -f "$stage" "$dst"
 i=$((i+1))
done < "$backup/paths"
export SVDIR="$PREFIX/var/service"
[[ -f "$PREFIX/etc/profile.d/start-services.sh" ]] && . "$PREFIX/etc/profile.d/start-services.sh"
if [[ -f "$HOME/.config/mhc-full-installer/authority.json" && ! -f "$SVDIR/mhc-authority-agent/run" ]];then
 node "$base/cluster-authority.mjs" service-install --confirm=INSTALL_LAB_AUTHORITY_AGENT
fi
sv-enable amh-panel || true
sv up "$SVDIR/amh-panel" || true
sv restart "$SVDIR/amh-panel"
if [[ -f "$HOME/.config/mhc-full-installer/authority.json" && -f "$SVDIR/mhc-authority-agent/run" ]];then
 sv-enable mhc-authority-agent || true
 sv up "$SVDIR/mhc-authority-agent" || true
 sv restart "$SVDIR/mhc-authority-agent" || true
fi
healthy=no
for j in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15;do
 sleep 1
 served="$(curl -fsS --max-time 4 http://127.0.0.1:9090/app.js 2>/dev/null|git hash-object --stdin || true)"
 if [[ "$served" == 'bdf48f3575434a29237a99a29dbf22774bfe2d61' ]];then healthy=yes;break;fi
done
[[ "$healthy" == yes ]] || fail 'Panel HTTP asset check failed'
rollback_needed=no
bash "$base/node-doctor.sh" --repair || echo 'WARN: Android permissions/manual battery setting need attention'
echo 'APPLIED_OK: full Panel Monitor + agent + boot updated safely'
echo "BACKUP=$backup"
echo 'No database, web assets, tunnel credentials or Primary were modified.'
