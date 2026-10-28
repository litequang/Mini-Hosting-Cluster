#!/data/data/com.termux/files/usr/bin/bash
# Build-new-node-release embeds the immutable source and complete SHA-256 manifest above this body.
set -Eeuo pipefail
umask 077
fail(){ printf 'STOP: %s\n' "$1" >&2; exit 1; }
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr && "$(uname -m)" == aarch64 ]] || fail N1_STANDARD_ARM64_TERMUX_REQUIRED
[[ "${1:-}" == --install && "$#" == 1 ]] || fail 'Usage: pinned-bootstrap.sh --install'
[[ "${N1_RELEASE_SOURCE:-}" =~ ^[a-f0-9]{40}$ && "${N1_MANIFEST_SHA:-}" =~ ^[a-f0-9]{64}$ && -n "${N1_MANIFEST_BASE64:-}" ]] || fail N1_USE_PUBLISHED_PINNED_BOOTSTRAP
state="$HOME/.local/state/mhc-new-node-install"
for p in "$HOME/.local" "$HOME/.local/state" "$state";do [[ ! -L "$p" ]] || fail N1_SYMLINK_REFUSED;done
[[ ! -e "$HOME/apps/thophuongpro/.env" && ! -e "$HOME/.config/mini-hosting-cluster/node.json" && ! -e "$HOME/.config/mini-hosting-cluster/ha.json" ]] || fail N1_PRODUCTION_OR_LEGACY_CLUSTER_REFUSED
if [[ ! -f "$state/progress.json" ]];then
 for p in .config/mhc-full-installer .local/share/mhc-full-installer android-hosting-panel apps .config/mini-hosting-cluster .local/share/mini-hosting-cluster .nginx .cloudflared;do
  [[ ! -e "$HOME/$p" && ! -L "$HOME/$p" ]] || fail N1_EXISTING_INSTALLATION_REFUSED
 done
 if [[ -d "$HOME/.termux/boot" ]] && [[ -n "$(find "$HOME/.termux/boot" -mindepth 1 -maxdepth 1 -print -quit)" ]];then fail N1_EXISTING_BOOT_REFUSED;fi
fi
command -v pkg >/dev/null || fail N1_TERMUX_PACKAGE_MANAGER_MISSING
mkdir -p "$state"; chmod 700 "$state"
printf '[N1] Preparing bootstrap dependencies; existing SSH keys remain intact\n'
need_packages=0
for cmd in node git curl sha256sum flock;do command -v "$cmd" >/dev/null || need_packages=1;done
if [[ "$need_packages" == 1 ]];then
 pkg update -y || fail N1_PACKAGE_INDEX_FAILED_RETRY_SAME_COMMAND
 pkg install -y nodejs git curl coreutils util-linux || fail N1_BOOTSTRAP_PACKAGES_FAILED_RETRY_SAME_COMMAND
fi
manifest="$state/release-$N1_RELEASE_SOURCE.json"
printf '%s' "$N1_MANIFEST_BASE64" | base64 -d > "$manifest.tmp"
printf '%s  %s\n' "$N1_MANIFEST_SHA" "$manifest.tmp" | sha256sum -c --status || fail N1_MANIFEST_CHECKSUM_FAILED
if [[ -e "$manifest" ]];then cmp -s "$manifest.tmp" "$manifest" || fail N1_EXISTING_MANIFEST_DIFFERS;fi
mv "$manifest.tmp" "$manifest";chmod 600 "$manifest"
source_dir="$state/source-$N1_RELEASE_SOURCE"
[[ ! -L "$source_dir" && ! -L "$source_dir/.git" ]] || fail N1_SYMLINK_REFUSED
if [[ ! -d "$source_dir/.git" ]];then
 [[ ! -e "$source_dir" || -z "$(find "$source_dir" -mindepth 1 -maxdepth 1 -print -quit)" ]] || fail N1_ACQUISITION_DIRECTORY_UNKNOWN
 git init -q "$source_dir"
 git -C "$source_dir" remote add origin https://github.com/litequang/Mini-Hosting-Cluster.git
fi
[[ "$(git -C "$source_dir" remote get-url origin)" == https://github.com/litequang/Mini-Hosting-Cluster.git ]] || fail N1_SOURCE_ORIGIN_CHANGED
if ! git -C "$source_dir" cat-file -e "$N1_RELEASE_SOURCE^{commit}" 2>/dev/null;then git -C "$source_dir" fetch --depth 1 origin "$N1_RELEASE_SOURCE" || fail N1_FETCH_FAILED_RETRY_SAME_COMMAND;fi
git -C "$source_dir" -c advice.detachedHead=false checkout --detach "$N1_RELEASE_SOURCE" || fail N1_SOURCE_CHECKOUT_FAILED
[[ "$(git -C "$source_dir" rev-parse HEAD)" == "$N1_RELEASE_SOURCE" ]] || fail N1_SOURCE_COMMIT_MISMATCH
# Validate every source file before executing any repository JavaScript.
node - "$manifest" "$source_dir" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const [file,root]=process.argv.slice(2),m=JSON.parse(fs.readFileSync(file));
if(m.format!=='mhc-new-node-v1'||!Array.isArray(m.files)||m.files.length>2000)throw Error('N1_RELEASE_INVALID');
for(const f of m.files){if(!/^[A-Za-z0-9_./-]+$/.test(f.path)||f.path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('N1_MANIFEST_PATH_INVALID');const full=path.join(root,f.path);let p=full;while(p!==path.dirname(root)){if(fs.lstatSync(p).isSymbolicLink())throw Error('N1_SYMLINK_REFUSED');p=path.dirname(p);}if(crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')!==f.sha256)throw Error('N1_SOURCE_CHECKSUM_FAILED');}
NODE
export SVDIR="$PREFIX/var/service"
flock --nonblock --close "$state/install.lock" "$PREFIX/bin/node" "$source_dir/bin/new-node-install.mjs" --install "$manifest" "$N1_MANIFEST_SHA" || fail N1_INSTALL_INTERRUPTED_RETRY_SAME_COMMAND
printf '\nN1_INSTALL_COMPLETE: local Panel http://127.0.0.1:9090; Standby, no writer or public route.\n'
printf 'Panel admin password is stored locally: ~/.config/mhc-full-installer/panel-login-once (do not send to chat).\n'
printf 'Open Termux:Boot once and allow unrestricted battery for Termux/Boot/API. Reboot/Doze still require verification.\n'
printf 'Next: create a 10-minute pairing code in an existing Panel; pairing and site eligibility are separate steps.\n'
