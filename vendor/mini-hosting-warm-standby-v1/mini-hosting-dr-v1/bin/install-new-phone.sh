#!/data/data/com.termux/files/usr/bin/bash
# Bootstrap in a CLEAN modern Termux installation. No existing Termux data is overwritten.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == '/data/data/com.termux/files/usr' ]] || { echo 'ERROR: Run inside standard Termux (F-Droid)';exit 1; }
if [[ -e "$HOME/apps/thophuongpro/.env" || -e "$HOME/android-hosting-panel/src/server.mjs" ]];then
 echo 'STOP: this phone already contains a hosting installation. Refusing to overwrite.';exit 1
fi
ARCH="$(uname -m)"
if [[ "$ARCH" != 'aarch64' ]];then echo "Unsupported/untested CPU architecture $ARCH (package intended for 64-bit Android aarch64)";exit 1;fi
BASE="$(cd "$(dirname "$0")/.." && pwd)"
echo '[1/6] Installing Termux packages (requires Internet)'
pkg update -y
pkg install -y nodejs nginx mariadb openssh termux-services cloudflared git unzip tar gzip curl openssl-tool
for cmd in node mariadb mariadb-dump nginx sshd cloudflared sv svlogd;do command -v "$cmd" >/dev/null || { echo "Missing dependency: $cmd";exit 1;};done
[[ -d "$PREFIX/var/lib/mysql/mysql" ]] || { echo 'ERROR: MariaDB data directory not initialized by package; check package installation';exit 1; }
# Standard Termux service manager.
if [[ -f "$PREFIX/etc/profile.d/start-services.sh" ]];then . "$PREFIX/etc/profile.d/start-services.sh";fi
mkdir -p "$HOME/.termux/boot" "$HOME/.nginx" "$HOME/apps" "$HOME/.cloudflared"
cat > "$HOME/.termux/boot/10-start-hosting" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/sh
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
. /data/data/com.termux/files/usr/etc/profile.d/start-services.sh
BOOT
chmod 700 "$HOME/.termux/boot/10-start-hosting"
echo '[2/6] Installing portable Panel v1.3.1 (local-only until Access setup)'
mkdir -p "$HOME/android-hosting-panel"
cp -a "$BASE/panel/." "$HOME/android-hosting-panel/"
mkdir -p "$HOME/android-hosting-panel/data";chmod 700 "$HOME/android-hosting-panel/data"
(cd "$HOME/android-hosting-panel" && node tools/setup.mjs)
# SSH and MariaDB services are normally pre-created by Termux packages.
for svc in sshd mysqld;do
 if [[ ! -f "$PREFIX/var/service/$svc/run" ]];then echo "ERROR: missing Termux service $svc (reopen Termux after pkg install)";exit 1;fi
 sv-enable "$svc" || true
 sv up "$PREFIX/var/service/$svc" || true
done
# Create service directory with one safe run+logger; disabled by default for public services.
make_service(){
 local name="$1" command_line="$2" enabled="$3" dir="$PREFIX/var/service/$1"
 if [[ -f "$dir/run" ]];then
  if [[ "$name" != "nginx" ]];then echo "ERROR: service $name already installed; refusing overwrite";exit 1;fi
  sv down "$dir" >/dev/null 2>&1 || true
  cp "$dir/run" "$dir/run.before-dr-kit"
 fi
 mkdir -p "$dir/log" "$PREFIX/var/log/sv/$name"
 if [[ "$enabled" != yes ]];then touch "$dir/down";fi
 printf '#!/data/data/com.termux/files/usr/bin/sh\n%s\n' "$command_line" > "$dir/run"
 if [[ ! -e "$dir/log/run" ]];then
  cat > "$dir/log/run" <<LOG
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$PREFIX/var/log/sv/$name"
LOG
  chmod 700 "$dir/log/run"
 fi
 chmod 700 "$dir/run"
}
echo '[3/6] Configuring Nginx localhost:8080 → Node 3000'
cat > "$HOME/.nginx/nginx.conf" <<NGINX
worker_processes 1;
error_log $PREFIX/var/log/nginx-dr-error.log;
pid $PREFIX/var/run/nginx-dr.pid;
events { worker_connections 1024; }
http {
 include $PREFIX/etc/nginx/mime.types;
 default_type application/octet-stream;
 sendfile on;
 client_max_body_size 32m;
 server {
  listen 127.0.0.1:8080;
  server_name pro.thophuong.com;
  location / {
   proxy_pass http://127.0.0.1:3000;
   proxy_http_version 1.1;
   proxy_set_header Host \$host;
   proxy_set_header X-Real-IP \$remote_addr;
   proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto https;
   proxy_set_header Upgrade \$http_upgrade;
   proxy_set_header Connection 'upgrade';
  }
 }
}
NGINX
nginx -t -c "$HOME/.nginx/nginx.conf"
make_service nginx "exec $PREFIX/bin/nginx -c $HOME/.nginx/nginx.conf -g 'daemon off;' 2>&1" yes
make_service mini-web "cd $HOME/apps/thophuongpro || exit 1\nexec $PREFIX/bin/node --env-file=.env dist/server.cjs 2>&1" no
# Correct multi-line mini-web run script (no shell escape interpretation on printf %s).
cat > "$PREFIX/var/service/mini-web/run" <<RUN
#!/data/data/com.termux/files/usr/bin/sh
cd "$HOME/apps/thophuongpro" || exit 1
exec "$PREFIX/bin/node" --env-file=.env dist/server.cjs 2>&1
RUN
chmod 700 "$PREFIX/var/service/mini-web/run"
make_service amh-panel "cd $HOME/android-hosting-panel || exit 1\nexec $PREFIX/bin/node src/server.mjs 2>&1" yes
cat > "$PREFIX/var/service/amh-panel/run" <<RUN
#!/data/data/com.termux/files/usr/bin/sh
cd "$HOME/android-hosting-panel" || exit 1
exec "$PREFIX/bin/node" src/server.mjs 2>&1
RUN
chmod 700 "$PREFIX/var/service/amh-panel/run"
make_service named-tunnel "exec $PREFIX/bin/cloudflared tunnel run --token-file $HOME/.cloudflared/thophuong.token 2>&1" no

echo '[4/6] Starting local-only services; public Tunnel deliberately disabled'
for svc in nginx amh-panel;do sv-enable "$svc" || true;sv up "$PREFIX/var/service/$svc" || true;done
for svc in mini-web named-tunnel;do sv-disable "$svc" || true;sv down "$PREFIX/var/service/$svc" || true;done
mkdir -p "$HOME/recovery-input";chmod 700 "$HOME/recovery-input"
echo '[5/6] Check initial localhost health (Panel 9090, Nginx 8080)'
sleep 2
for svc in sshd mysqld nginx amh-panel;do sv status "$PREFIX/var/service/$svc" || true;done
printf 'Panel HTTP: ';curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9090/ || true
echo '[6/6] BOOTSTRAP COMPLETE; NO website or Cloudflare Tunnel activated.'
echo 'NEXT: Transfer encrypted mini-hosting-recovery.enc and complete VERIFIED snapshot directory into ~/recovery-input/.'
echo "NEXT: bash $BASE/bin/restore-new-phone.sh \"\$HOME/recovery-input/snapshot-YYYY...\" \"\$HOME/recovery-input/mini-hosting-recovery.enc\""
echo 'Security: do NOT publish panel port 9090 directly. Restore privately and test via SSH first.'
echo 'Install Termux:Boot from F-Droid, open it once, and disable battery optimization for Termux.'
