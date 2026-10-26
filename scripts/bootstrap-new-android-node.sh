#!/data/data/com.termux/files/usr/bin/bash
# Fresh Android Termux only. No production or existing nodes.
set -Eeuo pipefail
umask 077
fail(){ echo "STOP: $*" >&2;exit 1; }
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || fail 'Standard Termux required'
[[ "$(uname -m)" == aarch64 ]] || fail 'MHC full hosting installer currently supports aarch64 only'
[[ "${1:-}" == --install && "$#" == 1 ]] || fail 'Usage: bash bootstrap-new-android-node.sh --install'
for p in "$HOME/.config/mhc-full-installer/installed" "$HOME/.config/mhc-full-installer/install-incomplete" \
 "$HOME/android-hosting-panel/src/server.mjs" "$HOME/apps/thophuongpro/.env" \
 "$HOME/.config/mini-hosting-cluster/node.json" "$HOME/.config/mini-hosting-cluster/ha.json";do
 [[ ! -e "$p" && ! -L "$p" ]] || fail "Existing MHC/hosting state: $p. Never install over an existing node"
done
command -v pkg >/dev/null || fail 'Termux package manager missing'
echo '[1/5] Preparing Termux packages + API CLI companion'
pkg update -y || fail 'No package mirror. Configure termux-change-repo; do not reset data'
pkg install -y git curl openssh termux-api coreutils || fail 'Termux package installation failed'
[[ -x "$PREFIX/bin/termux-battery-status" ]] || fail 'Termux:API CLI missing'
src="$HOME/.local/share/mhc-bootstrap/source"
[[ ! -e "$src" ]] || fail 'Partial bootstrap source exists; inspect before retry'
mkdir -p "$(dirname "$src")"
echo '[2/5] Fetching the canonical complete MHC source'
git clone --depth 1 --single-branch --branch codex/m1-m2-foundation \
 https://github.com/litequang/Mini-Hosting-Cluster.git "$src" || fail 'Git clone failed; inspect network'
[[ -f "$src/install.sh" && -f "$src/bin/node-monitor.mjs" &&
   -f "$src/bin/legacy-panel-src/src/mhc-remote-access.mjs" ]] || fail 'Partial source checkout'
echo '[3/5] Running supported original full installer, fresh node only'
bash "$src/install.sh" --plan
printf 'TEST_NEW_DEVICE_INSTALL\n' | bash "$src/install.sh" --install ||
 fail 'Full install failed: inspect install-incomplete; do not blindly reset/retry'
[[ -x "$HOME/mhc-full" ]] || fail 'MHC CLI missing after install'
echo '[4/5] Integrating original Panel 9090 and boot+service supervisor'
printf 'UPGRADE_ORIGINAL_PANEL_LAB\n' | "$HOME/mhc-full" hosting-panel apply ||
 fail 'Panel upgrade refused/failed: inspect its rollback'
export SVDIR="$PREFIX/var/service"
if [[ -f "$PREFIX/etc/profile.d/start-services.sh" ]];then
 . "$PREFIX/etc/profile.d/start-services.sh"
fi
for name in sshd mysqld nginx amh-panel;do
 if [[ -d "$PREFIX/var/service/$name" ]];then
  sv-enable "$name" || true
  sv up "$PREFIX/var/service/$name" || true
 fi
done
sv restart "$PREFIX/var/service/amh-panel" || fail 'Original Panel restart failed'
boot="$HOME/.termux/boot/10-start-hosting"
[[ -f "$boot" && ! -L "$boot" ]] || fail 'Boot script missing'
grep -Fq 'start-services.sh' "$boot" || fail 'Boot script missing runit supervisor'
grep -Fq 'termux-wake-lock' "$boot" || fail 'Boot script missing wake lock'
# Transition from the upstream bootstrap stub to the managed recovery script.
if [[ -f "$HOME/.local/share/mhc-full-installer/bin/node-boot.sh" &&
      -f "$HOME/.local/share/mhc-full-installer/bin/node-doctor.sh" ]];then
 bash "$HOME/.local/share/mhc-full-installer/bin/node-doctor.sh" --repair ||
 echo 'WARN: Android permissions/API may need manual attention; boot repair attempted'
else
 fail 'Installed MHC release missing integrated boot and doctor; refuse partial setup'
fi
if command -v termux-wake-lock >/dev/null;then
 termux-wake-lock >/dev/null 2>&1 || echo 'WARN: Wake lock not granted by Android'
fi
echo '[5/5] Checking local HTTP and Termux:API telemetry'
ok=0
for i in 1 2 3 4 5 6 7 8 9 10;do
 if [[ "$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/ 2>/dev/null||true)" == 200 ]];then ok=1;break;fi
 sleep 1
done
[[ "$ok" == 1 ]] || fail 'Panel :9090 HTTP failed; inspect amh-panel log'
api='unavailable'
if timeout 8 termux-battery-status 2>/dev/null | node -e \
 'let x="";process.stdin.on("data",d=>x+=d);process.stdin.on("end",()=>{try{const b=JSON.parse(x);process.exit(Number.isFinite(b.percentage)?0:1)}catch{process.exit(1)}})';then api=ok;fi
mkdir -p "$HOME/.local/state/mhc-node-setup"
chmod 700 "$HOME/.local/state/mhc-node-setup"
printf 'bootstrap_panel=ok\nbattery_api=%s\nnode_joined=no\n' "$api" > "$HOME/.local/state/mhc-node-setup/status"
chmod 600 "$HOME/.local/state/mhc-node-setup/status"
echo 'MHC_BOOTSTRAP_OK: original local Panel 9090 + services installed'
echo "Battery API: $api"
if [[ "$api" != ok ]];then
 echo 'ACTION_REQUIRED: Open Termux:API app; ensure Termux/Termux:API have matching install signatures; allow Android unrestricted battery.'
 echo 'ACTION_REQUIRED: Retry ~/mhc-full node-doctor after re-opening the API Android app.'
fi
echo 'ACTION_REQUIRED: Open Termux:Boot Android app ONCE, disable battery optimizations for Termux and API; disable STAMINA if present.'
echo 'ACTION_REQUIRED: Test screen-off for 15 minutes and reboot once to verify auto-start.'
echo 'Next: open protected Panel > Cluster > Tạo mã ghép 10 phút, then run the copied ~/mhc-full join code.'
echo 'No primary role, data restore, public Tunnel or website writer activated.'
