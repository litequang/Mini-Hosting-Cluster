<?php
mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);$d=$argv[1];$m=json_decode(file_get_contents($d.'/fixture-private.json'),true);$g=json_decode(file_get_contents($d.'/guard-private.json'),true);if(!preg_match('/^mhc_p4_probe_[a-f0-9]{8}$/',$m['schema'])||!preg_match('/^p4probe_[a-f0-9]{8}$/',$m['user']))throw new Exception('P4_SYNTHETIC_FIXTURE_ONLY');$sock=getenv('PREFIX').'/var/run/mysqld.sock';$schema=$m['schema'];
$root=new mysqli('localhost','root','',$schema,0,$sock);$root->query('CREATE TABLE IF NOT EXISTS gate_probe(id INT PRIMARY KEY,val INT) ENGINE=InnoDB');$root->query('DELETE FROM gate_probe');foreach($g['statements'] as $s)$root->query(str_replace('CREATE DEFINER','CREATE OR REPLACE DEFINER',$s));
$app=new mysqli('localhost',$m['user'],$m['password'],$schema,0,$sock);$tests=[];
function denied($fn,$code){try{$fn();return false;}catch(mysqli_sql_exception $e){return str_contains($e->getMessage(),$code);}}
$tests['closedDeny']=denied(fn()=>$app->query('INSERT INTO gate_probe VALUES(1,1)'),'MHC_P4_LEASE_REQUIRED');
$keeper=new mysqli('localhost','root','',$schema,0,$sock);$keeper->query('SET SESSION wait_timeout=8');$keeper->query("SELECT GET_LOCK('".$g['lockName']."',0)");
$app->query('INSERT INTO gate_probe VALUES(1,1)');$tests['openAutocommitAllowed']=true;
$app->begin_transaction();$tests['explicitTransactionDenied']=denied(fn()=>$app->query('INSERT INTO gate_probe VALUES(2,2)'),'MHC_P4_EXPLICIT_TRANSACTION_DENIED');$app->rollback();
$app->autocommit(false);$tests['autocommitOffDenied']=denied(fn()=>$app->query('INSERT INTO gate_probe VALUES(3,3)'),'MHC_P4_EXPLICIT_TRANSACTION_DENIED');$app->rollback();$app->autocommit(true);
$keeper->query('DO 1');$tests['longStatementRejectedAfterGateExpires']=denied(fn()=>$app->query('UPDATE gate_probe SET val=99+SLEEP(6) WHERE id=1'),'MHC_P4_LEASE_REQUIRED');
$tests['afterTriggerRolledBackData']=$root->query('SELECT val FROM gate_probe WHERE id=1')->fetch_assoc()['val']==='1';
$tests['ownerStillExistsWhenFreshnessExpired']=$root->query("SELECT IS_USED_LOCK('".$g['lockName']."') AS owner")->fetch_assoc()['owner']!==null;
$tests['oldConnectionDmlDenied']=denied(fn()=>$app->query('UPDATE gate_probe SET val=2 WHERE id=1'),'MHC_P4_LEASE_REQUIRED');
sleep(3);$tests['ownerReleasedByDatabaseTimeout']=$root->query("SELECT IS_USED_LOCK('".$g['lockName']."') AS owner")->fetch_assoc()['owner']===null;
$app->query("SELECT GET_LOCK('".$g['lockName']."',0)");$tests['appCannotPretendRootKeeper']=denied(fn()=>$app->query('UPDATE gate_probe SET val=2 WHERE id=1'),'MHC_P4_LEASE_REQUIRED');$app->query("DO RELEASE_LOCK('".$g['lockName']."')");
$root->query('INSERT INTO gate_probe VALUES(9,9)');$tests['rootMaintenanceSeparate']=true;
if(in_array(false,$tests,true))throw new Exception('P4_NATIVE_SQL_EXPECTATION_FAILED');echo json_encode(['tests'=>$tests,'managedDatabaseUntouched'=>true]);
