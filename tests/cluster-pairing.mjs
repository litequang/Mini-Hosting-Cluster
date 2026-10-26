import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker,{ClusterAuthority} from '../reference/cluster-authority/worker.mjs';
if(!globalThis.crypto)globalThis.crypto=crypto.webcrypto;
const clusterId=crypto.randomUUID(),staticId=crypto.randomUUID(),freshId=crypto.randomUUID();
const member={nodeId:staticId,label:'Vsmart',agentKey:crypto.randomBytes(32).toString('base64url'),panelKey:crypto.randomBytes(32).toString('base64url')};
const newAgent=crypto.randomBytes(32).toString('base64url'),newPanel=crypto.randomBytes(32).toString('base64url');
const entries=new Map();
const store={transaction:async fn=>{
 const clone=new Map([...entries].map(([k,v])=>[k,structuredClone(v)]));
 const result=await fn({get:async k=>clone.get(k),put:async(k,v)=>clone.set(k,structuredClone(v))});
 entries.clear();for(const [k,v] of clone)entries.set(k,v);return result;
}};
let instance;
const env={MHC_CLUSTER_ID:clusterId,MHC_MEMBERS_JSON:JSON.stringify([member]),
 MHC_AUTHORITY:{idFromName:()=>clusterId,get:()=>({fetch:r=>instance.fetch(r)})}};
instance=new ClusterAuthority({storage:store},env);
async function api(node,token,action,body={}){
 const h={'authorization':'Bearer '+token,'x-mhc-node':node,'x-mhc-nonce':crypto.randomUUID(),'content-type':'application/json'};
 const r=await worker.fetch(new Request('https://authority.example/v1/clusters/'+clusterId+'/'+action,{
  method:action==='status'?'GET':'POST',headers:h,...(action==='status'?{}:{body:JSON.stringify(body)})}),env);
 return {status:r.status,value:await r.json()};
}
const initial=await api(staticId,member.panelKey,'status');
assert.equal(initial.status,200);
const issued=await api(staticId,member.panelKey,'invite',{requestId:crypto.randomUUID(),expectedRevision:initial.value.revision});
assert.equal(issued.status,200);
assert.match(issued.value.receipt.joinSecret,/^[0-9a-f]{48}$/);
assert.equal(issued.value.receipt.action,'invite');
assert(new Date(issued.value.receipt.expiresAt)>new Date());
const unauthorized=await api(staticId,member.agentKey,'invite',{requestId:crypto.randomUUID(),expectedRevision:1});
assert.equal(unauthorized.status,403);
const invalid=await api(freshId,'','join',{nodeId:freshId,label:'XZ3',agentKey:newAgent,panelKey:newPanel,joinSecret:'0'.repeat(48)});
assert.equal(invalid.status,401);
const joined=await api(freshId,'','join',{nodeId:freshId,label:'Sony XZ3',agentKey:newAgent,panelKey:newPanel,joinSecret:issued.value.receipt.joinSecret});
assert.equal(joined.status,200);assert.equal(joined.value.receipt.joined,true);
assert.equal(joined.value.writeLeaseGranted,false);assert.equal(joined.value.declaredPrimary,null);
const replay=await api(crypto.randomUUID(),'','join',{nodeId:crypto.randomUUID(),label:'Node 2',agentKey:crypto.randomBytes(32).toString('base64url'),panelKey:crypto.randomBytes(32).toString('base64url'),joinSecret:issued.value.receipt.joinSecret});
assert.equal(replay.status,401);
const dynamicAgent=await api(freshId,newAgent,'status');
assert.equal(dynamicAgent.status,200);
assert.equal(dynamicAgent.value.nodes.length,2);
assert(dynamicAgent.value.nodes.some(n=>n.nodeId===freshId&&n.role==='STANDBY_NO_WRITER_GRANT'));
const wrongKey=await api(freshId,member.agentKey,'status');
assert.equal(wrongKey.status,401);
const denied=await api(freshId,newAgent,'invite',{requestId:crypto.randomUUID(),expectedRevision:2});
assert.equal(denied.status,403);
const hb=await api(freshId,newAgent,'heartbeat',{sequence:1,sentAt:Date.now()});
assert.equal(hb.status,200);
assert.equal(hb.value.nodes.find(n=>n.nodeId===freshId).heartbeatRecent,true);
assert.equal(hb.value.automaticFailover,false);
console.log('PASS: Panel-only invitation, 192-bit code, one use, dynamic credentials, signed-role heartbeat, static member preserved, no Primary/writer grant');
