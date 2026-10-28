#!/data/data/com.termux/files/usr/bin/bash
# Fresh, isolated writable WordPress LAB dataset. Never restore over an existing site.
set -Eeuo pipefail
umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr && "${1:-}" == --prepare-isolated-wordpress ]] || exit 2
[[ ! -e "$HOME/apps/thophuongpro/.env" && ! -e "$HOME/.config/mini-hosting-cluster/ha.json" && ! -e "$HOME/.config/mini-hosting-cluster/node.json" ]] || exit 2
nodeid=$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.config/mhc-full-installer/node-identity.json")).nodeId')
[[ "$nodeid" == 4ed4c025-62ae-4c2a-8d68-65dd76ecf550 || "$nodeid" == 4a9672d1-bb62-4286-946a-a78b73e57b24 ]] || exit 2
[[ -f "$HOME/.local/share/mhc-full-installer/bin/p33-node.mjs" ]] || { echo P33_SOURCE_REQUIRED;exit 2; }
export SVDIR="$PREFIX/var/service"
base="$HOME/.local/share/mhc-p33-lab"
archive="$HOME/.local/state/mhc-p31-lab/transfer-code-media-static.tar"
[[ ! -e "$base" && -f "$archive" ]] || { echo P33_DATA_EXISTS_OR_ARCHIVE_MISSING_INSPECT_BEFORE_RETRY;exit 2; }
expected=$(node -p 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.local/share/mhc-p31-lab/dataset.json")).sourceArchiveSha256')
[[ "$expected" =~ ^[a-f0-9]{64}$ && "$(sha256sum "$archive" | cut -d' ' -f1)" == "$expected" ]] || { echo P33_ARCHIVE_HASH_INVALID;exit 1; }
public_grants=$(mariadb --no-defaults -u root -N -B --raw -e 'SHOW GRANTS FOR PUBLIC')
[[ -z "$public_grants" || "$public_grants" == 'GRANT USAGE ON *.* TO PUBLIC' || "$public_grants" == 'GRANT USAGE ON *.* TO `PUBLIC`' ]] || { echo P33_PUBLIC_PRIVILEGES_UNSAFE;exit 1; }
[[ "$(mariadb --no-defaults -u root -N -B -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN ('mhc_p33_lab','mhc_p33_restore_probe')")" == 0 ]] || { echo P33_SCHEMA_EXISTS;exit 1; }
[[ "$(mariadb --no-defaults -u root -N -B -e "SELECT COUNT(*) FROM mysql.user WHERE User='mhc_p33_web'")" == 0 ]] || { echo P33_USER_EXISTS;exit 1; }
mkdir -m 700 "$base"
mkdir -m 700 "$base/logs" "$base/php" "$base/nginx"
trap 'mariadb --no-defaults -u root -e "REVOKE ALL PRIVILEGES, GRANT OPTION FROM '\''mhc_p33_web'\''@'\''localhost'\''; GRANT SELECT ON mhc_p33_lab.* TO '\''mhc_p33_web'\''@'\''localhost'\'';" > "$base/logs/failure-quiesce.log" 2>&1 || true; echo P33_SETUP_FAILED_PRIVATE_LOGS_RETAINED' ERR
tar -tf "$archive" > "$base/archive-paths.txt"
if grep -Eq '(^/|(^|/)\.\.(/|$)|wp-config\.php|\.env$)' "$base/archive-paths.txt";then echo P33_ARCHIVE_PATH_DENIED;exit 2;fi
if grep -Ev '^(core(/|$)|media(/|$)|static(/|$)|wp-cli\.phar$|SHA256SUMS$)' "$base/archive-paths.txt" > "$base/archive-rejected.txt";then echo P33_ARCHIVE_CONTENT_DENIED;exit 2;fi
tar -tvf "$archive" > "$base/archive-types.txt"
if grep -Ev '^[-d]' "$base/archive-types.txt" > "$base/archive-rejected.txt";then echo P33_ARCHIVE_LINK_DENIED;exit 2;fi
tar -xf "$archive" -C "$base"
(cd "$base" && sha256sum -c SHA256SUMS >/dev/null)
mv "$base/core" "$base/site"
mkdir -p "$base/site/wp-content/uploads/p33" "$base/site/wp-content/themes/p33lab"
cp "$base/media/"* "$base/site/wp-content/uploads/p33/"
printf '/*\nTheme Name: MHC Manual Primary LAB\nVersion: 1.0\n*/\n' > "$base/site/wp-content/themes/p33lab/style.css"
cat > "$base/site/wp-content/themes/p33lab/index.php" <<'PHP'
<!doctype html><html><head><meta charset="utf-8"><title>MHC Manual Primary LAB</title></head><body><h1>MHC Manual Primary LAB</h1><p>Website WordPress có quyền ghi trên node Primary do MHC quản lý. Dữ liệu mỗi node độc lập.</p><?php while(have_posts()){the_post();the_title('<h2>','</h2>');the_content();foreach(get_comments(['post_id'=>get_the_ID(),'status'=>'approve']) as $comment)echo '<p>'.esc_html($comment->comment_content).'</p>';comment_form(['title_reply'=>'Ghi thử bình luận trên Primary']);} ?><p><a href="/wp-admin/">Quản trị WordPress</a></p></body></html>
PHP
socket=$(mariadb --no-defaults -u root -N -B -e 'SELECT @@socket')
P33_BASE="$base" P33_SOCKET="$socket" php > "$base/logs/provision-private.log" 2>&1 <<'PHP'
<?php
$base=getenv('P33_BASE');$socket=getenv('P33_SOCKET');$db=new mysqli('localhost','root','','',0,$socket);$password=bin2hex(random_bytes(32));
$db->query('CREATE DATABASE mhc_p33_lab CHARACTER SET utf8mb4');
$db->query("CREATE USER 'mhc_p33_web'@'localhost' IDENTIFIED BY '$password'");
$db->query("GRANT ALL PRIVILEGES ON mhc_p33_lab.* TO 'mhc_p33_web'@'localhost'");
$config="<?php\n";
foreach(['DB_NAME'=>'mhc_p33_lab','DB_USER'=>'mhc_p33_web','DB_PASSWORD'=>$password,'DB_HOST'=>'localhost:'.$socket,'DB_CHARSET'=>'utf8mb4','DB_COLLATE'=>'','WP_HOME'=>'https://preview-lab.giaouoc.com','WP_SITEURL'=>'https://preview-lab.giaouoc.com'] as $k=>$v)$config.='define('.var_export($k,true).','.var_export($v,true).");\n";
foreach(['AUTH_KEY','SECURE_AUTH_KEY','LOGGED_IN_KEY','NONCE_KEY','AUTH_SALT','SECURE_AUTH_SALT','LOGGED_IN_SALT','NONCE_SALT'] as $k)$config.='define('.var_export($k,true).','.var_export(bin2hex(random_bytes(32)),true).");\n";
$config.="define('DISABLE_WP_CRON',true);define('DISALLOW_FILE_MODS',true);define('WP_HTTP_BLOCK_EXTERNAL',true);define('WP_AUTO_UPDATE_CORE',false);define('WP_DEBUG',false);\n";
$config.="\$_SERVER['HTTPS']='on';\$table_prefix='wp_';if(!defined('ABSPATH'))define('ABSPATH',__DIR__.'/');require_once ABSPATH.'wp-settings.php';\n";
file_put_contents($base.'/site/wp-config.php',$config);chmod($base.'/site/wp-config.php',0600);
file_put_contents($base.'/db-client.cnf',"[client]\nuser=mhc_p33_web\npassword=$password\nsocket=$socket\ndatabase=mhc_p33_lab\n");chmod($base.'/db-client.cnf',0600);
define('WP_INSTALLING',true);require $base.'/site/wp-load.php';require ABSPATH.'wp-admin/includes/upgrade.php';
$admin=bin2hex(random_bytes(20));wp_install('MHC Manual Primary LAB','p33lab','lab@example.invalid',false,'',$admin);
file_put_contents($base.'/admin-password',$admin);chmod($base.'/admin-password',0600);
switch_theme('p33lab');delete_option('theme_switched');update_option('blog_public',0);update_option('permalink_structure','');update_option('comment_moderation',0);update_option('comment_previously_approved',0);
$images=glob($base.'/site/wp-content/uploads/p33/*');$img=basename($images[0]);
$id=wp_insert_post(['post_title'=>'MHC Manual Primary LAB','post_status'=>'publish','post_type'=>'page','comment_status'=>'open','post_content'=>'<p>Isolated WordPress LAB. Original Vsmart websites are unchanged.</p><img src="/wp-content/uploads/p33/'.esc_attr($img).'" alt="LAB media"/>']);
if(is_wp_error($id)||!$id)throw new Exception('P33_CONTENT_FAILED');update_option('show_on_front','page');update_option('page_on_front',$id);
if(!$db->query('CREATE TABLE mhc_p33_lab.mhc_p33_probe (id CHAR(36) PRIMARY KEY)'))throw new Exception('P33_PROBE_TABLE_CREATE_FAILED');
PHP
mariadb --no-defaults -u root > "$base/logs/quiesce.log" 2>&1 <<'SQL'
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'mhc_p33_web'@'localhost';
GRANT SELECT ON mhc_p33_lab.* TO 'mhc_p33_web'@'localhost';
SQL
mariadb-dump --no-defaults -u root --single-transaction --quick mhc_p33_lab | gzip > "$base/synthetic-wordpress.sql.gz"
gzip -t "$base/synthetic-wordpress.sql.gz"
sha256sum "$base/synthetic-wordpress.sql.gz" > "$base/synthetic-wordpress.sql.gz.sha256"
mariadb --no-defaults -u root -e 'CREATE DATABASE mhc_p33_restore_probe CHARACTER SET utf8mb4'
gzip -dc "$base/synthetic-wordpress.sql.gz" | mariadb --no-defaults -u root mhc_p33_restore_probe > "$base/logs/restore-probe.log" 2>&1
for table in wp_posts wp_options wp_users;do
 [[ "$(mariadb --no-defaults -u root -N -B -e "SELECT COUNT(*) FROM mhc_p33_lab.$table")" == "$(mariadb --no-defaults -u root -N -B -e "SELECT COUNT(*) FROM mhc_p33_restore_probe.$table")" ]] || { echo P33_RESTORE_COUNTS_DIFFER;exit 1; }
done
cat > "$base/php/php-fpm.conf" <<CONF
[global]
pid = $base/php/php-fpm.pid
error_log = $base/logs/php-fpm.log
daemonize = no
[www]
listen = 127.0.0.1:19133
listen.allowed_clients = 127.0.0.1
pm = ondemand
pm.max_children = 2
pm.process_idle_timeout = 5s
clear_env = yes
php_admin_value[memory_limit] = 128M
php_admin_value[upload_max_filesize] = 8M
php_admin_value[post_max_size] = 8M
php_admin_flag[log_errors] = on
php_admin_flag[display_errors] = off
CONF
cat > "$base/nginx/nginx.conf" <<CONF
worker_processes 1;
pid $base/nginx/nginx.pid;
error_log $base/logs/nginx-error.log crit;
events { worker_connections 64; }
http {
 include $PREFIX/etc/nginx/mime.types;
 access_log off;
 client_max_body_size 8m;
 server {
  listen 127.0.0.1:18133;
  server_name preview-lab.giaouoc.com;
  root $base/site;
  index index.php;
  add_header X-MHC-Node '$nodeid' always;
  location = /wp-cron.php { return 403; }
  location = /xmlrpc.php { return 403; }
  location / { try_files \$uri \$uri/ /index.php?\$args; }
  location ~* ^/wp-content/uploads/.*\\.php\$ { return 403; }
  location ~ /\\. { return 403; }
  location = /wp-config.php { return 403; }
  location ~ \\.php\$ {
   try_files \$uri =404;
   include $PREFIX/etc/nginx/fastcgi_params;
   fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
   fastcgi_param HTTP_PROXY '';
   fastcgi_param HTTPS on;
   fastcgi_pass 127.0.0.1:19133;
  }
 }
}
CONF
nginx -t -p "$base/nginx/" -c "$base/nginx/nginx.conf" > "$base/logs/nginx-check.log" 2>&1
php-fpm -t -y "$base/php/php-fpm.conf" > "$base/logs/php-check.log" 2>&1
P33_BASE="$base" node <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto'),base=process.env.P33_BASE;
const files=['site/wp-config.php','db-client.cnf','php/php-fpm.conf','nginx/nginx.conf','site/wp-content/themes/p33lab/index.php'].map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(base,p))).digest('hex')}));
fs.writeFileSync(path.join(base,'dataset.json'),JSON.stringify({schema:3,datasetId:'mhc-p33-wordpress-v1',preparedAt:new Date().toISOString(),originalCredentialsCopied:false,restoreVerified:true,files}),{mode:0o600});
NODE
chmod -R go-rwx "$base"
service="$PREFIX/var/service/mhc-lab-p33"
[[ ! -e "$service" ]] || { echo P33_SERVICE_EXISTS_INSPECT_BEFORE_RETRY;exit 1; }
mkdir -m 700 "$service"
touch "$service/down"
printf '#!/data/data/com.termux/files/usr/bin/sh\nexport HOME=%s\nexec %s/bin/node %s/.local/share/mhc-full-installer/bin/p33-node.mjs watch\n' "$HOME" "$PREFIX" "$HOME" > "$service/run"
chmod 700 "$service/run"
for i in {1..60};do [[ -e "$service/supervise/ok" ]] && break;sleep 0.25;done
[[ -e "$service/supervise/ok" ]] || { echo P33_SUPERVISOR_NOT_READY;exit 1; }
sv-enable mhc-lab-p33 > "$base/logs/service-start.log" 2>&1
sv -w 10 up "$service" >> "$base/logs/service-start.log" 2>&1
echo P33_ISOLATED_WORDPRESS_PREPARED_RESTORE_VERIFIED_STANDBY_NO_WRITER
