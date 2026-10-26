// Integration tests run on isolated local temporary LAB homes and fake MariaDB ONLY.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const ROOT=path.resolve(process.argv[2]||'.'), T=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-d-'));
const SOURCE=path.join(T,'source'),DEST=path.join(T,'receiver'),BIN=path.join(T,'bin');let checks=0;
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const make=(p,contents)=>{fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,contents);};
function run(file,args,home,step='recovered',expected=0){const r=spawnSync(process.execPath,[path.join(ROOT,'bin',file),...args],{encoding:'utf8',timeout:30000,env:{...process.env,HOME:home,PATH:BIN+path.delimiter+process.env.PATH,D_MOCK_STEP:step}});
 if(r.status!==expected)throw Error(`Unexpected exit ${r.status}, expected ${expected}: ${file} ${args.join(' ')} \n${r.stderr}\n${r.stdout}`);
 return expected===0?JSON.parse(r.stdout):r.stderr;}
const d=(args,step='recovered',expected=0)=>run('lab-acceptance-gate.mjs',args,DEST,step,expected);
const f=(script,args,home=DEST)=>run(script,args,home,'recovered');
try{
 fs.mkdirSync(BIN,{recursive:true});
 make(path.join(BIN,'mariadb'),`#!/bin/sh
s=""
prev=""
for a in "$@"; do
 if [ "$prev" = '-e' ]; then s="$a"; break; fi
 prev="$a"
done
case "$s" in
 *SHOW*SLAVES*STATUS*|*SHOW*SLAVE*STATUS*)
   if [ "$D_MOCK_STEP" = outage ]; then io='No'; else io='Yes'; fi
   printf '*************************** 1. row ***************************\\nSlave_IO_Running: %s\\nSlave_SQL_Running: Yes\\nUsing_Gtid: Slave_Pos\\nSeconds_Behind_Master: 0\\nLast_IO_Errno: 0\\nLast_SQL_Errno: 0\\n' "$io";;
 *SELECT*SCHEMA_NAME*) printf 'mysql\\ninformation_schema\\nperformance_schema\\nmhc_lab_trial\\n';;
 *SELECT*@@global.server_id*,*@@global.log_bin*,*@@global.gtid_strict_mode*,*@@global.read_only*,*@@global.binlog_format*) printf '202\\t1\\t1\\t1\\tROW\\n';;
 *SELECT*@@global.server_id*,*@@global.log_bin*,*@@global.read_only*,*@@global.gtid_strict_mode*)
   printf '202\\t1\\t1\\t1\\t\\t0-101-15\\n';;
 *SELECT*@@global.read_only*) printf '1\\n';;
 *SELECT*@@global.gtid_slave_pos*)
   if [ "$D_MOCK_STEP" = baseline ] || [ "$D_MOCK_STEP" = outage ]; then printf '0-101-12\\n';else printf '0-101-15\\n';fi;;
 *SELECT*@@global.gtid_binlog_pos*) printf '0-101-15\\n';;
 *SELECT*probe_value*)
   case "$s" in *aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa*) printf 'cccccccccccccccccccccccccccccccc\\n';; *bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb*) printf 'dddddddddddddddddddddddddddddddd\\n';; esac;;
 *) exit 2;;
esac
`);fs.chmodSync(path.join(BIN,'mariadb'),0o700);
 for(const h of [SOURCE,DEST]){make(path.join(h,'.config/mhc-full-installer/installed'),'TEST 0.4.0C3 installed on clean Termux\n');fs.chmodSync(path.join(h,'.config/mhc-full-installer/installed'),0o600);fs.mkdirSync(path.join(h,'mhc-file-lab'),{recursive:true});}
 const proof=(id,value,before,after)=>({scope:'MHC_GTID_ACCEPTANCE_LAB_ONLY',serverId:101,database:'mhc_lab_trial',probeId:id,value,beforeGtid:before,afterGtid:after,createdAt:new Date().toISOString()});
 const p1=path.join(DEST,'proof-a.json'),p2=path.join(DEST,'proof-b.json');
 make(p1,JSON.stringify(proof('a'.repeat(32),'c'.repeat(32),'0-101-11','0-101-12')));fs.chmodSync(p1,0o600);
 make(p2,JSON.stringify(proof('b'.repeat(32),'d'.repeat(32),'0-101-12','0-101-15')));fs.chmodSync(p2,0o600);
 eq(d(['disconnected'],'outage',1).includes('Record baseline'),true,'cannot begin with outage');
 eq(d(['baseline',p1],'baseline').phase,'baseline','baseline observed');
 eq(d(['baseline',p1],'baseline',1).includes('cannot be overwritten'),true,'no rewrite baseline');
 eq(d(['disconnected'],'baseline',1).includes('not observed'),true,'require real IO down');
 eq(d(['disconnected'],'outage').outageObserved,true,'observed real IO down');
 eq(d(['recovered',p1,'--confirm=SECOND_SOURCE_PROBE_CREATED_DURING_OUTAGE'],'recovered',1).includes('catch-up NOT proven'),true,'reject same proof');
 eq(d(['recovered',p2,'--confirm=WRONG'],'recovered',1).includes('confirmation'),true,'operator confirmation');
 eq(d(['recovered',p2,'--confirm=SECOND_SOURCE_PROBE_CREATED_DURING_OUTAGE'],'baseline',1).includes('catch-up NOT proven'),true,'reject stale replica position');
 eq(d(['recovered',p2,'--confirm=SECOND_SOURCE_PROBE_CREATED_DURING_OUTAGE']).distinctNewProbe,true,'second GTID and row verified');
 eq(d(['report']).review,'LAB_EVIDENCE_INCOMPLETE_OR_STALE','files not ready');
 // Create the exact C1->C2->C3 offline handoff (no live or production files altered).
 const src=path.join(SOURCE,'mhc-file-lab'),dst=path.join(DEST,'mhc-file-lab');
 make(path.join(src,'source/sheets/1.musicxml'),'sheet-v1');make(path.join(dst,'replica/sheets/1.musicxml'),'sheet-v1');
 const manifest=f('file-delta-lab.mjs',['manifest','replica']);
 fs.mkdirSync(path.join(src,'reports'),{recursive:true});fs.copyFileSync(path.join(dst,'reports',path.basename(manifest.path)),path.join(src,'reports',path.basename(manifest.path)));
 make(path.join(src,'source/sheets/1.musicxml'),'sheet-v2');make(path.join(src,'source/uploads/x.png'),'new');
 const id=f('file-delta-lab.mjs',['bundle',path.basename(manifest.path)],SOURCE).id;
 eq(f('file-consistent-lab.mjs',['checkpoint-create',id,'--confirm=QUIESCED_LAB_ONLY'],SOURCE).status,'LAB_CHECKPOINT_RECORDED_NOT_ATOMIC','source checkpoint is not atomic');
 f('file-peer-lab.mjs',['peer-init']);f('file-peer-lab.mjs',['peer-prepare',id,'100']);
 fs.cpSync(path.join(src,'outbox',id),path.join(dst,'inbox/pending-'+id),{recursive:true});
 eq(f('file-peer-lab.mjs',['peer-finalize',id]).status,'RECEIVED_VERIFIED_NOT_APPLIED','receiver verified handoff');
 eq(f('file-delta-lab.mjs',['stage',id]).status,'CANDIDATE_VERIFIED_OFFLINE','stage verified');
 eq(f('file-consistent-lab.mjs',['apply-offline',id,'--confirm=OFFLINE_LAB_APPLY']).status,'OFFLINE_VERSIONED_LAB_COPY_NOT_LIVE','offline apply');
 eq(d(['files',id]).fileEvidenceRecorded,true,'file candidate rehashed');
 const good=d(['report']);eq(good.review,'LAB_EVIDENCE_COMPLETE_HUMAN_REVIEW_REQUIRED','lab review gate');eq(good.haEligible,false,'no HA authorization');eq(good.atomicDatabaseFileSnapshotVerified,false,'not atomic');
 eq(d(['files',id], 'recovered',1).includes('one offline file version'),true,'no overwrite evidence');
 make(path.join(dst,'applied',id,'uploads/x.png'),'tampered');
 eq(d(['report']).review,'LAB_EVIDENCE_INCOMPLETE_OR_STALE','detect offline tampering');
 eq(d(['report']).fileVerified,false,'never claim verified after tampering');
 make(path.join(dst,'applied',id,'uploads/x.png'),'new');
 eq(d(['report']).fileVerified,true,'rehash after restoration');
 make(path.join(DEST,'.config/mhc-full-installer/static/demo.conf'),'registered');
 eq(d(['report'],'recovered',1).includes('managed website'),true,'production/living-site guard');
 console.log(`PASS: v0.4D ${checks} strict LAB E2E evidence assertions; no network, SQL writes, live apply or HA`);
}finally{fs.rmSync(T,{recursive:true,force:true});}
