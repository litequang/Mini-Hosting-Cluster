import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const project=path.resolve(process.argv[2]||'.');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-c3-test-'));
const source=path.join(tmp,'source'),receiver=path.join(tmp,'receiver');
const newCli=path.join(project,'bin/file-consistent-lab.mjs');
const delta=path.join(project,'bin/file-delta-lab.mjs');
const peer=path.join(project,'bin/file-peer-lab.mjs');
const mockBin=path.join(tmp,'bin');let assertions=0;
const check=(c,msg)=>{assert(c,msg);assertions++};
const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s)};
function call(cli,args,home,{ok=true,gtid='0-11-9',ro='1'}={}){
 const p=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:30000,env:{...process.env,HOME:home,PATH:mockBin+path.delimiter+process.env.PATH,FAKE_GTID:gtid,FAKE_RO:ro}});
 assert.equal(p.status,ok?0:1,`${path.basename(cli)} ${args.join(' ')}: ${p.stderr}\n${p.stdout}`);
 return ok?JSON.parse(p.stdout):p.stderr;
}
try{
 fs.mkdirSync(mockBin,{recursive:true});
 write(path.join(mockBin,'mariadb'),`#!/bin/sh\ncase "$*" in *read_only*) printf '%s\\n' "\${FAKE_RO}";; *gtid_binlog_pos*|*gtid_slave_pos*) printf '%s\\n' "\${FAKE_GTID}";; *) exit 2;; esac\n`);
 fs.chmodSync(path.join(mockBin,'mariadb'),0o700);
 for(const home of [source,receiver]){
  fs.mkdirSync(path.join(home,'mhc-file-lab'),{recursive:true});
  const m=path.join(home,'.config/mhc-full-installer/installed');write(m,'TEST 0.4.0C3 installed on clean Termux\n');fs.chmodSync(m,0o600);
 }
 const srcLab=path.join(source,'mhc-file-lab'),dstLab=path.join(receiver,'mhc-file-lab');
 write(path.join(srcLab,'source/sheets/001.musicxml'),'version 1');
 write(path.join(dstLab,'replica/sheets/001.musicxml'),'version 1');
 let b=call(delta,['manifest','replica'],receiver);
 fs.mkdirSync(path.join(srcLab,'reports'),{recursive:true});const baseName=path.basename(b.path);
 fs.copyFileSync(path.join(dstLab,'reports',baseName),path.join(srcLab,'reports',baseName));
 write(path.join(srcLab,'source/sheets/001.musicxml'),'version 2');write(path.join(srcLab,'source/uploads/photo.png'),'new upload');
 const built=call(delta,['bundle',baseName],source);const id=built.id;
 check(built.changed===2,'delta created');
 const noConfirm=call(newCli,['checkpoint-create',id],source,{ok:false});check(noConfirm.includes('Confirmation')||noConfirm.includes('Usage'),'source acknowledgement required');
 check(call(newCli,['checkpoint-create',id,'--confirm=QUIESCED_LAB_ONLY'],source,{ro:'0',ok:false}).includes('read_only'),'read only enforced');
 write(path.join(srcLab,'source/sheets/001.musicxml'),'changed without rebundling');
 check(call(newCli,['checkpoint-create',id,'--confirm=QUIESCED_LAB_ONLY'],source,{ok:false}).includes('Source files changed'),'source files must match package');
 write(path.join(srcLab,'source/sheets/001.musicxml'),'version 2');
 const cp=call(newCli,['checkpoint-create',id,'--confirm=QUIESCED_LAB_ONLY'],source);
 check(cp.status==='LAB_CHECKPOINT_RECORDED_NOT_ATOMIC'&&!cp.atomicDatabaseFileSnapshotVerified,'no false atomic claims');
 check(call(newCli,['checkpoint-create',id,'--confirm=QUIESCED_LAB_ONLY'],source,{ok:false}).includes('already exists'),'no checkpoint overwrite');
 call(peer,['peer-init'],receiver);
 const p=call(peer,['peer-prepare',id,'100'],receiver);check(p.status==='READY_FOR_RESUME','receiver prepared');
 fs.cpSync(path.join(srcLab,'outbox',id),path.join(dstLab,'inbox/pending-'+id),{recursive:true,force:true});
 check(call(peer,['peer-finalize',id],receiver).status==='RECEIVED_VERIFIED_NOT_APPLIED','C2 receiver validated');
 check(call(delta,['stage',id],receiver).status==='CANDIDATE_VERIFIED_OFFLINE','C1 stage');
 check(call(newCli,['apply-plan',id],receiver,{gtid:'0-11-8',ok:false}).includes('does not exactly match'),'wrong GTID rejected');
 check(call(newCli,['apply-plan',id],receiver,{ro:'0',ok:false}).includes('read_only'),'writable DB rejected');
 const plan=call(newCli,['apply-plan',id],receiver);
 check(plan.status==='OFFLINE_APPLY_PLAN_PASS'&&!plan.standbyReady&&!plan.haEligible,'planning only');
 check(call(newCli,['apply-offline',id],receiver,{ok:false}).includes('Usage'),'apply confirmation required');
 check(call(newCli,['apply-offline',id,'--confirm=OFFLINE_LAB_APPLY'],receiver,{gtid:'0-11-10',ok:false}).includes('does not exactly match'),'advanced GTID rejected');
 const applied=call(newCli,['apply-offline',id,'--confirm=OFFLINE_LAB_APPLY'],receiver);
 check(applied.status==='OFFLINE_VERSIONED_LAB_COPY_NOT_LIVE','versioned offline apply');
 check(fs.readFileSync(path.join(dstLab,'applied',id,'sheets/001.musicxml'),'utf8')==='version 2','applied copy content');
 check(fs.readFileSync(path.join(dstLab,'replica/sheets/001.musicxml'),'utf8')==='version 1','no changes to original replica');
 check(!applied.haEligible&&!applied.liveApply,'never HA or live');
 check(call(newCli,['apply-offline',id,'--confirm=OFFLINE_LAB_APPLY'],receiver,{ok:false}).includes('already exists'),'no overwrite offline applied copy');
 check(call(newCli,['consistent-status'],receiver).offlineVersions===1,'status counts copy');
 // Checkpoint and recipient receipts are independently needed.
 const cpFile=path.join(dstLab,'inbox',id,'checkpoint.json');const old=fs.readFileSync(cpFile);
 const forged=JSON.parse(old);forged.gtid='0-11-999';write(cpFile,JSON.stringify(forged));
 check(call(newCli,['apply-plan',id],receiver,{ok:false}).includes('Checkpoint changed after C2 receiver verification'),'checkpoint tamper blocked');
 write(cpFile,old);
 const receipt=path.join(dstLab,'transport/receipts',id+'.json');fs.renameSync(receipt,receipt+'.bak');
 check(call(newCli,['apply-plan',id],receiver,{ok:false}).includes('Required LAB path'),'receipt required');fs.renameSync(receipt+'.bak',receipt);
 // Concurrent change to candidate and baseline must be rejected.
 write(path.join(dstLab,'candidates',id,'uploads/photo.png'),'corrupt');
 check(call(newCli,['apply-plan',id],receiver,{ok:false}).includes('Offline candidate differs'),'candidate changed blocked');
 write(path.join(dstLab,'candidates',id,'uploads/photo.png'),'new upload');
 write(path.join(dstLab,'replica/sheets/001.musicxml'),'diverged');
 check(call(newCli,['apply-plan',id],receiver,{ok:false}).includes('Replica baseline diverged'),'baseline divergence blocked');
 write(path.join(dstLab,'replica/sheets/001.musicxml'),'version 1');
 // Disallow operations on a node hosting a registered static site.
 write(path.join(receiver,'.config/mhc-full-installer/static/demo.conf'),'managed');
 check(call(newCli,['apply-plan',id],receiver,{ok:false}).includes('registered live website'),'live-site guard');
 fs.rmSync(path.join(receiver,'.config/mhc-full-installer/static/demo.conf'));
 write(path.join(receiver,'apps/thophuongpro/.env'),'secret');
 check(call(newCli,['consistent-status'],receiver,{ok:false}).includes('production'),'production guard');
 check(call(newCli,['apply-plan','../../bad'],receiver,{ok:false}).includes('Invalid delta ID'),'path traversal id refused');
 console.log(`PASS: v0.4C.3 ${assertions} isolated offline GTID/file checkpoint assertions; NO live apply, NO HA`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
