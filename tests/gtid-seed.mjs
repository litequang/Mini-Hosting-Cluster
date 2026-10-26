import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const ROOT=path.resolve(process.argv[2]||'.');
const ENTRY=path.join(ROOT,'bin/gtid-seed.mjs');
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-seed-test-'));
const HOME=path.join(TMP,'home'),BIN=path.join(TMP,'bin');
const STATUS=path.join(HOME,'.config/mhc-full-installer');
let assertions=0;
const mkdir=p=>fs.mkdirSync(p,{recursive:true,mode:0o700});
const check=(val,expected)=>{assert.deepEqual(val,expected);assertions++;};
function cmd(args,scenario='ok',code=0){
 const run=spawnSync(process.execPath,[ENTRY,...args],{env:{...process.env,HOME,PATH:BIN+':'+process.env.PATH,
  PREFIX:'/data/data/com.termux/files/usr',SEED_SCENARIO:scenario},encoding:'utf8',timeout:18000});
 if(run.status!==code)console.error('TEST DEBUG',args,scenario,'stdout=',run.stdout,'stderr=',run.stderr);
 check(run.status,code);
 for(const secret of ['SEED_SECRET_PASSWORD','SECRET_MASTER_HOST']){
  assert(!`${run.stdout}${run.stderr}`.includes(secret));assertions++;
 }
 return code===0?JSON.parse(run.stdout):`${run.stdout}${run.stderr}`;
}
try{
 mkdir(STATUS);mkdir(BIN);mkdir(path.join(HOME,'.local/share/mhc-full-installer'));
 fs.writeFileSync(path.join(STATUS,'installed'),'TEST 0.4.0B1 installed on clean Termux\n');
 fs.writeFileSync(path.join(BIN,'mariadb'),`#!/bin/sh
case "$*" in
 *SCHEMA_NAME*) case "$SEED_SCENARIO" in otherdb) printf 'mysql\\nperformance_schema\\nwp_live\\nmhc_lab_seed\\n';; *) printf 'mysql\\nperformance_schema\\nmhc_lab_seed\\n';; esac ;;
 *TABLE_TYPE*) case "$SEED_SCENARIO" in myisam) printf 'BASE TABLE\\tMyISAM\\n';; *) printf 'BASE TABLE\\tInnoDB\\n';; esac ;;
 *binlog_format*) case "$SEED_SCENARIO" in no_binlog) printf '101\\t0\\t1\\t0\\tROW\\n';; *) printf '101\\t1\\t1\\t0\\tROW\\n';; esac ;;
 *ALL*|*SLAVE*) exit 0 ;;
 *gtid_slave_pos*) printf '0-101-10\\n' ;;
 *) printf '101\\t1\\t0\\t1\\t0-101-10\\t\\n' ;;
esac
`,{mode:0o700});
 fs.writeFileSync(path.join(BIN,'mariadb-dump'),`#!/bin/sh
case "$SEED_SCENARIO" in
 nodumpgtid) printf '%s\\n' '-- CHANGE MASTER TO MASTER_LOG_FILE=\u0027bin.001\u0027, MASTER_LOG_POS=123;' 'CREATE TABLE t (id INT);';;
 faildump) printf '%s\\n' 'SEED_SECRET_PASSWORD' >&2; exit 1;;
 *) printf '%s\\n' '-- MariaDB dump' '-- CHANGE MASTER TO MASTER_LOG_FILE=\u0027bin.001\u0027, MASTER_LOG_POS=123;' "-- SET GLOBAL gtid_slave_pos='0-101-10';" 'CREATE DATABASE IF NOT EXISTS mhc_lab_seed;' 'USE mhc_lab_seed;' 'CREATE TABLE t(id INT);';;
esac
`,{mode:0o700});
 const confirm='--confirm=CAPTURE_CONSISTENT_LAB_GTID_SEED';
 check(cmd(['seed-summary']).mode,'NO_SEED');
 check(cmd(['seed-capture','mhc_lab_seed','--confirm=wrong'],'ok',1).includes('GTID_SEED_ERROR'),true);
 check(cmd(['seed-capture','wp_production',confirm],'ok',1).includes('GTID_SEED_ERROR'),true);
 check(cmd(['seed-capture','mhc_lab_seed',confirm],'otherdb',1).includes('GTID_SEED_ERROR'),true);
 check(cmd(['seed-capture','mhc_lab_seed',confirm],'myisam',1).includes('GTID_SEED_ERROR'),true);
 check(cmd(['seed-capture','mhc_lab_seed',confirm],'no_binlog',1).includes('GTID_SEED_ERROR'),true);
 check(cmd(['seed-capture','mhc_lab_seed',confirm],'nodumpgtid',1).includes('GTID_SEED_ERROR'),true);
 check(cmd(['seed-capture','mhc_lab_seed',confirm],'faildump',1).includes('GTID_SEED_ERROR'),true);
 const cap=cmd(['seed-capture','mhc_lab_seed',confirm]);
 check(cap.mode,'SEED_VERIFIED_OFFLINE_ONLY');check(cap.captured,true);check(cap.dumpGtid,'0-101-10');
 check(cap.replicationRunning,false);check(cap.haEligible,false);
 const stat=fs.statSync(path.join(cap.path,'seed.sql'));
 check(stat.mode&0o777,0o600);
 check(cmd(['seed-verify',cap.path]).sha256Verified,true);
 const rev=cmd(['seed-review',cap.path]);
 check(rev.sourceSeedGtid,'0-101-10');check(rev.dataConvergenceVerified,false);
 check(cmd(['seed-summary']).seedCount,1);
 fs.appendFileSync(path.join(cap.path,'seed.sql'),'SQL TAMPERED!');
 check(cmd(['seed-verify',cap.path],'ok',1).includes('GTID_SEED_ERROR'),true);
 const fake=path.join(HOME,'apps/thophuongpro');mkdir(fake);fs.writeFileSync(path.join(fake,'.env'),'SEED_SECRET_PASSWORD');
 check(cmd(['seed-capture','mhc_lab_seed',confirm],'ok',1).includes('GTID_SEED_ERROR'),true);
 fs.rmSync(path.join(fake,'.env'));
 const incomplete=path.join(STATUS,'install-incomplete');fs.writeFileSync(incomplete,'YES');
 check(cmd(['seed-capture','mhc_lab_seed',confirm],'ok',1).includes('GTID_SEED_ERROR'),true);
 console.log(`PASS: v0.4B.2 ${assertions} seed assertions (confirmed consistent dump, GTID coordinates, SQL+SHA256, prohibited production/partial, no DB import or HA)`);
}finally{fs.rmSync(TMP,{force:true,recursive:true});}
