import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync,spawn} from 'node:child_process';
import net from 'node:net';
const ROOT=path.resolve(process.argv[2]||'.'),ENTRY=path.join(ROOT,'bin/gtid-replica.mjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-replica-test-'));
const HOME=path.join(temp,'home'),BIN=path.join(temp,'bin'),SEED=path.join(HOME,'gtid-seeds/seed-12345678-aaaa-4444-aaaa-0123456789ab');
const MARK=path.join(HOME,'.config/mhc-full-installer/installed');
const PROFILE=path.join(HOME,'replica-profile.json');
const STATE=path.join(temp,'attached'),SQLLOG=path.join(temp,'sql.log');
const SECRET='PRIVATE_LAB_SECRET_123456789';let count=0;
function mkdir(p){fs.mkdirSync(p,{recursive:true,mode:0o700});}
function eq(actual,expected){assert.deepEqual(actual,expected);count++;}
function call(args,scenario='ok',code=0){
 const r=spawnSync(process.execPath,[ENTRY,...args],{encoding:'utf8',timeout:15000,env:{...process.env,HOME,PATH:BIN+':'+process.env.PATH,REPLICA_SCENARIO:scenario,TEST_REPLICA_STATE:STATE,TEST_REPLICA_SQL:SQLLOG}});
 if(r.status!==code)console.error('FAIL DETAIL:',args,scenario,r.stdout,r.stderr);
 eq(r.status,code);
 eq((r.stdout+r.stderr).includes(SECRET),false);
 return code===0?JSON.parse(r.stdout):r.stderr;
}
try{
 mkdir(path.dirname(MARK));mkdir(BIN);mkdir(SEED);
 fs.writeFileSync(MARK,'TEST 0.4.0B2 installed on clean Termux\n',{mode:0o600});
 const sql="-- MariaDB dump\n-- SET GLOBAL gtid_slave_pos='0-101-10';\nCREATE TABLE t(id INT);\n";
 fs.writeFileSync(path.join(SEED,'seed.sql'),sql,{mode:0o600});
 const meta={schema:1,scope:'MHC_GTID_SEED_LAB_ONLY',seedId:'12345678-aaaa-4444-aaaa-0123456789ab',database:'mhc_lab_seed',
  sourceServerId:101,dumpGtid:'0-101-10',transactionalTables:1,bytes:Buffer.byteLength(sql),sha256:crypto.createHash('sha256').update(sql).digest('hex')};
 fs.writeFileSync(path.join(SEED,'seed.json'),JSON.stringify(meta),{mode:0o600});
 fs.writeFileSync(PROFILE,JSON.stringify({scope:'MHC_GTID_REPLICA_LAB_ONLY',host:'127.0.0.1',port:33307,user:'mhc_repl_lab',password:SECRET}),{mode:0o600});
 const stub=`#!/bin/sh
case "$*" in
  *SCHEMA_NAME*) if [ "$REPLICA_SCENARIO" = otherdb ]; then printf 'mysql\\nperformance_schema\\nmhc_lab_seed\\nwp_live\\n';else printf 'mysql\\nperformance_schema\\nmhc_lab_seed\\n';fi;;
  *TABLE_TYPE*) printf 'BASE TABLE\\tInnoDB\\n';;
  *binlog_format*) case "$REPLICA_SCENARIO" in
    badgtid) printf '202\\t1\\t1\\t1\\tROW\\t0-101-9\\t\\n';;
    readonly_off) printf '202\\t1\\t1\\t0\\tROW\\t0-101-10\\t\\n';;
    locals) printf '202\\t1\\t1\\t1\\tROW\\t0-101-10\\t0-202-1\\n';;
    sameid) printf '101\\t1\\t1\\t1\\tROW\\t0-101-10\\t\\n';;
    *) printf '202\\t1\\t1\\t1\\tROW\\t0-101-10\\t\\n';;esac;;
  *SHOW*SLAVE*STATUS*) if [ -f "$TEST_REPLICA_STATE" ] || [ "$REPLICA_SCENARIO" = configured ]; then printf '*************************** 1. row ***************************\\nSlave_IO_Running: Yes\\nSlave_SQL_Running: Yes\\nUsing_Gtid: Slave_Pos\\nSeconds_Behind_Master: 0\\nLast_IO_Errno: 0\\nLast_SQL_Errno: 0\\n';fi;;
  *SELECT*server_id*) printf '202\\t1\\t1\\t1\\t\\t0-101-10\\n';;
  *) if [ "$REPLICA_SCENARIO" = denywrite ]; then exit 2;fi
    cat >> "$TEST_REPLICA_SQL"; touch "$TEST_REPLICA_STATE";;
esac
`;
 fs.writeFileSync(path.join(BIN,'mariadb'),stub,{mode:0o700});
 let p=call(['replica-plan',SEED]);eq(p.mode,'SEED_RESTORED_PRECHECK_ONLY');eq(p.replicaServerId,202);eq(p.haEligible,false);
 eq(call(['replica-attach',SEED,PROFILE,'--confirm=wrong'],'ok',1).includes('confirmation'),true);
 for(const scenario of ['badgtid','readonly_off','locals','sameid','otherdb','configured']){
  eq(call(['replica-plan',SEED],scenario,1).includes('GTID_REPLICA_LAB_ERROR'),true);
 }
 const password=JSON.parse(fs.readFileSync(PROFILE,'utf8')).password;
 fs.chmodSync(PROFILE,0o644);
 eq(call(['replica-plan',SEED]).mode,'SEED_RESTORED_PRECHECK_ONLY');
 eq(call(['replica-attach',SEED,PROFILE,'--confirm=ATTACH_ISOLATED_GTID_REPLICA_LAB'],'ok',1).includes('0600'),true);
 fs.chmodSync(PROFILE,0o600);
 fs.writeFileSync(PROFILE,JSON.stringify({scope:'MHC_GTID_REPLICA_LAB_ONLY',host:'192.168.1.1',port:33307,user:'mhc_repl_lab',password}),{mode:0o600});
 eq(call(['replica-attach',SEED,PROFILE,'--confirm=ATTACH_ISOLATED_GTID_REPLICA_LAB'],'ok',1).includes('Invalid private profile'),true);
 fs.writeFileSync(PROFILE,JSON.stringify({scope:'MHC_GTID_REPLICA_LAB_ONLY',host:'127.0.0.1',port:33307,user:'mhc_repl_lab',password}),{mode:0o600});
 // No localhost listener -> refused. Never applies SQL.
 eq(call(['replica-attach',SEED,PROFILE,'--confirm=ATTACH_ISOLATED_GTID_REPLICA_LAB'],'ok',1).includes('SSH local port forward'),true);
 // Success path: local mock listener represents an administrator's independent SSH forward.
 const listener=net.createServer(socket=>socket.end());
 await new Promise(resolve=>listener.listen(33307,'127.0.0.1',resolve));
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[ENTRY,'replica-attach',SEED,PROFILE,'--confirm=ATTACH_ISOLATED_GTID_REPLICA_LAB'],
   {env:{...process.env,HOME,PATH:BIN+':'+process.env.PATH,TEST_REPLICA_STATE:STATE,TEST_REPLICA_SQL:SQLLOG}});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  child.on('error',reject);child.on('close',status=>resolve({status,stdout,stderr}));
 });
 await new Promise(resolve=>listener.close(resolve));
 eq(result.status,0);eq(result.stderr.includes(SECRET),false);
 const applied=JSON.parse(result.stdout);eq(applied.mode,'REPLICA_ATTACH_ATTEMPTED');
 eq(applied.ioRunning,true);eq(applied.sqlRunning,true);eq(applied.haEligible,false);
 const appliedSql=fs.readFileSync(SQLLOG,'utf8');eq(appliedSql.includes('MASTER_USE_GTID=slave_pos'),true);
 eq(appliedSql.includes('START SLAVE'),true);eq(appliedSql.includes(SECRET),true);
 eq(call(['replica-observe']).haEligible,false);
 eq(call(['replica-plan',SEED],'ok',1).includes('Existing replication channel'),true);
 fs.appendFileSync(path.join(SEED,'seed.sql'),'tamper');
 eq(call(['replica-plan',SEED],'ok',1).includes('GTID_REPLICA_LAB_ERROR'),true);
 fs.writeFileSync(path.join(SEED,'seed.sql'),sql,{mode:0o600});
 mkdir(path.join(HOME,'apps/thophuongpro'));fs.writeFileSync(path.join(HOME,'apps/thophuongpro/.env'),'production!');
 eq(call(['replica-plan',SEED],'ok',1).includes('STOP'),true);
 console.log(`PASS: GTID replica LAB ${count} assertions (private seed, GTID, dedicated DB, no channels, peer guard, profile secrets, no automatic HA)`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
