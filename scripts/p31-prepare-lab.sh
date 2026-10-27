#!/data/data/com.termux/files/usr/bin/bash
# P3.1 isolated fixture data only. Not a fresh installer or production restore.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || exit 2
archive="${1:-}";expected="${2:-}"
[[ "$archive" == "$HOME/.local/state/mhc-p31-lab/transfer-code-media-static.tar" && "$expected" =~ ^[a-f0-9]{64}$ ]] || exit 2
[[ "$(sha256sum "$archive" | cut -d' ' -f1)" == "$expected" ]] || { echo P31_ARCHIVE_HASH_INVALID;exit 1; }
base="$HOME/.local/share/mhc-p31-lab"
[[ ! -e "$base" ]] || { echo P31_DATA_ALREADY_EXISTS_INSPECT_BEFORE_RETRY;exit 1; }
[[ ! -e "$HOME/apps/thophuongpro/.env" && ! -e "$HOME/.config/mini-hosting-cluster/ha.json" ]] || exit 2
nodeid=$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.config/mhc-full-installer/node-identity.json")).nodeId')
[[ "$nodeid" == 4ed4c025-62ae-4c2a-8d68-65dd76ecf550 || "$nodeid" == 4a9672d1-bb62-4286-946a-a78b73e57b24 ]] || exit 2
public_grants=$(mariadb --no-defaults -u root -N -B --raw -e 'SHOW GRANTS FOR PUBLIC')
if [[ -n "$public_grants" && "$public_grants" != 'GRANT USAGE ON *.* TO PUBLIC' && "$public_grants" != 'GRANT USAGE ON *.* TO `PUBLIC`' ]];then
 echo 'P31_PUBLIC_GRANTS_REVIEW_REQUIRED: run guarded p31-restrict-public-test.mjs --plan/--apply first';exit 2
