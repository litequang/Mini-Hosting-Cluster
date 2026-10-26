#!/usr/bin/env bash
# MHC TEST 0.5.0C-REMOTE-PANEL — fresh Termux or source-only upgrade on isolated TEST 0.3. Safe to run --plan without installing packages.
set -Eeuo pipefail;umask 077
ROOT="$(cd "$(dirname "$0")" && pwd)"; MARK="$HOME/.config/mhc-full-installer"
fail(){ echo "ERROR: $*" >&2;exit 1; }
plan(){
  echo 'MHC Full Installer TEST 0.5.0C-REMOTE-PANEL; no live failover, public tunnel, or production DB restore.'
  echo "Termux PREFIX: ${PREFIX:-unknown}; CPU: $(uname -m); device: $(getprop ro.product.model 2>/dev/null || echo unknown)"
  echo "Home: $HOME"
  df -h "$HOME" 2>/dev/null | tail -1 || true
  for path in "$HOME/apps/thophuongpro/.env" "$HOME/.config/mini-hosting-cluster/node.json" "$HOME/android-hosting-panel/src/server.mjs" "$MARK/installed" "$MARK/install-incomplete";do
    if [[ -e "$path" ]];then echo "STOP flag: $path";fi
  done
  echo 'No changes made. Requirements: CLEAN aarch64 Termux, >=3GiB free, Internet, interactive admin setup.'
  echo 'Will install Termux packages, localhost-only baseline services and inactive HA code; not expose WAN.'
}
upgrade(){
  [[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || fail 'Standard Termux required'
  [[ "$(uname -m)" == aarch64 ]] || fail 'aarch64 TEST device only'
  [[ -f "$MARK/installed" && ! -e "$MARK/install-incomplete" ]] || fail 'Known completed TEST 0.3 installation required'
  [[ ! -e "$HOME/apps/thophuongpro/.env" ]] || fail 'Detected TPP .env; do not upgrade a possibly production server'
  [[ ! -d "$HOME/hosting-backups/mhc-full/.backup-lock" ]] || fail 'Backup in progress'
  [[ ! -e "$HOME/.config/mini-hosting-cluster/ha.json" ]] || fail 'HA configuration present; source-only upgrade not approved for HA nodes'
  grep -Eq '^(TEST 0\.3(\.[1-9]|\.9\.[12]|\.10|\.11)|TEST 0\.4\.0(A|B1|B2|B3|B4|C1|C2|C3|D)|TEST 0\.5\.0(A|B|B2|B3|B4|B5|C-LAB|C-INTEGRATION|C-PHYSICAL|C-FIELD|C-DRILL|C-FENCE-PROBE|C-WRITER-AUDIT|C-MANUAL-PRIMARY|C-AUTO-PRIMARY-LAB|C-ROUTE-RECOVERY|C-REMOTE-PANEL)) installed on clean Termux$' "$MARK/installed" || fail 'Unrecognized prior installer marker/version'
  [[ -d "$HOME/.local/share/mhc-full-installer/bin" && -f "$HOME/mhc-full" ]] || fail 'Prior MHC Full installation incomplete'
  echo 'Upgrade managed scripts and launcher only; Python 3 dependency may be added via pkg (NO DB, websites, runtime services, .env, Cloudflare or HA changes).'
  echo 'Python 3 is required for safe ZIP deployment and tar extraction; it will be installed if absent.'
  read -r -p 'Type TEST_SOURCE_ONLY_UPGRADE to continue: ' YES
  [[ "$YES" == TEST_SOURCE_ONLY_UPGRADE ]] || { echo 'Cancelled'; return 0; }
  if ! command -v python3 >/dev/null;then
    pkg install -y python || fail 'Python installation failed; installed MHC scripts unchanged'
  fi
  bash "$ROOT/bin/self-test.sh" || fail 'New source self-tests failed; no MHC scripts changed'
  local base="$HOME/.local/share/mhc-full-installer" stamp staging backup
  stamp="$(date +%Y%m%d-%H%M%S)-$$"
  mkdir -p "$base/rollback"
  staging="$(mktemp -d "$base/.upgrade-XXXXXXXX")"
  mkdir "$staging/bin"
  cp "$ROOT/bin/"*.sh "$ROOT/bin/"*.py "$ROOT/bin/"*.php "$ROOT/bin/"*.mjs "$staging/bin/"
  chmod 700 "$staging/bin/"*.sh "$staging/bin/"*.py "$staging/bin/"*.php "$staging/bin/"*.mjs
  cp -a "$ROOT/bin/legacy-panel-src" "$staging/bin/legacy-panel-src"
  bash -n "$ROOT/bin/mhc-full-wrapper" || fail 'Invalid new launcher'
  backup="$base/rollback/$stamp"
  mkdir -m 700 "$backup"
  cp -p "$HOME/mhc-full" "$backup/mhc-full"
  cp -p "$MARK/installed" "$backup/installed"
  mv "$base/bin" "$backup/bin" || fail 'Failed to preserve previous managed code'
  if ! mv "$staging/bin" "$base/bin";then
    mv "$backup/bin" "$base/bin" || echo 'CRITICAL: rollback code manually' >&2
    fail 'Failed to activate new code'
  fi
  if ! cp "$ROOT/bin/mhc-full-wrapper" "$staging/mhc-full" || ! chmod 700 "$staging/mhc-full" || ! mv "$staging/mhc-full" "$HOME/mhc-full";then
    mv "$base/bin" "$staging/bin" 2>/dev/null || true
    mv "$backup/bin" "$base/bin" || echo 'CRITICAL: restore old code manually' >&2
    cp -p "$backup/mhc-full" "$HOME/mhc-full" || true
    fail 'Launcher install failed; rollback attempted'
  fi
  printf '%s\n' 'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux' > "$MARK/installed"
  rm -rf -- "$staging"
  echo "Code upgraded safely (TEST only). Local rollback copy: $backup"
  echo 'Runtime not restarted, Nginx and PHP configs left unchanged. New features require explicit configuration.'
}
if [[ "${1:-}" == --recover-lab-plan ]];then exec bash "$ROOT/bin/lab-recover.sh" --plan;fi
if [[ "${1:-}" == --recover-lab ]];then exec bash "$ROOT/bin/lab-recover.sh" --complete;fi
if [[ "${1:-}" == --upgrade ]];then upgrade;exit 0;fi
[[ "${1:---install}" != --plan ]] || { plan; exit 0; }
if [[ "${1:---install}" == --self-test ]];then exec bash "$ROOT/bin/self-test.sh";fi
[[ "${1:---install}" == --install ]] || fail 'Usage: bash install.sh --plan|--self-test|--install|--upgrade|--recover-lab-plan|--recover-lab'
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || fail 'Standard Android Termux required'
[[ "$(uname -m)" == aarch64 ]] || fail 'Only aarch64 in clean TEST device scope'
[[ ! -e "$MARK/installed" && ! -e "$MARK/install-incomplete" ]] || fail 'Installed/partial attempt found. Inspect manually. No blind resume.'
[[ ! -e "$HOME/apps/thophuongpro/.env" && ! -e "$HOME/.config/mini-hosting-cluster/node.json" && ! -e "$HOME/android-hosting-panel/src/server.mjs" ]] || fail 'Existing hosting or cluster detected; do NOT run on M51/X7b'
FREE="$(df -Pk "$HOME" | awk 'END {print $4}')"
[[ "$FREE" =~ ^[0-9]+$ ]] && (( FREE >= 3145728 )) || fail 'Need >= 3 GiB free'
plan
read -r -p 'Type TEST_NEW_DEVICE_INSTALL to proceed: ' YES
[[ "$YES" == TEST_NEW_DEVICE_INSTALL ]] || { echo 'Cancelled';exit 0; }
mkdir -p "$MARK";chmod 700 "$MARK"
# Sticky partial marker is deliberate: older upstream installers are non-transactional.
printf '%s\n' "$(date -Iseconds) clean install attempted" > "$MARK/install-incomplete"
pkg update -y
pkg install -y nodejs nginx mariadb openssh termux-services cloudflared git unzip tar gzip curl openssl-tool rsync coreutils python php php-fpm || fail 'Core Termux packages unavailable; inspect repositories and partial state'
for package in php-gd php-intl php-xml php-zip php-curl php-mbstring;do
  pkg install -y "$package" >/dev/null 2>&1 || echo "Optional package $package not present; check PHP built-in extensions with doctor"
done
for cmd in node nginx mariadb mariadb-dump php php-fpm curl sha256sum python3;do command -v "$cmd" >/dev/null || fail "Missing required binary $cmd";done
# Upstream DR installer owns baseline services and requires new Termux install.
bash "$ROOT/vendor/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/bin/install-new-phone.sh"
bash "$ROOT/vendor/mini-hosting-warm-standby-v1/mini-hosting-cluster-v0.1/bin/install.sh"
DEST="$HOME/.local/share/mhc-full-installer";mkdir -p "$DEST/bin"
cp "$ROOT/bin/"*.sh "$ROOT/bin/"*.py "$ROOT/bin/"*.php "$ROOT/bin/"*.mjs "$DEST/bin/";chmod 700 "$DEST/bin/"*.sh "$DEST/bin/"*.py "$DEST/bin/"*.php "$DEST/bin/"*.mjs
cp -a "$ROOT/bin/legacy-panel-src" "$DEST/bin/legacy-panel-src"
cp "$ROOT/bin/mhc-full-wrapper" "$HOME/mhc-full"
chmod 700 "$HOME/mhc-full"
printf '%s\n' 'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux' > "$MARK/installed"
rm -f -- "$MARK/install-incomplete"
echo 'Source installed. HA NOT armed. WordPress/Cloudflare public exposure NOT configured.'
echo 'Next: ~/mhc-full doctor; ~/mhc-full sites create-static demo; or install verified WP-CLI for wordpress; serve configure-static demo localhost; serve check/start/probe-static.'
