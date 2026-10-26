import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scenarios,fresh,transition,writeAllowed,TTL_MS,SCOPE,CONFIRM} from '../bin/fencing-lease-lab.mjs';
const SCRIPT=fileURLToPath(new URL('../bin/fencing-lease-lab.mjs',import.meta.url));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-fence-'));
let count=0;
const ok=(x,m)=>{assert.ok(x,m);count++};
const exec=(args,code=0)=>{const v=spawnSync(process.execPath,[SCRIPT,...args],{env:{...process.env,HOME:tmp},encoding:'utf8',timeout:5000});ok(v.status===code,`${args.join(' ')} => ${v.status}: ${v.stderr}`);return (v.stdout||v.stderr).trim()};
try{
 const r=scenarios();ok(r.scenarioCount>=28&&r.allSyntheticChecksPassed,`fence model scenarios: ${r.failed.join(', ')}`);
 ok(r.authoritativeLease===false&&r.realWriteGateInstalled===false&&r.canPromote===false,'never claim real authority');
 const good={witnessOnline:true,edgeTermGate:true,watchdogAlive:true,originTermGate:true};
 // Exhaustive combinations of four simulated independent gates: fail closed when any missing.
 const first=transition(fresh(),{type:'INITIAL_GRANT',node:'source'},0,good);
 for(let mask=0;mask<16;mask++){
  const c={witnessOnline:!!(mask&1),edgeTermGate:!!(mask&2),watchdogAlive:!!(mask&4),originTermGate:!!(mask&8)};
  ok(writeAllowed(first,'source',1,1,c)===(mask===15),`failed gate mask ${mask}`);
  ok(!writeAllowed(first,'other',1,1,c),`other writer mask ${mask}`);
 }
 // Invariant across multiple simulated dates: only one writer can pass even after takeover.
 const fenced={...good,independentFenceConfirmed:true,edgeTermRevoked:true,oldOriginBlocked:true,oldDbReadOnly:true};
 const pending=transition(first,{type:'TICK'},TTL_MS,good);
 const sealed=transition(pending,{type:'FENCE_ACK',fencedNode:'source',term:1},TTL_MS+1,fenced);
 const next=transition(sealed,{type:'PROMOTE',node:'target'},TTL_MS+2,{...good,dataCaughtUp:true,fileCheckpointMatches:true,targetBootGate:true});
 for(let dt=0;dt<=TTL_MS+100;dt+=101){
  const now=TTL_MS+2+dt;
  ok(!(writeAllowed(next,'source',1,now,good)&&writeAllowed(next,'target',2,now,good)),'never two writers');
 }
 ok(r.results.every(x=>!x.name.toLowerCase().includes('production')),'no production fixture');
 const markDir=path.join(tmp,'.config/mhc-full-installer');fs.mkdirSync(markDir,{recursive:true,mode:0o700});fs.writeFileSync(path.join(markDir,'installed'),'TEST 0.5.0B installed on clean Termux\n',{mode:0o600});
 ok(JSON.parse(exec(['status'])).review==='NOT_RUN','uninitialized status is safe');
 ok(JSON.parse(exec(['plan'])).liveLeaseGranted===false,'plan no live lease');
 ok(JSON.parse(exec(['scenarios'])).allSyntheticChecksPassed,'read-only scenarios');
 exec(['rehearse'],1);exec(['rehearse','--confirm=WRONG'],1);
 const info=JSON.parse(exec(['rehearse',CONFIRM]));ok(info.review==='SYNTHETIC_MODEL_PASS'&&!info.canPromote,'report explicitly synthetic');
 const file=path.join(tmp,'mhc-fencing-lab/report.json');ok((fs.statSync(file).mode&0o077)===0,'private report');
 exec(['rehearse',CONFIRM],1);
 fs.chmodSync(file,0o644);exec(['status'],1);fs.chmodSync(file,0o600);
 const report=JSON.parse(fs.readFileSync(file,'utf8'));ok(report.scope===SCOPE&&report.failed.length===0,'valid local report');
 fs.unlinkSync(file);
 fs.mkdirSync(path.join(tmp,'.config/mhc-full-installer/static'),{recursive:true,mode:0o700});fs.writeFileSync(path.join(tmp,'.config/mhc-full-installer/static/demo.conf'),'',{mode:0o600});exec(['rehearse',CONFIRM],1);
 fs.rmSync(path.join(tmp,'.config/mhc-full-installer/static'),{recursive:true});
 fs.mkdirSync(path.join(tmp,'.config/mini-hosting-cluster'),{recursive:true});fs.writeFileSync(path.join(tmp,'.config/mini-hosting-cluster/ha.json'),'{}',{mode:0o600});exec(['rehearse',CONFIRM],1);
 ok(!fs.readFileSync(SCRIPT,'utf8').includes('CHANGE MASTER'),'no MariaDB mutations');
 console.log(`PASS: v0.5B synthetic fencing/lease model — ${count} assertions, ${r.scenarioCount} safety scenarios; NO real authority`);
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
