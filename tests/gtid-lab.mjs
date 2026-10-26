// GTID LAB status + safe plan tests; fake MariaDB, no actual SQL writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const ROOT=path.resolve(process.argv[2]||'.');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-gtid-lab-'));
const HOME=path.join(work,'home'),BIN=path.join(work,'bin'),CLI=path.join(ROOT,'bin/gtid-lab.mjs');
let checks=0;
function run(args,scenario='healthy',expect=0){
 const r=spawnSync(process.execPath,[CLI,...args],{encoding:'utf8',timeout:16000,
  env:{...process.env,HOME,PATH:BIN+':'+process.env.PATH,PREFIX:'/data/data/com.termux/files/usr',GTID_TEST_SCENARIO:scenario}});
 assert.equal(r.status,expect,`${args.join(' ')}: ${r.stderr}`);checks++;
 const content=r.stdout+r.stderr;
 assert(!content.includes('TOP_SECRET_HOST'));assert(!content.includes('TOP_SECRET_USER'));assert(!content.includes('TOP_SECRET_PASSWORD'));checks+=3;
 return expect===0?JSON.parse(r.stdout):r.stderr;
}
try{
 fs.mkdirSync(path.join(HOME,'.config/mhc-full-installer'),{recursive:true});
 fs.mkdirSync(BIN,{recursive:true});
 fs.writeFileSync(path.join(HOME,'.config/mhc-full-installer/installed'),'TEST 0.4.0A installed on clean Termux\n');
 fs.writeFileSync(path.join(BIN,'mariadb'),`#!/bin/sh
case "$*" in
  *SELECT*) printf '502\\t1\\t1\\t1\\t0-502-145\\t0-501-133\\n';;
  *ALL*)
    case "$GTID_TEST_SCENARIO" in
      empty) exit 0;;
      stopped) IO=No; SQL=Yes; SECONDS=NULL; ERR=1045;;
      healthy) IO=Yes; SQL=Yes; SECONDS=3; ERR=0;;
      multichannel) IO=Yes; SQL=Yes; SECONDS=3; ERR=0;;
      bad) printf '*************************** 1. row ***************************\\n'; printf 'Unrecognized: TOP_SECRET_PASSWORD\\n'; exit 0;;
    esac
    printf '*************************** 1. row ***************************\\n'
    printf 'Master_Host: TOP_SECRET_HOST\\nMaster_User: TOP_SECRET_USER\\nMaster_Password: TOP_SECRET_PASSWORD\\n'
    printf 'Slave_IO_Running: %s\\nSlave_SQL_Running: %s\\nSeconds_Behind_Master: %s\\n' "$IO" "$SQL" "$SECONDS"
    printf 'Using_Gtid: Slave_Pos\\nLast_IO_Errno: %s\\nLast_SQL_Errno: 0\\nMaster_Server_Id: 501\\n' "$ERR"
    if [ "$GTID_TEST_SCENARIO" = multichannel ]; then
      printf '*************************** 2. row ***************************\\n'
      printf 'Slave_IO_Running: Yes\\nSlave_SQL_Running: Yes\\nUsing_Gtid: Slave_Pos\\n';
    fi;;
esac
`,{mode:0o700});
 let out=run(['lab-status']);assert.equal(out.mode,'STREAMS_RUNNING_UNVERIFIED');checks++;
 assert.equal(out.channelCount,1);assert.equal(out.channels[0].lagSeconds,3);checks+=2;
 assert.equal(out.continuousReplicationVerified,false);assert.equal(out.haEligible,false);checks+=2;
 out=run(['lab-status'],'stopped');assert.equal(out.mode,'CONFIGURED_NEEDS_REVIEW');checks++;
 assert.equal(out.channels[0].lagSeconds,null);assert.equal(out.channels[0].errorObserved,true);checks+=2;
 out=run(['lab-status'],'empty');assert.equal(out.mode,'NOT_CONFIGURED');checks++;
 out=run(['lab-status'],'multichannel');assert.equal(out.channelCount,2);checks++;
 out=run(['lab-plan','source','502']);assert.equal(out.applied,false);checks++;
 const p=out.template;const content=fs.readFileSync(p,'utf8');
 assert.match(content,/server_id=502/);assert.match(content,/binlog_format=ROW/);checks+=2;
 assert.equal(fs.statSync(p).mode&0o777,0o600);checks++;
 assert.equal(run(['lab-plan','source','502'],'healthy',1).includes('EEXIST'),true);checks++;
 out=run(['lab-plan','replica','501']);assert.equal(out.applied,false);checks++;
 assert.match(fs.readFileSync(out.template,'utf8'),/read_only=ON/);checks++;
 for(const id of ['0','-1','12;DROP','4294967296','002','test']){
  assert.match(run(['lab-plan','source',id],'healthy',1),/Invalid server-id/);checks++;
 }
 fs.mkdirSync(path.join(HOME,'apps/thophuongpro'),{recursive:true});
 fs.writeFileSync(path.join(HOME,'apps/thophuongpro/.env'),'PRODUCTION_SECRET');
 assert.match(run(['lab-plan','source','503'],'healthy',1),/STOP/);checks++;
 fs.rmSync(path.join(HOME,'apps/thophuongpro/.env'));
 fs.writeFileSync(path.join(HOME,'.config/mhc-full-installer/install-incomplete'),'partial');
 assert.match(run(['lab-plan','source','504'],'healthy',1),/STOP/);checks++;
 console.log(`PASS: v0.4B.1 ${checks} GTID LAB assertions (sanitized multi-channel replica status, lag/error, guarded config template, no DB writes)`);
}finally{fs.rmSync(work,{recursive:true,force:true});}
