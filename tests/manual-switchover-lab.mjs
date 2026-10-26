import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {template,evaluate,STEPS} from '../bin/manual-switchover-lab.mjs';
const SCRIPT=fileURLToPath(new URL('../bin/manual-switchover-lab.mjs',import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-sw-v05-'));
let total=0;const ok=(value,message)=>{assert.ok(value,message);total++};
const mark=path.join(tmp,'.config/mhc-full-installer');fs.mkdirSync(mark,{recursive:true,mode:0o700});fs.writeFileSync(path.join(mark,'installed'),'TEST 0.5.0A installed on clean Termux\n',{mode:0o600});
const dir=path.join(tmp,'mhc-switchover-lab');fs.mkdirSync(dir,{mode:0o700});const evidenceFile=path.join(dir,'evidence.json');
const execute=(args,code=0)=>{const p=spawnSync(process.execPath,[SCRIPT,...args],{env:{...process.env,HOME:tmp},encoding:'utf8',timeout:3000});ok(p.status===code,`${args.join(' ')} code expected=${code}, got=${p.status}: ${p.stderr}`);return (p.stdout||p.stderr).trim()};
const write=e=>fs.writeFileSync(evidenceFile,JSON.stringify(e,null,2)+'\n',{mode:0o600});
const ready=()=>{const e=template();e.source.ingressStopped=true;e.source.dbReadOnly=true;e.source.transactionsDrained=true;e.source.backupVerified=true;e.source.restoreDrillVerified=true;e.target.gtid=e.source.gtid;e.target.filesSha256=e.source.filesSha256;e.target.ioRunning=true;e.target.sqlRunning=true;e.witness.claimedReachable=true;e.witness.claimedFenceIndependent=true;e.route.publicIngressDisabled=true;e.acceptance.gtidAndroidE2E=true;e.acceptance.fileAndroidE2E=true;return e};
try{
 const base=template();ok(evaluate(base).blockerCount>=6,'default template is fail-closed');ok(STEPS.length===5,'five ordered steps');
 execute(['status']);ok(execute(['sample']).includes('NOT_HA'),'safe template');execute(['plan'],1);
 let e=ready();write(e);let result=JSON.parse(execute(['plan']));ok(result.simulatedGatePass===true,'ready operator claims pass only simulator');ok(result.canSwitchPrimary===false&&!result.authoritativeEvidence,'cannot grant real write authority');
 for(const [mutate,reason] of [
  [x=>x.source.nodeId=x.target.nodeId,'same node'],[x=>x.target.serverId=x.source.serverId,'same server id'],
  [x=>x.capturedAt='2020-01-01T00:00:00Z','stale'],[x=>x.source.ingressStopped=false,'ingress'],
  [x=>x.source.dbReadOnly=false,'db read only'],[x=>x.source.transactionsDrained=false,'transactions drain'],
  [x=>x.source.backupVerified=false,'backup'],[x=>x.source.restoreDrillVerified=false,'restore drill'],
  [x=>x.target.dbReadOnly=false,'target readonly'],[x=>x.target.applicationStopped=false,'target app'],
  [x=>x.target.ioRunning=false,'IO'],[x=>x.target.sqlRunning=false,'SQL'],
  [x=>x.target.gtid='0-101-9','GTID divergence'],[x=>x.target.filesSha256='b'.repeat(64),'files divergence'],
  [x=>x.witness.claimedReachable=false,'witness'],[x=>x.witness.claimedFenceIndependent=false,'fence'],
  [x=>x.witness.claimedOwnerNodeId=x.target.nodeId,'owner'],[x=>x.route.publicIngressDisabled=false,'ingress exposed'],
  [x=>x.route.isolatedLab=false,'not isolated'],[x=>x.acceptance.gtidAndroidE2E=false,'no GTID E2E'],
  [x=>x.acceptance.fileAndroidE2E=false,'no file E2E']]){
  const o=ready();mutate(o);ok(evaluate(o).blockerCount>0,`blocks ${reason}`);
 }
 for(const [mutate,reason] of [[x=>x.extraSecret='LEAK','extra key'],[x=>x.target.foo='1','nested key'],[x=>x.source.gtid='garbage','GTID syntax'],[x=>x.target.filesSha256='ABC','SHA format'],[x=>x.acceptance.gtidAndroidE2E='yes','flag type']]){
  const o=ready();mutate(o);write(o);execute(['plan'],1);ok(true,`reject ${reason}`);
 }
 write(e);execute(['start'],1);execute(['start','--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER']);
 execute(['advance','catchup','--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER'],1);
 for(const step of STEPS){const r=JSON.parse(execute(['advance',step,'--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER']));ok(r.realLeaseAcquired===false&&r.realTrafficSwitched===false&&r.writerAuthorityGranted===false,step+' cannot change real system')}
 const final=JSON.parse(execute(['status']));ok(final.state==='completed'&&final.simulatedSteps.length===7,'rehearsal completes with immutable-ish chain');
 execute(['start','--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER'],1);
 const journal=path.join(dir,'rehearsal.json');const j=JSON.parse(fs.readFileSync(journal,'utf8'));j.events[0].step='fabricated';fs.writeFileSync(journal,JSON.stringify(j),{mode:0o600});execute(['status'],1);
 fs.unlinkSync(journal);execute(['start','--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER']);
 e.target.gtid='0-101-8';write(e);execute(['advance','quiesce','--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER'],1);
 execute(['abort','--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER']);ok(JSON.parse(execute(['status'])).state==='aborted','abort works after evidence changes');
 fs.unlinkSync(journal);e=ready();write(e);fs.chmodSync(evidenceFile,0o644);execute(['plan'],1);fs.chmodSync(evidenceFile,0o600);
 fs.mkdirSync(path.join(tmp,'.config/mhc-full-installer/static'),{recursive:true});fs.writeFileSync(path.join(tmp,'.config/mhc-full-installer/static/demo.conf'),'',{mode:0o600});execute(['start','--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER'],1);fs.rmSync(path.join(tmp,'.config/mhc-full-installer/static'),{recursive:true});
 fs.mkdirSync(path.join(tmp,'apps/thophuongpro'),{recursive:true});fs.writeFileSync(path.join(tmp,'apps/thophuongpro/.env'),'SECRET',{mode:0o600});execute(['start','--confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER'],1);
 ok(!fs.readFileSync(SCRIPT,'utf8').includes('CHANGE MASTER TO'),'script never issues replication modifications');
 console.log(`PASS: v0.5A manual switchover LAB rehearsal — ${total} assertions (fail-closed, ordering, expiry, chain, abort, identity, no writer authority)`);
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