fi
mkdir -m 700 "$base"
trap 'echo "P31_PREPARE_FAILED_LINE|$LINENO|private logs retained; no existing site changed"' ERR
tar -tf "$archive" > "$base/archive-paths.txt"
if grep -Eq '(^/|(^|/)\.\.(/|$)|wp-config\.php|\.env$)' "$base/archive-paths.txt";then echo P31_UNSAFE_ARCHIVE_PATH;exit 2;fi
if grep -Ev '^(core(/|$)|media(/|$)|static(/|$)|wp-cli\.phar$|SHA256SUMS$)' "$base/archive-paths.txt" > "$base/archive-rejected.txt";then echo P31_UNEXPECTED_ARCHIVE_PATH;exit 2;fi
tar -tvf "$archive" > "$base/archive-types.txt"
if grep -Ev '^[-d]' "$base/archive-types.txt" > "$base/archive-rejected.txt";then echo P31_ARCHIVE_LINK_OR_SPECIAL_FILE_DENIED;exit 2;fi
tar -xf "$archive" -C "$base"
(cd "$base" && sha256sum -c SHA256SUMS >/dev/null)
mv "$base/core" "$base/site"
mkdir -p "$base/site/wp-content/uploads/p31" "$base/logs" "$base/php" "$base/nginx"
cp "$base/media/"* "$base/site/wp-content/uploads/p31/"
mkdir -p "$base/site/wp-content/themes/p31fixture" "$base/site/wp-content/mu-plugins"
printf '/*\nTheme Name: P31 isolated fixture\nVersion: 1.0\n*/\n' > "$base/site/wp-content/themes/p31fixture/style.css"
cat > "$base/site/wp-content/themes/p31fixture/index.php" <<'PHP'
<!doctype html><html><head><meta charset="utf-8"><title>MHC P3.1 isolated LAB dataset</title></head><body><?php while(have_posts()){the_post();the_title('<h1>','</h1>');the_content();} ?></body></html>
PHP
cat > "$base/site/wp-content/mu-plugins/p31-readonly.php" <<'PHP'
<?php
// SQL privileges remain the enforcement boundary; avoid leaking denied queries into HTTP logs.
global $wpdb;$wpdb->suppress_errors(true);
remove_action('init','check_theme_switched');
PHP
socket=$(mariadb --no-defaults -u root -N -B -e 'SELECT @@socket')
P31_BASE="$base" P31_SOCKET="$socket" php <<'PHP'
<?php
$base=getenv('P31_BASE');$socket=getenv('P31_SOCKET');
$db=new mysqli('localhost','root','','',0,$socket);
if($db->query("SELECT SCHEMA_NAME FROM information_schema.schemata WHERE SCHEMA_NAME='mhc_p31_lab'")->num_rows)throw new Exception('P31_DB_EXISTS');
if($db->query("SELECT User FROM mysql.user WHERE User='mhc_p31_web'")->num_rows)throw new Exception('P31_USER_EXISTS');
$password=bin2hex(random_bytes(32));
$db->query('CREATE DATABASE mhc_p31_lab CHARACTER SET utf8mb4');
$db->query("CREATE USER 'mhc_p31_web'@'localhost' IDENTIFIED BY '$password'");
$db->query("GRANT ALL PRIVILEGES ON mhc_p31_lab.* TO 'mhc_p31_web'@'localhost'");
$config="<?php\n";
foreach(['DB_NAME'=>'mhc_p31_lab','DB_USER'=>'mhc_p31_web','DB_PASSWORD'=>$password,'DB_HOST'=>'localhost:'.$socket,'DB_CHARSET'=>'utf8mb4','DB_COLLATE'=>'','WP_HOME'=>'http://127.0.0.1:18131','WP_SITEURL'=>'http://127.0.0.1:18131'] as $k=>$v)$config.='define('.var_export($k,true).','.var_export($v,true).");\n";
foreach(['AUTH_KEY','SECURE_AUTH_KEY','LOGGED_IN_KEY','NONCE_KEY','AUTH_SALT','SECURE_AUTH_SALT','LOGGED_IN_SALT','NONCE_SALT'] as $k)$config.='define('.var_export($k,true).','.var_export(bin2hex(random_bytes(32)),true).");\n";
$config.="define('DISABLE_WP_CRON',true);define('DISALLOW_FILE_MODS',true);define('WP_HTTP_BLOCK_EXTERNAL',true);define('WP_AUTO_UPDATE_CORE',false);define('WP_DEBUG',false);\n";
$config.="\$table_prefix='wp_';if(!defined('ABSPATH'))define('ABSPATH',__DIR__.'/');require_once ABSPATH.'wp-settings.php';\n";
file_put_contents($base.'/site/wp-config.php',$config);chmod($base.'/site/wp-config.php',0600);
file_put_contents($base.'/db-client.cnf',"[client]\nuser=mhc_p31_web\npassword=$password\nsocket=$socket\ndatabase=mhc_p31_lab\n");chmod($base.'/db-client.cnf',0600);
PHP
# Install synthetic content. No original users, password hashes, options or credentials copied.
P31_BASE="$base" php -d memory_limit=256M > "$base/logs/provision-private.log" 2>&1 <<'PHP'
<?php
define('WP_INSTALLING',true);$base=getenv('P31_BASE');require $base.'/site/wp-load.php';require ABSPATH.'wp-admin/includes/upgrade.php';
wp_install('MHC P3.1 isolated LAB dataset','p31lab','lab@example.invalid',false,'',bin2hex(random_bytes(32)));
switch_theme('p31fixture');delete_option('theme_switched');
update_option('blog_public',0);update_option('permalink_structure','');
$images=glob($base.'/site/wp-content/uploads/p31/*');$img=basename($images[0]);
$id=wp_insert_post(['post_title'=>'MHC P3.1 isolated LAB dataset','post_status'=>'publish','post_type'=>'page','post_content'=>'<p>P3.1 synthetic content; original Vsmart data remains unchanged.</p><img src="/wp-content/uploads/p31/'.esc_attr($img).'" alt="LAB media"/>']);
if(is_wp_error($id)||!$id)throw new Exception('P31_CONTENT_FAILED');update_option('show_on_front','page');update_option('page_on_front',$id);
PHP
# Revoke every write privilege before any HTTP service exists.
mariadb --no-defaults -u root <<'SQL'
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'mhc_p31_web'@'localhost';
GRANT SELECT ON mhc_p31_lab.* TO 'mhc_p31_web'@'localhost';
SQL
mariadb --defaults-file="$base/db-client.cnf" -N -B -e "SELECT COUNT(*) FROM wp_posts WHERE post_title='MHC P3.1 isolated LAB dataset'" | grep -qx 1
if mariadb --defaults-file="$base/db-client.cnf" -e "UPDATE wp_options SET option_value=option_value WHERE option_name='blogname'" > "$base/logs/write-denial.log" 2>&1;then echo P31_WRITE_PRIVILEGE_NOT_BLOCKED;exit 1;fi
cat > "$base/php/php-fpm.conf" <<CONF
[global]
pid = $base/php/php-fpm.pid
error_log = $base/logs/php-fpm.log
daemonize = no
[www]
listen = 127.0.0.1:19131
listen.allowed_clients = 127.0.0.1
pm = ondemand
pm.max_children = 2
pm.process_idle_timeout = 5s
clear_env = yes
php_admin_value[memory_limit] = 128M
php_admin_flag[log_errors] = on
php_admin_flag[display_errors] = off
CONF
cat > "$base/nginx/nginx.conf" <<CONF
worker_processes 1;
pid $base/nginx/nginx.pid;
error_log $base/logs/nginx-error.log;
events { worker_connections 64; }
http {
 include $PREFIX/etc/nginx/mime.types;
 access_log off;
 server {
  listen 127.0.0.1:18131;
  server_name localhost 127.0.0.1;
  root $base/site;
  index index.php;
  add_header X-MHC-Node '$nodeid' always;
  if (\$request_method !~ ^(GET|HEAD)\$) { return 403; }
  location = /static-demo.html { alias $base/static/index.html; default_type text/html; }
  location ~* ^/(wp-admin|wp-login.php|wp-cron.php|xmlrpc.php|wp-json) { return 403; }
  location / { try_files \$uri \$uri/ /index.php?\$args; }
  location ~* ^/wp-content/uploads/.*\\.php\$ { return 403; }
  location ~ /\\. { return 403; }
  location = /wp-config.php { return 403; }
  location ~ \\.php\$ {
   try_files \$uri =404;
   include $PREFIX/etc/nginx/fastcgi_params;
   fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
   fastcgi_param HTTP_PROXY '';
   fastcgi_pass 127.0.0.1:19131;
  }
 }
}
CONF
nginx -t -p "$base/nginx/" -c "$base/nginx/nginx.conf" > "$base/logs/nginx-check.log" 2>&1
php-fpm -t -y "$base/php/php-fpm.conf" > "$base/logs/php-check.log" 2>&1
mariadb-dump --no-defaults -u root --single-transaction --quick mhc_p31_lab | gzip > "$base/synthetic-lab.sql.gz"
gzip -t "$base/synthetic-lab.sql.gz"
P31_BASE="$base" P31_SOURCE_HASH="$expected" node <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto'),base=process.env.P31_BASE;
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=[];function walk(d){for(const n of fs.readdirSync(d)){const p=path.join(d,n),st=fs.lstatSync(p);if(st.isSymbolicLink())throw Error('SYMLINK_DENIED');if(st.isDirectory())walk(p);else files.push({path:path.relative(base,p).replaceAll('\\','/'),sha256:hash(p)});}}
walk(path.join(base,'site'));walk(path.join(base,'static'));files.push({path:'synthetic-lab.sql.gz',sha256:hash(path.join(base,'synthetic-lab.sql.gz'))});
for(const p of ['db-client.cnf','php/php-fpm.conf','nginx/nginx.conf'])files.push({path:p,sha256:hash(path.join(base,p))});
const metadata={schema:1,datasetId:'mhc-p31-synthetic-v1',sourceArchiveSha256:process.env.P31_SOURCE_HASH,preparedAt:new Date().toISOString(),sourceSqlTransferred:false,originalCredentialsCopied:false,files};
fs.writeFileSync(path.join(base,'dataset.json'),JSON.stringify(metadata),{mode:0o600});console.log('P31_DATASET_PREPARED|'+files.length+'|SQL_SELECT_PASS|SQL_UPDATE_DENIED');
NODE
chmod -R go-rwx "$base"
echo P31_NO_WEBSITE_SERVICE_STARTED
