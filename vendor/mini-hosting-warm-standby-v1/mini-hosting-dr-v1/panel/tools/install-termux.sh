#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
if [ "${PREFIX:-}" != '/data/data/com.termux/files/usr' ]; then echo 'ERROR: run inside Termux on Samsung M51'; exit 1; fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$HOME/android-hosting-panel"
mkdir -p "$DEST" "$DEST/data" "$PREFIX/var/service/amh-panel/log"
for item in package.json src public tools docs; do
  if [ "$HERE" != "$DEST" ]; then cp -R "$HERE/$item" "$DEST/"; fi
done
chmod 700 "$DEST/data"
cd "$DEST"
if [ ! -e "$DEST/data/admin.json" ]; then
  echo '--- Create an admin password ---'
  node tools/setup.mjs
else
  echo 'Existing admin password preserved.'
fi
cat > "$PREFIX/var/service/amh-panel/run" <<RUN
#!/data/data/com.termux/files/usr/bin/sh
cd $DEST
exec $PREFIX/bin/node src/server.mjs 2>&1
RUN
chmod 700 "$PREFIX/var/service/amh-panel/run"
ln -sf "$PREFIX/share/termux-services/svlogger" "$PREFIX/var/service/amh-panel/log/run"
. "$PREFIX/etc/profile.d/start-services.sh"
sv-enable amh-panel || true
sv up amh-panel || true
sleep 2
sv status amh-panel || true
echo
echo 'Access ONLY via Windows SSH forwarding:'
echo '  ssh -N -L 9090:127.0.0.1:9090 -p 8022 TERMUX_USER@M51_IP'
echo 'Then open http://127.0.0.1:9090 in PC browser.'
echo 'Do not publish port 9090 as a Cloudflare route.'
