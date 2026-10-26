import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {parseGtid,progressed,caughtUp} from '../bin/gtid-acceptance.mjs';
const ROOT=path.resolve(process.argv[2]||'.');
const ENTRY=path.join(ROOT,'bin/gtid-acceptance.mjs');
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-b4-'));
const HOME=path.join(TMP,'home'),BIN=path.join(TMP,'bin');
const DB='mhc_lab_trial',MARK=path.join(HOME,'.config/mhc-full-installer/installed');
const state=path.join(TMP,'state');
let assertions=0;
function eq(actual,expected){assert.deepEqual(actual,expected);assertions++;}
function mkdir(x){fs.mkdirSync(x,{recursive:true,mode:0o700});}
function run(args,role='source',scenario='ok',expect=0){const r=spawnSync(process.execPath,[ENTRY,...args],{encoding:'utf8',timeout:20000,env:{...process.env,HOME,PATH:BIN+':'+process.env.PATH,MOCK_ROLE:role,MOCK_SCENARIO:scenario,MOCK_STATE:state}});if(r.status!==expect)console.error('B4 TEST DEBUG',args,role,scenario,r.stdout,r.stderr);eq(r.status,expect);return r.status===0?JSON.parse(r.stdout):r.stderr;}
try{
 mkdir(path.dirname(MARK));mkdir(BIN);mkdir(state);
 fs.writeFileSync(MARK,'TEST 0.4.0B3 installed on clean Termux\n',{mode:0o600});
 const stub=`#!/bin/sh
s=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-e" ]; then s="$a"; break; fi
  prev="$a"
done
if [ -z "$s" ]; then
  s="$(cat)"
  case "$s" in
    *CREATE*TABLE*) touch "$MOCK_STATE/table"; exit 0;;
    *INSERT*INTO*) printf '0-101-12' > "$MOCK_STATE/gtid";
      printf '%s\\n' "$s" > "$MOCK_STATE/write";
      sed -n "s/.*VALUES ('\\([a-f0-9]*\\)','\\([a-f0-9]*\\)').*/\\1 \\2/p" "$MOCK_STATE/write" > "$MOCK_STATE/row";exit 0;;
  esac
  exit 2
fi
case "$s" in
 *SHOW*SLAVES*STATUS*|*SHOW*SLAVE*STATUS*)
  if [ "$MOCK_ROLE" = 'replica' ];then
   if [ "$MOCK_SCENARIO" = 'outage' ];then io='No';else io='Yes';fi
   printf '*************************** 1. row ***************************\\nSlave_IO_Running: %s\\nSlave_SQL_Running: Yes\\nUsing_Gtid: Slave_Pos\\nSeconds_Behind_Master: 0\\nLast_IO_Errno: 0\\nLast_SQL_Errno: 0\\n' "$io"
  fi ;;
 *SELECT*server_id*,*gtid_binlog_pos*,*gtid_slave_pos*)
  if [ "$MOCK_ROLE" = 'replica' ];then printf '202\\t1\\t1\\t1\\t\\t0-101-12\\n';else printf '101\\t1\\t0\\t1\\t0-101-12\\t\\n';fi;;
 *SELECT*server_id*,*binlog_format*)
  if [ "$MOCK_ROLE" = 'replica' ];then printf '202\\t1\\t1\\t1\\tROW\\n';else printf '101\\t1\\t1\\t0\\tROW\\n';fi;;
 *SCHEMA_NAME*) printf 'mysql\\ninformation_schema\\nperformance_schema\\n%s\\n' '${DB}';;
 *SELECT*@@global.gtid_binlog_pos*) if [ -f "$MOCK_STATE/gtid" ];then cat "$MOCK_STATE/gtid";else printf '0-101-10';fi;;
 *SELECT*@@global.gtid_slave_pos*) if [ "$MOCK_SCENARIO" = 'lag' ];then printf '0-101-11';else printf '0-101-12';fi;;
 *SELECT*probe_value*) if [ -f "$MOCK_STATE/row" ];then awk '{print $2}' "$MOCK_STATE/row";fi;;
 *) exit 2;;
esac
`;
 fs.writeFileSync(path.join(BIN,'mariadb'),stub,{mode:0o700});
 eq(parseGtid('0-101-12,1-7-4').size,2);
 eq(progressed('0-101-10','0-101-12'),true);
 eq(progressed('0-101-12','0-101-10'),false);
 eq(caughtUp('0-101-12','0-101-12,1-10-2'),true);
 eq(caughtUp('0-101-12','0-101-11'),false);
 eq(run(['source-plan',DB]).mode,'SOURCE_LAB_PRECHECK_ONLY');
 eq(run(['source-probe',DB,'--confirm=bad'],'source','ok',1).includes('confirmation'),true);
 const result=run(['source-probe',DB,'--confirm=WRITE_DEDICATED_GTID_LAB_PROBE']);
 eq(result.sourceGtidAdvanced,true);eq(result.replicaProven,false);eq(fs.existsSync(result.proofFile),true);
 eq(fs.statSync(result.proofFile).mode&0o077,0);
 const proof=JSON.parse(fs.readFileSync(result.proofFile));
 eq(proof.afterGtid,'0-101-12');eq(proof.database,DB);
 eq(run(['replica-check',result.proofFile],'replica').validationPassed,true);
 eq(run(['replica-check',result.proofFile],'replica','lag').validationPassed,false);
 eq(run(['outage-sample','baseline',result.proofFile],'replica').sampleCount,1);
 eq(run(['outage-sample','disconnected',result.proofFile],'replica','ok',1).includes('Disconnect not observed'),true);
 eq(run(['outage-sample','disconnected',result.proofFile],'replica','outage').sampleCount,2);
 eq(run(['outage-sample','reconnected',result.proofFile],'replica').sampleCount,3);
 eq(run(['outage-report'],'replica').completed,true);
 eq(run(['outage-sample','baseline',result.proofFile],'replica','ok',1).includes('incompatible'),true);
 // Sensitive/invalid/mutated proof must be rejected.
 const saved=fs.readFileSync(result.proofFile,'utf8');fs.writeFileSync(result.proofFile,saved.replace('0-101-12','0-101-99'));
 eq(run(['replica-check',result.proofFile],'replica','ok',0).validationPassed,false);
 fs.writeFileSync(result.proofFile,saved.replace('mhc_lab_trial','thophuong_pro'));
 eq(run(['replica-check',result.proofFile],'replica','ok',1).includes('Invalid LAB probe proof'),true);
 fs.writeFileSync(result.proofFile,saved);
 fs.chmodSync(result.proofFile,0o644);
 eq(run(['replica-check',result.proofFile],'replica','ok',1).includes('0600'),true);
 fs.chmodSync(result.proofFile,0o600);
 mkdir(path.join(HOME,'apps/thophuongpro'));fs.writeFileSync(path.join(HOME,'apps/thophuongpro/.env'),'SENSITIVE');
 eq(run(['source-plan',DB],'source','ok',1).includes('STOP'),true);
 console.log(`PASS: GTID acceptance LAB ${assertions} assertions (source transaction, replica data+GTID, outage phases, guards)`);
}finally{fs.rmSync(TMP,{recursive:true,force:true});}
