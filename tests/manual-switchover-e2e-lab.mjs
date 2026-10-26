import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runSynthetic,SCOPE,CONFIRM} from '../bin/manual-switchover-e2e-lab.mjs';
const SCRIPT=fileURLToPath(new URL('../bin/manual-switchover-e2e-lab.mjs',import.meta.url));
const home=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-05c-http-lab-'));
let checks=0;
function ok(a,m){assert.ok(a,m);checks++}
function call(args,exit=0){const x=spawnSync(process.execPath,[SCRIPT,...args],{env:{...process.env,HOME:home},encoding:'utf8',timeout:8000});ok(x.status===exit,`${args.join(' ')} expected=${exit}, got ${x.status}\n${x.stderr}`);return x.stdout||x.stderr}
function marker(){const d=path.join(home,'.config/mhc-full-installer');fs.mkdirSync(d,{recursive:true,mode:0o700});fs.writeFileSync(path.join(d,'installed'),'TEST 0.5.0C-LAB installed on clean Termux\n',{mode:0o600});}
try{
 const baseline=await runSynthetic();
 ok(baseline.status==='SYNTHETIC_LAB_DRILL_PASS','actual loopback HTTP three servers E2E passes');
 ok(baseline.oldWriterDenied,'old writer rejected direct writes');
 ok(baseline.postHandoffTargetAccepted,'new node accepts after local route selection');
 ok(baseline.witnessLossDenied,'fail closed on witness loss');
 ok(baseline.targetEvents===3,'two source events copied and one target write');
 ok(!baseline.canSwitchPrimary&&!baseline.haEligible&&!baseline.realFencingVerified,'no real HA claims');
 ok(baseline.scope===SCOPE&&baseline.syntheticWitnessOnly===true,'explicit synthetic-only scope');
 const phases=baseline.events.map(x=>x.step);
 for(const s of ['LAB_LISTENERS_STARTED','BASELINE_WRITTEN','INGRESS_FROZEN','SECOND_SOURCE_EVENT','FILE_AND_SEQUENCE_REVIEW','OLD_WRITER_FENCE_CHECK','LAB_ROUTE_SELECTED','POST_HANDOFF_TEST','WITNESS_LOSS_FAIL_CLOSED','DRILL_FINISHED'])ok(phases.includes(s),'phase '+s);
 ok(!phases.includes('SAFE_ABORT'),'success not aborted');
 for(const [fault,reason] of [['oldFenceFails','OLD_WRITER_STILL_ACCEPTING_WRITES'],['divergentFiles','SYNC_DIVERGENCE'],['witnessOfflineAtHandoff','WITNESS_OFFLINE_CANNOT_HANDOFF'],['crashAfterFence','CRASH_AFTER_FENCE']]){
  const r=await runSynthetic({[fault]:true});
  ok(r.status==='SYNTHETIC_LAB_DRILL_ABORT',fault+' must abort');
  ok(r.routeFrozen===true&&!r.realWriterAuthorityGranted&&!r.canSwitchPrimary,'route frozen and no authority '+fault);
  ok(r.reason===reason,'specific abort reason '+fault);
  ok(r.events.some(x=>x.step==='SAFE_ABORT'),'journal stop '+fault);
  ok(!r.events.some(x=>x.step==='POST_HANDOFF_TEST'),'no post-handoff success on fault '+fault);
 }
 await assert.rejects(()=>runSynthetic({unexpected:true}),/Unknown/);checks++;
 await assert.rejects(()=>runSynthetic({oldFenceFails:'true'}),/boolean/);checks++;
 ok(JSON.stringify(baseline).indexOf('127.0.0.1')===-1,'report does not publish private listener/port');
 ok(JSON.stringify(baseline).indexOf('Bearer ')===-1,'bearer not exposed in report');
 ok(!JSON.stringify(baseline).includes('fixture-a1'),'no individual event contents in result');
 ok(call(['plan']).includes('SYNTHETIC_LOOPBACK_ONLY'),'plan is read-only');
 ok(JSON.parse(call(['status'])).status==='NOT_RUN','empty status read-only');
 call(['run',CONFIRM],1); // marker required
 marker();
 call(['run'],1);call(['run','--confirm=FAKE'],1);
 const report=JSON.parse(call(['run',CONFIRM]));
 ok(report.status==='SYNTHETIC_LAB_DRILL_PASS'&&report.canSwitchPrimary===false,'CLI run passes, does not promote');
 const d=path.join(home,'mhc-switchover-e2e-lab');
 ok((fs.statSync(d).mode&0o077)===0,'private LAB folder');
 const f=path.join(d,'report.json');
 ok((fs.statSync(f).mode&0o077)===0,'private LAB report');
 const persisted=JSON.parse(fs.readFileSync(f,'utf8'));
 ok(persisted.events.length>=10,'journal persisted phase records');
 ok(JSON.parse(call(['status'])).eventCount===persisted.events.length,'status recomputes audit integrity');
 const edited=structuredClone(persisted);edited.events[1].step='FORGED';fs.writeFileSync(f,JSON.stringify(edited),{mode:0o600});call(['status'],1);
 fs.writeFileSync(f,JSON.stringify(persisted),{mode:0o600});ok(JSON.parse(call(['status'])).auditHead===persisted.result.auditHead,'restored genuine audit');
 const changedResult=structuredClone(persisted);changedResult.result.status='SYNTHETIC_LAB_DRILL_ABORT';fs.writeFileSync(f,JSON.stringify(changedResult),{mode:0o600});call(['status'],1);
 fs.writeFileSync(f,JSON.stringify(persisted),{mode:0o600});
 fs.chmodSync(f,0o644);call(['status'],1);fs.chmodSync(f,0o600);
 fs.rmSync(f);fs.symlinkSync('/etc/passwd',f);call(['status'],1);fs.unlinkSync(f);
 fs.writeFileSync(f,JSON.stringify(persisted),{mode:0o600});
 const lock=path.join(d,'run.lock');fs.writeFileSync(lock,'active', {mode:0o600});call(['run',CONFIRM],1);fs.unlinkSync(lock);
 fs.mkdirSync(path.join(home,'.config/mhc-full-installer/static'),{recursive:true});fs.writeFileSync(path.join(home,'.config/mhc-full-installer/static/demo.conf'),'SITE=REAL\n');call(['run',CONFIRM],1);fs.rmSync(path.join(home,'.config/mhc-full-installer/static'),{recursive:true});
 fs.mkdirSync(path.join(home,'apps/thophuongpro'),{recursive:true});fs.writeFileSync(path.join(home,'apps/thophuongpro/.env'),'DB_SECRET=never_print');const err=call(['run',CONFIRM],1);ok(!err.includes('DB_SECRET'),'no sensitive env leak');fs.rmSync(path.join(home,'apps'),{recursive:true});
 fs.mkdirSync(path.join(home,'.config/mini-hosting-cluster'),{recursive:true});fs.writeFileSync(path.join(home,'.config/mini-hosting-cluster/ha.json'),'{}');call(['run',CONFIRM],1);fs.rmSync(path.join(home,'.config/mini-hosting-cluster'),{recursive:true});
 fs.chmodSync(path.join(home,'.config/mhc-full-installer/installed'),0o644);call(['run',CONFIRM],1);
 console.log(`PASS: ${checks} MHC TEST 0.5.0C-INTEGRATION live loopback switchover LAB assertions; NO real DB, HA, Cloudflare, routing touched`);
}finally{fs.rmSync(home,{recursive:true,force:true})}
