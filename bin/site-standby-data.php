<?php
// Fixed MHC-managed LAB content only. No user/credential/options/SQL dump transfer.
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$base=getenv('MHC_SITE_BASE');$mode=$argv[1]??'';$content=getenv('MHC_SITE_CONTENT');
if(!$base||!in_array($mode,['export','install','import','check'],true))throw new Exception('SITE_DATA_USAGE');
$tables=['wp_posts','wp_postmeta','wp_comments','wp_commentmeta','wp_terms','wp_termmeta','wp_term_taxonomy','wp_term_relationships'];
function credentials($base){$c=parse_ini_file($base.'/db-client.cnf',true)['client'];return new mysqli('localhost',$c['user'],$c['password'],$c['database'],0,$c['socket']);}
if($mode==='export'){
 $db=credentials($base);$db->set_charset('utf8mb4');$db->begin_transaction(MYSQLI_TRANS_START_READ_ONLY | MYSQLI_TRANS_START_WITH_CONSISTENT_SNAPSHOT);
 $data=['schema'=>1,'siteId'=>'mhc-p33-wordpress-v1','tables'=>[],'credentialsIncluded'=>false];
 foreach($tables as $table){$rows=$db->query('SELECT * FROM `'.$table.'`')->fetch_all(MYSQLI_ASSOC);foreach($rows as &$row){if($table==='wp_posts'){if($row['post_password']!=='')throw new Exception('SITE_PASSWORD_PROTECTED_POST_NOT_PORTABLE');$row['post_author']='1';}if($table==='wp_comments')$row['user_id']='0';}unset($row);$data['tables'][$table]=$rows;}
 $db->commit();file_put_contents($content,json_encode($data,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE));chmod($content,0600);exit;
}
if($mode==='install'){
 $socket=getenv('MHC_SITE_SOCKET');$root=new mysqli('localhost','root','','',0,$socket);
 $exists=$root->query("SELECT COUNT(*) n FROM information_schema.schemata WHERE schema_name='mhc_p33_lab'")->fetch_assoc()['n'];
 $user=$root->query("SELECT COUNT(*) n FROM mysql.user WHERE User='mhc_p33_web'")->fetch_assoc()['n'];
 $journal=$base.'/provision-private.json';$state=is_file($journal)?json_decode(file_get_contents($journal),true,32,JSON_THROW_ON_ERROR):null;
 if(!$state){if($exists||$user)throw new Exception('SITE_EXISTING_DATABASE_REFUSED');$state=['password'=>bin2hex(random_bytes(32)),'installed'=>false];file_put_contents($journal,json_encode($state,JSON_THROW_ON_ERROR));chmod($journal,0600);}
 if($state['installed']===true)exit;
 $password=$state['password'];if(!preg_match('/^[a-f0-9]{64}$/',$password))throw new Exception('SITE_PROVISION_JOURNAL_INVALID');
 if(!$exists)$root->query('CREATE DATABASE mhc_p33_lab CHARACTER SET utf8mb4');if(!$user)$root->query("CREATE USER 'mhc_p33_web'@'localhost' IDENTIFIED BY '$password'");
 // Save local credentials before any DDL that could be interrupted. They are never included in portable backup.
 file_put_contents($base.'/db-client.cnf',"[client]\nuser=mhc_p33_web\npassword=$password\nsocket=$socket\ndatabase=mhc_p33_lab\n");chmod($base.'/db-client.cnf',0600);
 $config="<?php\n";foreach(['DB_NAME'=>'mhc_p33_lab','DB_USER'=>'mhc_p33_web','DB_PASSWORD'=>$password,'DB_HOST'=>'localhost:'.$socket,'DB_CHARSET'=>'utf8mb4','DB_COLLATE'=>'','WP_HOME'=>'https://preview-lab.giaouoc.com','WP_SITEURL'=>'https://preview-lab.giaouoc.com'] as $k=>$v)$config.='define('.var_export($k,true).','.var_export($v,true).");\n";
 foreach(['AUTH_KEY','SECURE_AUTH_KEY','LOGGED_IN_KEY','NONCE_KEY','AUTH_SALT','SECURE_AUTH_SALT','LOGGED_IN_SALT','NONCE_SALT'] as $k)$config.='define('.var_export($k,true).','.var_export(bin2hex(random_bytes(32)),true).");\n";
 $config.="define('DISABLE_WP_CRON',true);define('DISALLOW_FILE_MODS',true);define('WP_HTTP_BLOCK_EXTERNAL',true);define('WP_AUTO_UPDATE_CORE',false);define('WP_DEBUG',false);\n";
 $config.="\$_SERVER['HTTPS']='on';\$table_prefix='wp_';if(!defined('ABSPATH'))define('ABSPATH',__DIR__.'/');require_once ABSPATH.'wp-settings.php';\n";
 if(!is_file($base.'/site/wp-config.php')){file_put_contents($base.'/site/wp-config.php',$config);chmod($base.'/site/wp-config.php',0600);}
 $root->query("GRANT ALL PRIVILEGES ON mhc_p33_lab.* TO 'mhc_p33_web'@'localhost'");
 try{define('WP_INSTALLING',true);require $base.'/site/wp-load.php';require ABSPATH.'wp-admin/includes/upgrade.php';$admin=is_file($base.'/admin-password')?file_get_contents($base.'/admin-password'):bin2hex(random_bytes(24));file_put_contents($base.'/admin-password',$admin);chmod($base.'/admin-password',0600);if(!is_blog_installed())wp_install('MHC Manual Primary LAB','p33lab','lab@example.invalid',false,'',$admin);switch_theme('p33lab');delete_option('theme_switched');update_option('blog_public',0);update_option('permalink_structure','');update_option('comment_moderation',0);update_option('comment_previously_approved',0);$root->query('CREATE TABLE IF NOT EXISTS mhc_p33_lab.mhc_p33_probe (id CHAR(36) PRIMARY KEY)');}
 finally{$root->query("REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'mhc_p33_web'@'localhost'");$root->query("GRANT SELECT ON mhc_p33_lab.* TO 'mhc_p33_web'@'localhost'");}
 $state['installed']=true;file_put_contents($journal,json_encode($state,JSON_THROW_ON_ERROR));exit;
}
$data=json_decode(file_get_contents($content),true,64,JSON_THROW_ON_ERROR);
if($data['schema']!==1||$data['siteId']!=='mhc-p33-wordpress-v1'||$data['credentialsIncluded']!==false||array_keys($data['tables'])!==$tables)throw new Exception('SITE_CONTENT_INVALID');
$db=credentials($base);$db->set_charset('utf8mb4');$root=null;
if($mode==='import'){
 $socket=parse_ini_file($base.'/db-client.cnf',true)['client']['socket'];$root=new mysqli('localhost','root','','',0,$socket);$root->query("GRANT SELECT, INSERT, UPDATE, DELETE ON mhc_p33_lab.* TO 'mhc_p33_web'@'localhost'");
 $db->close();$db=credentials($base);$db->set_charset('utf8mb4');
 try{$db->begin_transaction();foreach($tables as $table){$columns=array_column($db->query('SHOW COLUMNS FROM `'.$table.'`')->fetch_all(MYSQLI_ASSOC),'Field');$db->query('DELETE FROM `'.$table.'`');foreach($data['tables'][$table] as $row){if(array_keys($row)!==$columns)throw new Exception('SITE_CONTENT_COLUMNS_INVALID');$values=[];foreach($row as $v){if(!is_string($v)&&$v!==null)throw new Exception('SITE_CONTENT_VALUE_INVALID');$values[]=$v===null?'NULL':"'".$db->real_escape_string($v)."'";}$db->query('INSERT INTO `'.$table.'` (`'.implode('`,`',$columns).'`) VALUES ('.implode(',',$values).')');}}
 $front=$db->query("SELECT ID FROM wp_posts WHERE post_title='MHC Manual Primary LAB'")->fetch_all(MYSQLI_ASSOC);if(count($front)!==1)throw new Exception('SITE_FRONT_PAGE_INVALID');
 $id=(int)$front[0]['ID'];$db->query("UPDATE wp_options SET option_value='$id' WHERE option_name='page_on_front'");$db->query("UPDATE wp_options SET option_value='page' WHERE option_name='show_on_front'");$db->commit();}
 catch(Throwable $e){$db->rollback();throw $e;}
 finally{$root->query("REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'mhc_p33_web'@'localhost'");$root->query("GRANT SELECT ON mhc_p33_lab.* TO 'mhc_p33_web'@'localhost'");}
}
// Content counts and canonical rows are checked through the target's read-only credentials.
$db->close();$db=credentials($base);$db->set_charset('utf8mb4');$counts=[];
foreach($tables as $table){$rows=$db->query('SELECT * FROM `'.$table.'`')->fetch_all(MYSQLI_ASSOC);$expected=$data['tables'][$table];$sort=function($a,$b){return strcmp(json_encode($a),json_encode($b));};usort($rows,$sort);usort($expected,$sort);if($rows!==$expected)throw new Exception('SITE_RESTORE_CONTENT_MISMATCH');$counts[$table]=count($rows);}
echo json_encode(['counts'=>$counts,'contentVerified'=>true]);
