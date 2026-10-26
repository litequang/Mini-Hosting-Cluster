import test from 'node:test';import assert from 'node:assert/strict';
import {initialState,administer,pulse,publicStatus} from '../coordinator/src/policy.mjs';
const A='m51',B='x7b',now=100000;
const probe=(ready=false)=>({armed:true,healthy:true,replicationReady:ready});
function setup(){let s=initialState();return administer(s,'bootstrap',{nodeId:A},now)}
function tick(s,id,t,ready=false){return pulse(s,id,probe(ready),t)}
test('bootstrap selects M51 and denies X7b during active lease',()=>{
 let s=setup();let r=tick(s,A,now);s=r.state;assert.equal(r.decision.role,'primary');assert.equal(s.current,A);
 r=tick(s,B,now+1,true);assert.equal(r.decision.role,'standby');assert.equal(r.state.current,A);
});
test('manual handoff demands verified data, revokes old lease, applies fence interval',()=>{
 let s=tick(setup(),A,now).state;
 assert.throws(()=>administer(s,'handoff',{nodeId:B},now+5),/Verified/);
 s=administer(s,'handoff',{nodeId:B,confirm:'DATA_VERIFIED'},now+5);
 let r=tick(s,B,now+100,true);s=r.state;assert.equal(r.decision.role,'standby');
 assert.equal(publicStatus(s,now+100).pending,B);
 // old lease expires at now + 30s. Fence must remain a further 12s.
 r=tick(s,B,now+30001,true);s=r.state;assert.equal(s.current,null);
 r=tick(s,B,now+41999,true);s=r.state;assert.equal(s.current,null);
 r=tick(s,B,now+42002,true);assert.equal(r.state.current,B);assert.equal(r.state.term,2);
 assert.equal(r.decision.role,'primary');assert.ok(r.state.blocked.includes(A));
});
test('strict auto does not promote snapshot-only standby after outage',()=>{
 let s=tick(setup(),A,now).state;s=administer(s,'mode',{mode:'auto'},now+10);
 s=tick(s,B,now+100,false).state;
 for(const t of [130001,145001])s=tick(s,B,t,false).state;
 assert.equal(s.current,null);
});
test('risk opt-in allows a GTID-ready standby only after old lease and fencing',()=>{
 let s=tick(setup(),A,now).state;
 s=administer(s,'mode',{mode:'auto'},now+1);
 s=administer(s,'allow-risky-auto',{enabled:true,confirm:'I_ACCEPT_POSSIBLE_DATA_LOSS'},now+2);
 for(const t of [now+30001,now+42001])s=tick(s,B,t,true).state;
 assert.equal(s.current,B);assert.equal(s.term,2);assert.equal(s.allowRiskyAuto,true);
});
test('old M51 cannot self-promote after X7b takeover until rejoin',()=>{
 let s=tick(setup(),A,now).state;
 s=administer(s,'handoff',{nodeId:B,confirm:'DATA_VERIFIED'},now+3);
 s=tick(s,B,now+50000,true).state;assert.equal(s.current,B);
 s=tick(s,A,now+60000,true).state;assert.equal(s.current,B);
 assert.throws(()=>administer(s,'confirm-rejoin',{nodeId:A,confirm:'no'},now+9),/verification/);
 s=administer(s,'confirm-rejoin',{nodeId:A,confirm:'DATA_REJOIN_VERIFIED'},now+60001);
 assert.ok(!s.blocked.includes(A));
});
test('old writer may renew after isolation when nobody else served',()=>{
 let s=tick(setup(),A,now).state;
 s=tick(s,B,now+80000,false).state;
 assert.equal(s.current,null);
 s=tick(s,A,now+81000).state;
 assert.equal(s.current,A); // same unchanged writer may recover; no competing owner
});

test('auto opt-in uses recently verified GTID status after replication IO drops',()=>{
 let s=tick(setup(),A,now).state;
 s=administer(s,'mode',{mode:'auto'},now+1);
 s=administer(s,'allow-risky-auto',{enabled:true,confirm:'I_ACCEPT_POSSIBLE_DATA_LOSS'},now+2);
 s=tick(s,B,now+9000,true).state;
 // After M51 loses power the replica IO thread may say Connecting, not Yes.
 s=tick(s,B,now+30001,false).state;assert.equal(s.current,null);
 s=tick(s,B,now+42001,false).state;assert.equal(s.current,B);
});

test('auto failover fences old M51 and cannot auto-failback stale DB',()=>{
 let s=tick(setup(),A,now).state;
 s=administer(s,'mode',{mode:'auto'},now+1);
 s=administer(s,'allow-risky-auto',{enabled:true,confirm:'I_ACCEPT_POSSIBLE_DATA_LOSS'},now+2);
 s=tick(s,B,now+8000,true).state;
 s=tick(s,B,now+45000,false).state;assert.equal(s.current,B);assert.ok(s.blocked.includes(A));
 s=administer(s,'auto-failback',{enabled:true},now+45001);
 s=tick(s,A,now+46000,true).state;assert.equal(s.current,B);assert.equal(s.pending,null);
 s=administer(s,'confirm-rejoin',{nodeId:A,confirm:'DATA_REJOIN_VERIFIED'},now+46001);
 s=tick(s,A,now+47000,true).state;assert.equal(s.pending,A);
 s=tick(s,A,now+76000,true).state; // old B grant expires at 75000, fencing 12000
 assert.equal(s.current,null);
 s=tick(s,A,now+88000,true).state;assert.equal(s.current,A);
});

test('manual data-verification acknowledgement expires after five minutes',()=>{
 let s=tick(setup(),A,now).state;
 s=administer(s,'handoff',{nodeId:B,confirm:'DATA_VERIFIED'},now+1);
 s=tick(s,B,now+400000,true).state;assert.equal(s.current,null);
 s=administer(s,'approve-once',{nodeId:B,confirm:'DATA_VERIFIED'},now+400001);
 s=tick(s,B,now+400002,true).state;assert.equal(s.current,B);
});
test('automatic score strategy chooses healthier eligible node, not misleading labels',()=>{
 let s=setup();s=administer(s,'mode',{mode:'auto'},now+1);
 s=administer(s,'strategy',{strategy:'score'},now+2);
 s=administer(s,'allow-risky-auto',{enabled:true,confirm:'I_ACCEPT_POSSIBLE_DATA_LOSS'},now+3);
 // Do not bootstrap M51 while testing a real decision by score.
 s.bootstrap=false;s.fenceUntil=now+500;
 const m=(score)=>({cpuCores:score,memFreeGb:score,diskFreeGb:score*5,uptimeDays:score});
 s=pulse(s,A,{...probe(true),metrics:m(2)},now+9).state;
 s=pulse(s,B,{...probe(true),metrics:m(8)},now+10).state;
 s=pulse(s,B,{...probe(true),metrics:m(8)},now+600).state;
 assert.equal(s.current,B);
});
