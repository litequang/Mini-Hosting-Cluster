import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {PassThrough} from 'node:stream';
import {readJoinCode} from '../bin/join-input.mjs';import {onboardingObservation} from '../bin/node-onboarding.mjs';
let checks=0;const secret='MHC1.'+'a'.repeat(70);
async function input(bytes,options={}){const stream=new PassThrough(),out=new PassThrough();let printed='';out.on('data',b=>printed+=b);let states=[];
 if(options.tty){stream.isTTY=true;stream.isRaw=false;stream.setRawMode=v=>{stream.isRaw=v;states.push(v);};}
 const task=readJoinCode({input:stream,output:out,stdin:!options.tty,timeoutMs:options.timeoutMs||100});if(bytes!==null)stream.end(bytes);
 try{return {value:await task,printed,states};}catch(e){assert(!printed.includes(secret));assert(!e.message.includes(secret));throw e;}}
const pipe=await input(secret+'\n');assert.equal(pipe.value,secret);assert.equal(pipe.printed,'');checks++;
const tty=await input(secret+'\r',{tty:true});assert.equal(tty.value,secret);assert(!tty.printed.includes(secret));assert.deepEqual(tty.states,[true,false]);checks++;
await assert.rejects(input('x'.repeat(2200)),/TOO_LONG/);checks++;
await assert.rejects(input('\x03',{tty:true}),/CANCELLED/);checks++;
await assert.rejects(input(null,{timeoutMs:10}),/TIMEOUT/);checks++;
await assert.rejects(input('bad secret'),/INVALID/);checks++;
const home=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-onboarding-'));
const put=(p,v)=>{fs.mkdirSync(path.dirname(path.join(home,p)),{recursive:true});fs.writeFileSync(path.join(home,p),JSON.stringify(v));};
try{
 assert.equal(onboardingObservation({home}),null);checks++;
 put('.local/state/mhc-new-node-install/progress.json',{schema:1,nodeId:'fixture',phase:'INSTALLED',commit:'a'.repeat(40),completed:Array(6).fill('done'),routeReady:true,siteReady:true,eligiblePrimary:true,secret});
 let s=onboardingObservation({home,services:{'amh-panel':'running'}});assert(!s.authorityConfigured);assert(s.blockers.includes('PAIRING_REQUIRED'));assert(!JSON.stringify(s).includes(secret));checks++;
 put('.config/mhc-full-installer/authority.json',{nodeId:'fixture',token:secret});
 s=onboardingObservation({home,services:{'amh-panel':'running','mhc-authority-agent':'running','mhc-panel-tunnel':'running'}});assert(s.authorityConfigured&&s.managementRunning&&s.tunnelRunning);assert.equal(s.eligiblePrimary,false);assert.equal(s.siteVerified,false);assert.equal(s.routeVerified,false);assert(s.blockers.includes('CONTROL_PROOF_REQUIRED'));checks++;
 put('.local/state/mhc-source-upgrade/current.json',{commit:'b'.repeat(40)});assert.equal(onboardingObservation({home}).sourceCommit,'b'.repeat(40));checks++;
}finally{fs.rmSync(home,{recursive:true,force:true});}
console.log('PASS N1 onboarding '+checks+' cases: hidden/stdin/cancel/timeout/bounds, no secret output, local observations never authorize Control/Primary.');
