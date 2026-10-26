#!/data/data/com.termux/files/usr/bin/bash
# Controlled manual promotion; NEVER auto-connect Cloudflare on failure suspicion.
set -Eeuo pipefail
ROOT="$HOME/standby-sync"
[[ -f "$ROOT/.standby-installed" && -f "$ROOT/latest-applied" ]] || { echo 'No prepared standby snapshot';exit 1; }
[[ -L "$HOME/apps/thophuongpro" ]] || { echo 'Expected standby release symlink';exit 1; }
if sv status "$PREFIX/var/service/named-tunnel" 2>/dev/null | grep -q '^run:';then echo 'Named Tunnel already running';exit 1;fi
NAME="$(cat "$ROOT/latest-applied")"
TIMESTAMP="$(cat "$ROOT/last-applied-at" 2>/dev/null || echo unknown)"
echo "Last locally prepared snapshot: $NAME at $TIMESTAMP"
cat <<'WARN'
DO NOT PROMOTE WHILE PRIMARY M51 IS STILL SERVING USERS.
Before promotion: either shut down M51's named-tunnel or revoke/rotate its Tunnel token
in Cloudflare; do not allow concurrent writers.
IMPORTANT: Snapshot-based standby is NOT real-time: any writes after its timestamp
may be missing. Old and new MariaDB databases are not merged automatically.
WARN
read -r -p 'Type PRIMARY_FENCED to confirm the M51 cannot continue public writes: ' CONFIRM
[[ "$CONFIRM" == PRIMARY_FENCED ]] || { echo 'Cancelled';exit 1; }
sv-disable standby-sync
sv down "$PREFIX/var/service/standby-sync" || true
sv-enable mini-web
sv up "$PREFIX/var/service/mini-web"
OK=no
for i in $(seq 1 20);do
 CODE="$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null || true)"
 if [[ "$CODE" == 200 ]];then OK=yes;break;fi
 sleep 1
done
[[ "$OK" == yes ]] || { echo 'Local Node HTTP 200 not achieved. Tunnel remains OFF';exit 1; }
NGINX="$(curl -sS --max-time 4 -o /dev/null -w '%{http_code}' -H 'Host: pro.thophuong.com' http://127.0.0.1:8080/ 2>/dev/null || true)"
[[ "$NGINX" == 200 ]] || { echo 'Nginx health check failed; Tunnel remains OFF';exit 1; }
DB="$(node --env-file="$HOME/apps/thophuongpro/.env" -e 'process.stdout.write(process.env.MYSQL_DATABASE||"")')"
[[ "$DB" == thophuong_standby_a || "$DB" == thophuong_standby_b ]] || { echo 'Unexpected promoted DB name';exit 1; }
COUNT="$(mariadb --no-defaults -u root -N -s -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB'" | tr -d '[:space:]')"
[[ "$COUNT" =~ ^[0-9]+$ && "$COUNT" -ge 1 ]] || { echo 'DB missing; Tunnel remains OFF';exit 1; }
cat <<END
LOCAL HEALTH OK: Node=200, Nginx=200, DB=$DB tables=$COUNT.
Cloudflare Tunnel remains OFF by design.
NEXT: If the old M51 Tunnel is fully disconnected and Access is protected:
  bash ~/mini-hosting-dr-v1/bin/activate-tunnel.sh
If the original M51 was lost or compromised, ROTATE Cloudflare Tunnel token first.
END
