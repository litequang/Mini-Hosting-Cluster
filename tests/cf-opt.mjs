import vm from 'node:vm';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {HeartbeatSequence,BackgroundBackoff,classifyAuthorityError} from '../bin/authority-traffic.mjs';
import {JobWake} from '../reference/cluster-authority/job-wake.mjs';
import {collectAuthorityUsage,safeUsage,requestForecast,usageSummary,budgetLevel} from '../bin/authority-usage.mjs';
import {safeUsage as workerSafe} from '../reference/cluster-authority/usage-safe.mjs';
const sequence=new HeartbeatSequence();let server=0,reads=0,writes=0,lose=false;
const status=async()=>{reads++;return {callerSequence:server};},publish=async n=>{writes++;assert.equal(n,server+1);server=n;if(lose)throw Error('AUTHORITY_UNREACHABLE');return {callerSequence:n};};
for(let i=0;i<10;i++)await sequence.send('a',status,publish);
assert.equal(reads,1);assert.equal(writes,10);
lose=true;await assert.rejects(sequence.send('a',status,publish),/UNREACHABLE/);lose=false;
await sequence.send('a',status,publish);assert.equal(reads,2);assert.equal(server,12);
await sequence.send('b',status,publish);assert.equal(reads,3);
await assert.rejects(sequence.send('b',status,async()=>({callerSequence:0})),/MISMATCH/);
await sequence.send('b',status,publish);assert.equal(reads,4);
let now=1000;const backoff=new BackgroundBackoff({now:()=>now,random:()=>1});
for(const [error,kind,min]of [[Error('AUTHORITY_QUOTA_EXCEEDED'),'quota',60000],[Object.assign(Error('x'),{status:429}),'rateLimit',30000],[Object.assign(Error('x'),{status:401}),'auth',60000],[Error('AUTHORITY_TIMEOUT'),'timeout',3000],[Error('AUTHORITY_UNREACHABLE'),'network',3000],[Object.assign(Error('x'),{status:503}),'server',3000]]){
 backoff.success();assert.equal(classifyAuthorityError(error),kind);backoff.failure(error);assert(backoff.nextAt-now>=min);assert(!backoff.ready());now=backoff.nextAt;assert(backoff.ready());
}
for(let i=0;i<100;i++)backoff.failure(Error('AUTHORITY_TIMEOUT'));assert(backoff.nextAt-now<=300000);backoff.success();assert(backoff.ready());
const wake=new JobWake(),version=wake.version('a');wake.notify('a');await wake.wait('a',version,60000);assert.equal(wake.waiters.size,0);
let finished=false;const pending=wake.wait('a',wake.version('a'),60000).then(()=>{finished=true;});wake.notify('b');await Promise.resolve();assert(!finished);wake.notify('a');await pending;assert(finished);
const old=wake.wait('a',wake.version('a'),60000),next=wake.wait('a',wake.version('a'),5);await old;await next;assert.equal(wake.waiters.size,0);
const home=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-cf-opt-'));try{
 const dir=path.join(home,'.local/state/mhc-cf-usage');fs.mkdirSync(dir,{recursive:true});const day=new Date().toISOString().slice(0,10),sample={schema:1,day,attempts:7,byAction:{status:5,heartbeat:2,secret:'NO'},outcomes:{success:6,quota:1},updatedAt:Date.now()};
 fs.writeFileSync(path.join(dir,'process-1-abcdef12.json'),JSON.stringify({schema:1,days:{[day]:sample}}));
 fs.writeFileSync(path.join(dir,'not-a-counter.json'),'PRIVATE_DO_NOT_PARSE');
 const local=collectAuthorityUsage(home);assert.equal(local.attempts,7);assert.deepEqual(local.byAction,{status:5,heartbeat:2});
 assert.deepEqual(safeUsage(sample),workerSafe(sample));assert.equal(safeUsage({...sample,attempts:Infinity}),null);
 const summary=usageSummary({nodes:[{telemetry:{cloudflareUsage:sample}},{telemetry:{}}]},local);assert(summary.incomplete);assert.equal(summary.workerAttempts,7);assert.equal(summary.doRequests.min,0);assert(!JSON.stringify(summary).includes('NO'));
}finally{fs.rmSync(home,{recursive:true,force:true});}
assert.equal(budgetLevel(39000),'Normal');assert.equal(budgetLevel(40000),'Warning');assert.equal(budgetLevel(50000),'High');assert.equal(budgetLevel(90000),'Critical');
for(const n of [3,5,10]){const f=requestForecast(n);assert.equal(f.durableObjects,6480*n+1920*(n-2)+89760+1440);}
// Execute the real modal polling function against a minimal DOM, not a second implementation.
const app=fs.readFileSync(new URL('../bin/legacy-panel-src/public/app.js',import.meta.url),'utf8'),start=app.indexOf('async function standbyPoll('),end=app.indexOf('setInterval(()=>standbyPoll()',start);
let polls=0,release;const state={standbyTarget:'node',standbyJob:{status:'RUNNING'}},document={hidden:false},box={classList:{contains:()=>false}},context={state,document,$:()=>box,req:async()=>{polls++;await new Promise(r=>{release=r;});return {site:{job:{status:'DONE'}}};},standbyRender:site=>{state.standbyJob=site.job;},standbyOpen:async()=>{}};
vm.createContext(context);vm.runInContext(app.slice(start,end),context);
document.hidden=true;await context.standbyPoll();assert.equal(polls,0);document.hidden=false;
const flight=context.standbyPoll();await context.standbyPoll();assert.equal(polls,1);release();await flight;await context.standbyPoll();assert.equal(polls,1);
const forced=context.standbyPoll(true);assert.equal(polls,2);release();await forced;assert.equal(state.standbyPolling,false);
console.log('PASS CF-OPT: heartbeat10 cycles20→11 requests; ambiguous reply/restart reconcile; quota/auth/429/5xx/network bounded backoff; targeted wake/race/timeout/replacement; sanitized bounded counters and explicit incomplete/forecast. Fixtures, not Android acceptance.');
