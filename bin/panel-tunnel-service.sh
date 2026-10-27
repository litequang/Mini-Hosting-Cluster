#!/data/data/com.termux/files/usr/bin/bash
# Dedicated management connector; never replace named-tunnel or hosting services.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'STOP: Termux LAB required'; exit 1; }
cfg="$HOME/.config/mhc-full-installer"
service="$PREFIX/var/service/mhc-panel-tunnel"
token="$cfg/cloudflare-lab/tunnel-token"
logs="$HOME/.local/state/mhc-panel-tunnel"
fail(){ echo "STOP: $*" >&2; exit 1; }
for file in "$HOME/apps/thophuongpro/.env" "$HOME/.config/mini-hosting-cluster/ha.json" "$HOME/.config/mini-hosting-cluster/node.json"; do
 [[ ! -e "$file" ]] || fail 'Production footprint'
done
[[ -f "$cfg/installed" && ! -L "$cfg" && ! -e "$cfg/install-incomplete" ]] || fail 'Completed LAB install required'
[[ "$(cat "$cfg/installed")" == 'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux' ]] || fail 'Upgrade TEST source first'
if [[ "${1:-}" == status ]];then
 sv status "$service"
 exit 0
fi
[[ "$#" == 2 && "$1" == install && "$2" == --confirm=INSTALL_LAB_PANEL_TUNNEL ]] || fail 'Usage: panel-tunnel-service.sh status | install --confirm=INSTALL_LAB_PANEL_TUNNEL'
[[ -f "$token" && ! -L "$token" && ! -L "$(dirname "$token")" && "$(stat -c %a "$token")" == 600 && "$(stat -c %a "$(dirname "$token")")" == 700 ]] || fail 'Private Tunnel token required'
node - "$HOME/android-hosting-panel/data/remote-access.json" <<'JS'
const fs=require('node:fs'),file=process.argv[2],st=fs.lstatSync(file);
if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw Error('Private origin Access config required');
const c=JSON.parse(fs.readFileSync(file,'utf8'));
if(c.schema!==1||!['panel.giaouoc.com','panel-lab.giaouoc.com'].includes(c.hostname)||!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(c.teamDomain)||!/^[A-Za-z0-9_-]{32,128}$/.test(c.audience))throw Error('Configure giaouoc Panel Access first');
JS
help="$(cloudflared tunnel run --help)"
[[ "$help" == *--token-file* ]] || fail 'cloudflared token-file support required'
[[ ! -e "$service" && ! -L "$service" ]] || fail 'Service exists; inspect status without replacing it'
[[ ! -L "$logs" ]] || fail 'Unsafe log directory'
mkdir -p -m 700 "$logs"
[[ "$(stat -c %a "$logs")" == 700 ]] || fail 'Private log directory required'
printf 's1048576\nn3\n' > "$logs/config"
stage="$(mktemp -d "$PREFIX/var/mhc-panel-tunnel.XXXXXXXX")"
mkdir -m 700 "$stage/log"
cat > "$stage/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
exec 2>&1
exec /data/data/com.termux/files/usr/bin/cloudflared tunnel --no-autoupdate run --token-file "$HOME/.config/mhc-full-installer/cloudflare-lab/tunnel-token"
RUN
cat > "$stage/log/run" <<'LOG'
#!/data/data/com.termux/files/usr/bin/sh
exec /data/data/com.termux/files/usr/bin/svlogd -tt "$HOME/.local/state/mhc-panel-tunnel"
LOG
chmod 700 "$stage/run" "$stage/log/run"
mv -T -n "$stage" "$service"
[[ ! -d "$stage" ]] || fail 'Concurrent install; inspect staged directory'
echo 'Installed mhc-panel-tunnel with private token-file and rotating logs. Check connector health before publishing route.'
