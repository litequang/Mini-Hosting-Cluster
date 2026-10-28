import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker,{ClusterAuthority} from '../reference/cluster-authority/worker.mjs';
import {authorityRequest} from '../bin/cluster-authority.mjs';
// Serialized, rollback-capable storage fixture. Real Durable Object runtime is a separate acceptance check.
class Storage {
 data=new Map();tail=Promise.resolve();failWrite=false;
 transaction(fn){const job=this.tail.then(async()=>{
  const staged=new Map(structuredClone([...this.data]));
  const result=await fn({get:async k=>structuredClone(staged.get(k)),put:async(k,v)=>{if(this.failWrite)throw Error('disk failure');staged.set(k,structuredClone(v));}});
  this.data=staged;return result;
 });this.tail=job.catch(()=>{});return job;}
}
const cluster=crypto.randomUUID(),a=crypto.randomUUID(),b=crypto.randomUUID();
const entries=[{nodeId:a,label:'A',agentKey:'a'.repeat(43),panelKey:'b'.repeat(43)},{nodeId:b,label:'B',agentKey:'c'.repeat(43),panelKey:'d'.repeat(43)}];
const env={MHC_CLUSTER_ID:cluster,MHC_MEMBERS_JSON:JSON.stringify(entries)};
const storage=new Storage();let object=new ClusterAuthority({storage},env);
env.MHC_AUTHORITY={idFromName:id=>id,get:id=>{assert.equal(id,cluster);return {fetch:req=>object.fetch(req)};}};
const transport=(url,init)=>worker.fetch(new Request(url,init),env);
const cfg=(id,role='panel')=>({url:'https://authority.example',nodeId:id,clusterId:cluster,token:entries.find(n=>n.nodeId===id)[role+'Key']});
const call=(id,action,body={},role='panel')=>authorityRequest(cfg(id,role),action,body,transport);
const heartbeat=(id,sequence)=>call(id,'heartbeat',{sequence,sentAt:Date.now()},'agent');
assert.equal((await call(a,'status')).revision,0);
await Promise.all([heartbeat(a,1),heartbeat(b,1)]);
await assert.rejects(heartbeat(a,1),/HEARTBEAT_REPLAY/);
await assert.rejects(call(a,'heartbeat',{sequence:2,sentAt:Date.now()}),/ROLE_DENIED/);
await assert.rejects(call(a,'begin',{requestId:crypto.randomUUID(),expectedRevision:0,targetNodeId:b},'agent'),/ROLE_DENIED/);
await assert.rejects(authorityRequest({...cfg(a),token:'x'.repeat(43)},'status',{},transport),/UNAUTHORIZED/);
const requests=[{requestId:crypto.randomUUID(),expectedRevision:0,targetNodeId:b},{requestId:crypto.randomUUID(),expectedRevision:0,targetNodeId:a}];
const concurrent=await Promise.allSettled([call(a,'begin',requests[0]),call(b,'begin',requests[1])]);
assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
const winner=concurrent.findIndex(x=>x.status==='fulfilled'),node=winner===0?a:b;
const first=concurrent[winner].value;
assert.equal(first.revision,1);assert.equal(first.epoch,1);assert.equal(first.writeLeaseGranted,false);
object=new ClusterAuthority({storage},env); // process recreation, pending state persists
const replay=await call(node,'begin',requests[winner]);
assert.deepEqual(replay.receipt,first.receipt);assert.equal(replay.revision,1);
assert.deepEqual((await call(a,'status')).pending,(await call(b,'status')).pending);
await assert.rejects(call(node,'begin',{...requests[winner],targetNodeId:crypto.randomUUID()}),/IDEMPOTENCY_CONFLICT/);
const abort={requestId:crypto.randomUUID(),expectedRevision:1,operationId:first.pending.operationId};
storage.failWrite=true;
await assert.rejects(call(b,'abort',abort),/AUTHORITY_STORAGE_UNAVAILABLE/);
assert.equal((await call(a,'status')).revision,1);
storage.failWrite=false;
assert.equal((await call(b,'abort',abort)).revision,2);
assert.equal((await call(b,'abort',abort)).revision,2);
assert.equal((await call(a,'status')).pending,null);
const stale=structuredClone(storage.data.get('state'));stale.heartbeats[b].receivedAt=Date.now()-200000;storage.data.set('state',stale);
await assert.rejects(call(a,'begin',{requestId:crypto.randomUUID(),expectedRevision:2,targetNodeId:b}),/TARGET_HEARTBEAT_STALE/);
await assert.rejects(call(a,'heartbeat',{sequence:2,sentAt:Date.now()+120000},'agent'),/HEARTBEAT_INVALID/);
const encoded=JSON.stringify(await call(a,'status'));for(const n of entries){assert(!encoded.includes(n.agentKey));assert(!encoded.includes(n.panelKey));}
assert.equal([...storage.data.keys()].filter(k=>k.startsWith('audit:')).length,2);
await assert.rejects(authorityRequest(cfg(a),'status',{},async()=>{throw Error('offline');}),/AUTHORITY_UNREACHABLE/);
await assert.rejects(authorityRequest({...cfg(a),url:'http://authority.example'},'status',{},transport),/HTTPS_ORIGIN_REQUIRED/);
await assert.rejects(authorityRequest(cfg(a),'status',{},async(url,init)=>{
 const r=await transport(url,init),data=await r.json();data.nonce=crypto.randomUUID();return Response.json(data);
}),/REPLY_MISMATCH/);
const unauthorized=await worker.fetch(new Request('https://authority.example/v1/clusters/'+cluster+'/begin',{method:'POST',headers:{'x-mhc-internal-role':'panel'}}),env);
assert.equal(unauthorized.status,401);
const report=await call(a,'heartbeat',{sequence:2,sentAt:Date.now(),telemetry:{v:1,services:{'amh-panel':'running'},onboarding:{v:1,installPhase:'INSTALLED',sourceCommit:'f'.repeat(40),completedStages:6,authorityConfigured:true,managementRunning:true,tunnelRunning:true,eligiblePrimary:true,routeVerified:true,siteVerified:true,blockers:['SITE_RESTORE_AND_GUARDS_REQUIRED','SECRET_DO_NOT_LEAK'],secret:'SECRET_DO_NOT_LEAK'}}},'agent');
const onboarding=report.nodes.find(n=>n.nodeId===a).telemetry.onboarding;
assert.equal(onboarding.installPhase,'INSTALLED');assert.equal(onboarding.eligiblePrimary,false);assert.equal(onboarding.siteVerified,false);assert.equal(onboarding.routeVerified,false);assert(!JSON.stringify(report).includes('SECRET_DO_NOT_LEAK'));assert.equal(report.writeLeaseGranted,false);
console.log('PASS: shared authority concurrency, role auth, replay, durable retry, crash recovery, storage failure and client fail-closed (in-memory storage fixture)');
