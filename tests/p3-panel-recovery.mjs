import assert from 'node:assert/strict';
import {p3RecoveryPlan} from '../reference/cluster-authority/p3-recovery.mjs';
import {p3SwitchDns,p3SwitchPanelDns} from '../reference/cluster-authority/p3-route.mjs';

// Standalone, fake time + fake DNS only; no real phone, Cloudflare or website involved.
const a='d97965f8-b2e9-4a8a-97d6-acb40504bdf1';
const b='4b2e350b-e6cb-4bc7-badb-85d9386f3a7e';
const c='d92b9a69-a534-4055-9855-d81a5836a98b';
const ta='d8b3fbc5-1a5e-4d6a-958c-21ebc8c6dabb.cfargotunnel.com';
const tb='dc1650f8-911c-4e82-af3b-d9f61e50b2ee.cfargotunnel.com';
const tc='abc50f89-02ac-42c0-ac5b-3bc7c778eabb.cfargotunnel.com';
const now=Date.parse('2026-10-27T00:00:00.000Z');
const members=[{nodeId:a,label:'Vsmart'},{nodeId:b,label:'XZ3'},{nodeId:c,label:'C'}];
const running={services:{'amh-panel':'running','mhc-panel-tunnel':'running',nginx:'running'}};
const good=(seconds,telemetry=running)=>({receivedAt:now-seconds*1000,metricsAt:now-seconds*1000,telemetry});
const state=()=>({schema:1,heartbeats:{[a]:good(400),[b]:good(10),[c]:good(25)}});
const env={MHC_P3_PANEL_RECOVERY_ENABLED:'LAB_PANEL_ONLY',MHC_P3_LAB_ENABLED:'OPERATOR_ASSISTED_DNS_ONLY',
 MHC_P3_INITIAL_PRIMARY_NODE_ID:a,MHC_P3_CF_TOKEN:'FAKE_TEST_TOKEN_DO_NOT_PUBLISH_123456',
 MHC_P3_ROUTES_JSON:JSON.stringify([
  {zoneId:'a'.repeat(32),recordId:'b'.repeat(32),hostname:'site.lab.example.com',kind:'site',
   nodeTargets:{[a]:ta,[b]:tb,[c]:tc}},
  {zoneId:'a'.repeat(32),recordId:'c'.repeat(32),hostname:'panel.lab.example.com',kind:'panel',
   nodeTargets:{[a]:ta,[b]:tb,[c]:tc}}
 ])};
const plan=(st,e=env)=>p3RecoveryPlan(st,members,e,now);
assert.equal(plan(state(),{...env,MHC_P3_PANEL_RECOVERY_ENABLED:'NO'}).reason,'DISABLED');
assert.equal(plan({...state(),heartbeats:{...state().heartbeats,[a]:good(20)}}).reason,'INCUMBENT_NOT_PROVEN_OFFLINE');
assert.equal(plan({...state(),pending:{status:'PREPARED_NO_WRITER_GRANT'}}).reason,'PRIMARY_TRANSITION_PENDING');
assert.equal(plan({...state(),heartbeats:{...state().heartbeats,[b]:good(10,{services:{'amh-panel':'running','mhc-panel-tunnel':'stopped'}}}},
  members.filter(n=>n.nodeId!==c),env,now).kind,'start');
const noTunnel=state();noTunnel.heartbeats[b]=good(10,{services:{'amh-panel':'running','mhc-panel-tunnel':'stopped'}});
noTunnel.heartbeats[c]=good(25,{services:{'amh-panel':'running','mhc-panel-tunnel':'stopped'}});
assert.equal(plan(noTunnel).reason,'NO_HEALTHY_RECOVERY_PANEL');
assert.deepEqual(plan(state()),{kind:'start',fromNodeId:a,targetNodeId:b});
const requested=state();requested.panelRecovery={status:'DNS_REQUESTED',fromNodeId:a,targetNodeId:b,lastRouteTryAt:now-100000};
assert.equal(plan(requested).kind,'resume');
requested.panelRecovery.lastRouteTryAt=now-30000;
assert.equal(plan(requested).reason,'RETRY_COOLDOWN');
requested.panelRecovery.status='DNS_SWITCHED_RECOVERY';
assert.equal(plan(requested).reason,'RECOVERY_ACTIVE');

const routes=JSON.parse(env.MHC_P3_ROUTES_JSON);
const records=new Map(routes.map(x=>[x.recordId,{id:x.recordId,name:x.hostname,type:'CNAME',proxied:true,content:ta}]));
const calls=[];
const fakeCF=async (url,opt)=>{
 const id=url.split('/').at(-1),r=records.get(id);calls.push({method:opt.method,id});
 if(opt.method==='PATCH')Object.assign(r,JSON.parse(opt.body));
 return new Response(JSON.stringify({success:true,result:{...r}}),{status:200});
};
const moved=await p3SwitchPanelDns(env,{fromNodeId:a,targetNodeId:b},fakeCF);
assert.equal(moved.records.length,1);
assert.equal(records.get('b'.repeat(32)).content,ta,'website untouched by emergency Panel recovery');
assert.equal(records.get('c'.repeat(32)).content,tb,'admin Panel follows eligible standby');
assert.equal(calls.filter(x=>x.method==='PATCH').length,1);
await p3SwitchPanelDns(env,{fromNodeId:a,targetNodeId:b},fakeCF);
assert.equal(calls.filter(x=>x.method==='PATCH').length,1,'replay-safe');
await p3SwitchDns(env,{fromNodeId:a,targetNodeId:b,panelFromNodeId:b},fakeCF);
assert.equal(records.get('b'.repeat(32)).content,tb,'manual Primary now redirects website');
assert.equal(calls.filter(x=>x.method==='PATCH').length,2,'no duplicate Panel PATCH');
records.get('c'.repeat(32)).content='wrong.cfargotunnel.com';
await assert.rejects(p3SwitchPanelDns(env,{fromNodeId:a,targetNodeId:b},fakeCF),/P3_ROUTE_CONFLICT_MANUAL_REVIEW/);
console.log('PASS: P3 standby Panel selection, schedule guards, DNS-only recovery, retries, manual route after recovery, conflict fails closed');
