#!/data/data/com.termux/files/usr/bin/bash
# Local-only independent nginx + php-fpm for MHC-managed WordPress; no production config edits.
set -Eeuo pipefail; umask 077
BASE="$HOME/.local/share/mhc-full-installer"; ROOT="$BASE/hosting"; PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
export SVDIR="${SVDIR:-$PREFIX/var/service}"
VALID_SLUG='^[a-z][a-z0-9-]{1,30}$'
fail(){ echo "ERROR: $*" >&2; exit 1; }
init(){
  mkdir -p "$ROOT/nginx/sites" "$ROOT/logs" "$ROOT/php" "$HOME/.config/mhc-full-installer/sites"
  chmod 700 "$ROOT" "$ROOT/logs" "$ROOT/php"
  [[ ! -L "$ROOT/nginx/nginx.conf" && ! -L "$ROOT/php/php-fpm.conf" ]] || fail 'Managed config symlink is unsafe'
  if [[ ! -f "$ROOT/nginx/nginx.conf" ]];then
  cat > "$ROOT/nginx/nginx.conf" <<CONF
worker_processes 1;
error_log $ROOT/logs/nginx-error.log;
pid $ROOT/nginx/nginx.pid;
events { worker_connections 512; }
http {
  include $PREFIX/etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log $ROOT/logs/nginx-access.log;
  server_tokens off;
  client_max_body_size 16m;
  server { listen 127.0.0.1:18080 default_server; server_name _; return 404; }
  include $ROOT/nginx/sites/*.conf;
}
CONF
  fi
  if [[ ! -f "$ROOT/php/php-fpm.conf" ]];then
  cat > "$ROOT/php/php-fpm.conf" <<CONF
[global]
pid = $ROOT/php/php-fpm.pid
error_log = $ROOT/logs/php-fpm.log
daemonize = no
[www]
listen = 127.0.0.1:19000
listen.allowed_clients = 127.0.0.1
pm = ondemand
pm.max_children = 3
pm.process_idle_timeout = 10s
pm.max_requests = 300
catch_workers_output = yes
clear_env = yes
security.limit_extensions = .php
CONF
  fi
}
configure(){
  local slug="${1:-}" host="${2:-}" root
  [[ "$slug" =~ $VALID_SLUG ]] || fail 'Invalid site slug'
  [[ "$host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}$ && "$host" != *..* && "$host" != *. ]] || fail 'Invalid hostname'
  root="$HOME/websites/$slug"
  [[ -f "$root/wp-config.php" && -f "$HOME/.config/mhc-full-installer/sites/$slug.env" ]] || fail 'WordPress must be provisioned first'
  for f in "$ROOT/nginx/sites/"*.conf; do
    [[ -f "$f" && "$f" != "$ROOT/nginx/sites/$slug.conf" ]] || continue
    if grep -Fxq "    server_name $host;" "$f"; then fail 'Hostname already used by another managed site'; fi
  done
  init
  cat > "$ROOT/nginx/sites/$slug.conf" <<CONF
server {
    listen 127.0.0.1:18080;
    server_name $host;
    root $root;
    index index.php index.html;
    autoindex off;
    location / { try_files \$uri \$uri/ /index.php?\$args; }
    location ~* ^/wp-content/uploads/.*\\.php\$ { deny all; }
    location = /wp-config.php { deny all; }
    location ~ \\.php\$ {
        try_files \$uri =404;
        include $PREFIX/etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_param HTTP_PROXY "";
        fastcgi_pass 127.0.0.1:19000;
        fastcgi_read_timeout 60s;
    }
    location ~ /\\. { deny all; }
    location ~* /(wp-config\\.php|readme\\.html|license\\.txt|\\.user\\.ini)\$ { deny all; }
    location ~* \\.(?:sql|bak|old|log|ini|env|sh|key)\$ { deny all; }
}
CONF
  chmod 600 "$ROOT/nginx/sites/$slug.conf"
  echo "Configured local-only WordPress vhost: $host -> 127.0.0.1:18080 ($root)"
  echo 'Not exposed to LAN/WAN; call serve check, then serve start on clean TEST Termux.'
}
configure_static(){
  local slug="${1:-}" host="${2:-}" root
  [[ "$slug" =~ $VALID_SLUG ]] || fail 'Invalid static site slug'
  [[ "$host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}$ && "$host" != *..* && "$host" != *. ]] || fail 'Invalid hostname'
  root="$HOME/websites/$slug"
  [[ -f "$HOME/.config/mhc-full-installer/static/$slug.conf" && -f "$root/index.html" && ! -L "$root" ]] || fail 'Managed static website must exist first'
  for f in "$ROOT/nginx/sites/"*.conf; do
    [[ -f "$f" && "$f" != "$ROOT/nginx/sites/$slug.conf" ]] || continue
    grep -Fxq "    server_name $host;" "$f" && fail 'Hostname already assigned to another site'
  done
  init
  cat > "$ROOT/nginx/sites/$slug.conf" <<CONF
server {
    listen 127.0.0.1:18080;
    server_name $host;
    root $root;
    index index.html;
    autoindex off;
    add_header X-Content-Type-Options nosniff always;
    location / { try_files \$uri \$uri/ =404; }
    location ~ /\\. { deny all; }
    location ~* \\.(?:php|phar|phtml|sql|bak|old|log|ini|env|sh|key)\$ { deny all; }
}
CONF
  chmod 600 "$ROOT/nginx/sites/$slug.conf"
  echo "Configured loopback static site $slug -> $host on port 18080. Run serve check/reload."
}
reload(){
  [[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || fail 'Termux required for runtime reload'
  check
  if ! command -v sv >/dev/null || ! sv status mhc-full-wp-nginx 2>/dev/null | grep -q '^run:';then
    fail 'Managed Nginx service is not running. Use serve start only on a fresh TEST device.'
  fi
  nginx -p "$ROOT/nginx/" -c "$ROOT/nginx/nginx.conf" -s reload
  echo 'Managed Nginx reloaded after syntax check. External Nginx/Tunnel not modified.'
}
probe_static(){
  local slug="${1:-}" host="${2:-}" actual
  [[ "$slug" =~ $VALID_SLUG && "$host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}$ ]] || fail 'Invalid slug/host'
  [[ -f "$HOME/.config/mhc-full-installer/static/$slug.conf" ]] || fail 'Unknown static site'
  [[ -f "$ROOT/nginx/sites/$slug.conf" ]] || fail 'No vhost configured'
  grep -Fxq "    server_name $host;" "$ROOT/nginx/sites/$slug.conf" || fail 'Host mismatch'
  actual="$(curl -fsS --max-time 8 -H "Host: $host" http://127.0.0.1:18080/index.html)" || fail 'HTTP static test failed'
  [[ -n "$actual" ]] || fail 'Static index empty'
  echo 'PASS: MHC local Nginx serves static site.'
}
check(){
  [[ -f "$ROOT/nginx/nginx.conf" && -f "$ROOT/php/php-fpm.conf" ]] || fail 'No vhost yet; run serve configure'
  command -v nginx >/dev/null && command -v php-fpm >/dev/null || fail 'nginx or php-fpm missing'
  nginx -t -p "$ROOT/nginx/" -c "$ROOT/nginx/nginx.conf"
  php-fpm -t -y "$ROOT/php/php-fpm.conf"
  echo 'Config syntax accepted (not an end-to-end runtime test).'
}
start(){
  [[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || fail 'Termux required'
  check
  local service run existing expected ready attempt
  for service in mhc-full-wp-php mhc-full-wp-nginx; do
    run="$PREFIX/var/service/$service/run"
    if [[ -e "$run" ]];then
      [[ -f "$run" && ! -L "$run" ]] || fail "Unsafe managed service run file: $service"
      if [[ "$service" == mhc-full-wp-php ]];then
        expected="exec \"$PREFIX/bin/php-fpm\" -y \"$ROOT/php/php-fpm.conf\" -F 2>&1"
      else
        expected="exec \"$PREFIX/bin/nginx\" -p \"$ROOT/nginx/\" -c \"$ROOT/nginx/nginx.conf\" -g 'daemon off;' 2>&1"
      fi
      grep -Fqx "$expected" "$run" || fail "Service $service exists but is not recognized as MHC-managed; no overwrite"
      echo "Known $service service exists; preserving run script."
    else
      mkdir -p "$PREFIX/var/service/$service"
      if [[ "$service" == mhc-full-wp-php ]];then
        cat > "$run" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/php-fpm" -y "$ROOT/php/php-fpm.conf" -F 2>&1
EOF
      else
        cat > "$run" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/nginx" -p "$ROOT/nginx/" -c "$ROOT/nginx/nginx.conf" -g 'daemon off;' 2>&1
EOF
      fi
      chmod 700 "$run"
    fi
  done
  for service in mhc-full-wp-php mhc-full-wp-nginx; do
    sv-enable "$service" || fail "Cannot enable $service; inspect runit"
    ready=0
    for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20;do
      if [[ -e "$PREFIX/var/service/$service/supervise/ok" ]];then ready=1;break;fi
      sleep 0.3
    done
    [[ "$ready" == 1 ]] || fail "runit has not adopted $service; do not delete managed run scripts"
    sv up "$service" || fail "Could not start $service; inspect logs"
  done
  echo 'Managed PHP-FPM and Nginx requested ON for 127.0.0.1:18080; probe website HTTP separately.'
}
status(){
  for service in mhc-full-wp-php mhc-full-wp-nginx; do sv status "$service" 2>/dev/null || echo "$service: not running/configured"; done
}
stop(){
  [[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || fail 'Termux required'
  for service in mhc-full-wp-nginx mhc-full-wp-php; do
    [[ -f "$PREFIX/var/service/$service/run" ]] || continue
    sv-disable "$service"; sv down "$service"
  done
  echo 'Only managed MHC WordPress runtime stopped; existing nginx/Node/DB/Tunnel untouched.'
}
probe(){
  local slug="${1:-}" host="${2:-}" root token file answer
  [[ "$slug" =~ $VALID_SLUG ]] || fail 'Invalid slug'
  [[ "$host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}$ ]] || fail 'Invalid host'
  [[ -f "$ROOT/nginx/sites/$slug.conf" ]] || fail 'Vhost not configured'
  grep -Fxq "    server_name $host;" "$ROOT/nginx/sites/$slug.conf" || fail 'Hostname mismatch'
  root="$HOME/websites/$slug"; token="$(openssl rand -hex 16)"; file="$root/mhc-probe-$token.php"
  [[ ! -e "$file" ]] || fail 'Probe collision'
  trap 'rm -f -- "$file"' EXIT
  printf '<?php header("Content-Type: text/plain"); echo "%s"; ?>\n' "$token" > "$file"; chmod 600 "$file"
  answer="$(curl -fsS --max-time 8 -H "Host: $host" "http://127.0.0.1:18080/$(basename "$file")")" || fail 'HTTP PHP smoke test failed'
  [[ "$answer" == "$token" ]] || fail 'PHP was not executed correctly'
  echo 'PASS: local nginx -> PHP-FPM -> PHP for managed site.'
}
case "${1:-}" in
  configure) shift; configure "$@";;
  configure-static) shift; configure_static "$@";;
  check) check;; start) start;; stop) stop;; status) status;; reload) reload;;
  probe) shift; probe "$@";;
  probe-static) shift; probe_static "$@";;
  *) echo 'Usage: mhc-full serve configure SLUG HOST | configure-static SLUG HOST | check | start | stop | reload | status | probe SLUG HOST | probe-static SLUG HOST';exit 2;;
esac
