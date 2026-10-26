#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail;umask 077
[[ "${1:-}" == install && "${2:-}" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || { echo 'Usage: ~/mhc-full wordpress install SITE_SLUG';exit 1; }
SLUG="$2"; DIR="$HOME/websites/$SLUG"; CONF="$HOME/.config/mhc-full-installer/sites";mkdir -p "$CONF" "$HOME/websites"
[[ ! -e "$DIR" && ! -e "$CONF/$SLUG.env" ]] || { echo 'Site already exists';exit 1; }
for c in php php-fpm mariadb curl unzip nginx;do command -v "$c" >/dev/null || { echo "Missing $c";exit 1; };done
php -r 'foreach(["mysqli","curl","mbstring","dom","zip","gd"] as $x){if(!extension_loaded($x)){fwrite(STDERR,"Missing PHP extension: $x\n");exit(1);}}'
command -v wp >/dev/null || { echo 'WP-CLI missing. Install verified WP-CLI first (see README); no unverified download executed.';exit 1; }
DB="wp_${SLUG//-/_}"; DBUSER="u_${SLUG//-/_}"; [[ ${#DB} -le 48 && ${#DBUSER} -le 48 ]] || exit 1
PASS="$(openssl rand -hex 24)"
# Root socket auth is required; never expose MariaDB to LAN.
mariadb --no-defaults -u root -e 'SELECT 1' >/dev/null || { echo 'MariaDB local root socket not available';exit 1; }
mkdir -p "$DIR"; chmod 700 "$DIR"
trap 'echo "WordPress provisioning interrupted. Inspect site directory and DB before retry."' ERR
mariadb --no-defaults -u root <<SQL
CREATE DATABASE \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '$DBUSER'@'localhost' IDENTIFIED BY '$PASS';
GRANT ALL PRIVILEGES ON \`$DB\`.* TO '$DBUSER'@'localhost';
SQL
(cd "$DIR" && wp core download --allow-root && wp config create --dbname="$DB" --dbuser="$DBUSER" --dbpass="$PASS" --dbhost=localhost --skip-check --allow-root)
chmod 600 "$DIR/wp-config.php"
cat > "$CONF/$SLUG.env" <<CFG
SITE_SLUG=$SLUG
SITE_ROOT=$DIR
DB_NAME=$DB
DB_USER=$DBUSER
CFG
chmod 600 "$CONF/$SLUG.env"
echo "WordPress files configured in $DIR. Database $DB created."
echo 'Site is NOT publicly exposed. Complete PHP-FPM socket, Nginx vhost and wp core install after selecting domain.'
echo 'Use localhost only until HTTPS, access control and PHP-FPM have been tested.'
