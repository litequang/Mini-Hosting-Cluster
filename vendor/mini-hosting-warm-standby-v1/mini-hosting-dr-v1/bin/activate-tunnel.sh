#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Termux only';exit 1; }
[[ -f "$HOME/recovery-input/RECOVERED.txt" ]] || { echo 'Restore has not passed all local HTTP checks';exit 1; }
[[ -s "$HOME/.cloudflared/thophuong.token" ]] || { echo 'Missing Named Tunnel token';exit 1; }
for name in mini-web nginx amh-panel;do sv status "$PREFIX/var/service/$name" | grep -q '^run:' || { echo "Service not running: $name";exit 1;};done
cat <<'WARN'
IMPORTANT BEFORE ACTIVATING:
1. Ensure original M51 Tunnel connector is offline; do not run same Named Tunnel on two devices.
2. Ensure Cloudflare Access protects panel.thophuong.com, including JWT validation and Only Owner policy.
3. If M51 was lost/stolen/compromised, ROTATE the tunnel token in Cloudflare first and replace ~/.cloudflared/thophuong.token.
4. Check Cloudflare hostname routes: pro.thophuong.com -> http://127.0.0.1:8080; panel.thophuong.com -> http://127.0.0.1:9090 (Access protected).
WARN
read -r -p 'Type ACTIVATE to allow this replacement to connect to Cloudflare: ' ANSWER
[[ "$ANSWER" == ACTIVATE ]] || { echo 'Cancelled';exit 1; }
sv-enable named-tunnel
sv up "$PREFIX/var/service/named-tunnel"
sv status "$PREFIX/var/service/named-tunnel"
echo 'Now check both domains from an independent browser and verify Cloudflare Access prompts before Panel login.'
