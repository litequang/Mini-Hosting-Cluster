#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PREFIX=${PREFIX:-/data/data/com.termux/files/usr}
ROOT="$HOME/mhc-wordpress"; SITES="$ROOT/sites"; mkdir -p "$SITES"
usage(){ echo 'Usage: mhc-wordpress.sh doctor|install-runtime|create-site DOMAIN|list'; }
case "${1:-}" in
 doctor)
  for p in nginx php php-fpm mariadb wp; do command -v "$p" || true; done
  php -m 2>/dev/null | grep -Ei 'mysqli|curl|mbstring|xml|zip|gd|intl|Zend OPcache' || true
  echo 'Read-only check complete.';;
 install-runtime)
  echo 'Installing Termux packages; no existing nginx/MariaDB configs will be overwritten.'
  pkg update && pkg install -y php php-fpm nginx mariadb curl unzip
  echo 'Check PHP modules with: php -m. Install WP-CLI separately after verifying source/signature.';;
 create-site)
  domain=${2:-}; [[ "$domain" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$ ]] || { echo 'Invalid domain' >&2; exit 2; }
  site="$SITES/$domain"; [[ ! -e "$site" ]] || { echo 'Site exists' >&2; exit 2; }
  mkdir -p "$site/public" "$site/logs"
  cat > "$site/nginx.conf.example" <<CONF
# Include manually inside nginx http {} after review; do not overwrite live config.
server {
    listen 127.0.0.1:8088;
    server_name $domain;
    root $site/public;
    index index.php index.html;
    location / { try_files \$uri \$uri/ /index.php?\$args; }
    location ~ \\.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_pass 127.0.0.1:9000;
    }
    location ~ /\\. { deny all; }
    location = /wp-config.php { deny all; }
}
CONF
  echo "Site skeleton created: $site"; echo 'Next: configure PHP-FPM socket/port, DB credentials, WordPress files, nginx include and Cloudflare routing manually.';;
 list) find "$SITES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n';;
 *) usage; exit 2;;
esac
