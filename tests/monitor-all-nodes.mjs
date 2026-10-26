// MHC Monitor v2: telemetry, privacy, multi-node authority and 12h history fixture.
// Run: node tests/monitor-all-nodes.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import worker,{ClusterAuthority} from '../reference/cluster-authority/worker.mjs';
import {collectNodeMetrics,compactTelemetry} from '../bin/node-monitor.mjs';
const members=[0,1].map(i=>({nodeId:crypto.randomUUID(),label:i?'Sony XZ3':'Vsmart',
 agentKey:crypto.randomBytes(32).toString('base64url'),
 panelKey:crypto.randomBytes(32).toString('base64url')}));
const clusterId=crypto.randomUUID();
let object;
const state=new Map(),storage={transaction:async(fn)=>{
 const tx={get:async k=>structuredClone(state.get(k)),put:async(k,v)=>state.set(k,structuredClone(v))};
 return fn(tx);
}};
const env={MHC_CLUSTER_ID:clusterId,MHC_MEMBERS_JSON:JSON.stringify(members),
 MHC_AUTHORITY:{idFromName:()=>clusterId,get:()=>({fetch:req=>object.fetch(req)})}};
object=new ClusterAuthority({storage},env);
const call=async(node,role,action,body={},target=null)=>{
 const url='https://authority.example/v1/clusters/'+clusterId+'/'+action;
 const headers={'authorization':'Bearer '+node[role+'Key'],'x-mhc-node':node.nodeId,
  'x-mhc-nonce':crypto.randomUUID(),'content-type':'application/json'};
 if(target)headers['x-mhc-target']=target;
 const response=await worker.fetch(new Request(url,{method:['status','history'].includes(action)?'GET':'POST',
  headers,...(['status','history'].includes(action)?{}:{body:JSON.stringify(body)})}),env);
 return {code:response.status,value:await response.json()};
};
let raw=await collectNodeMetrics();
const local=compactTelemetry(raw);
assert.equal(local.v,1);
assert.equal(Object.keys(local.services).length,9);
for(const k of ['cpu','memory','storage','network','battery','services'])assert(local[k]!==undefined,k);
assert(!JSON.stringify(local).includes(process.env.HOME||'/nonexistent-home'));
assert(!JSON.stringify(local).includes('127.0.0.1'));
const t={...local,device:'Sony XZ3',privateSsid:'DO-NOT-SHARE',network:{...local.network,ip:'10.0.0.8'},
 services:{...local.services,secret:'TOPSECRET'}};
const base=await call(members[0],'agent','status');assert.equal(base.code,200);
const hb1=await call(members[0],'agent','heartbeat',{sequence:1,sentAt:Date.now(),telemetry:t});
assert.equal(hb1.code,200);assert.equal(hb1.value.writeLeaseGranted,false);
const status=await call(members[1],'panel','status');assert.equal(status.code,200);
assert.equal(status.value.nodes[0].telemetryRecent,true);
assert.equal(status.value.nodes[0].telemetry.device,'Sony XZ3');
assert(!JSON.stringify(status.value).includes('DO-NOT-SHARE'));
assert(!JSON.stringify(status.value).includes('TOPSECRET'));
assert(!JSON.stringify(status.value).includes('10.0.0.8'));
assert.equal(status.value.nodes[1].telemetry,null);
const past=await call(members[1],'panel','history',{},members[0].nodeId);
assert.equal(past.code,200);assert.equal(past.value.history.points.length,1);
assert.equal(past.value.history.nodeId,members[0].nodeId);
assert.equal(past.value.nodes.length,0,'history omits the bulk inventory');
const forbidden=await call(members[1],'agent','history',{},members[0].nodeId);
assert.equal(forbidden.code,403);
const invalid=await call(members[0],'agent','heartbeat',{sequence:2,sentAt:Date.now(),telemetry:{v:99}});
assert.equal(invalid.code,400);
const duplicate=await call(members[0],'agent','heartbeat',{sequence:1,sentAt:Date.now()});
assert.equal(duplicate.code,409);
const legacy=await call(members[1],'agent','heartbeat',{sequence:1,sentAt:Date.now()});
assert.equal(legacy.code,200,'old agents without telemetry still work');
const latest=await call(members[1],'panel','status');
assert.equal(latest.value.revision,0);
assert.equal(latest.value.epoch,0);
assert.equal(latest.value.declaredPrimary,null);
assert.equal(latest.value.automaticFailover,false);
console.log('PASS: device metrics shape, privacy/redaction, shared 2-node telemetry, latest timestamps, 12h history, agent auth, replay, backwards-compatible heartbeat, no writer grant.');
