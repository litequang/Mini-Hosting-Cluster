import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import Worker,{ClusterLease} from '../src/worker.mjs';
const C=crypto.randomUUID(),A=crypto.randomUUID(),B=crypto.randomUUID(),admin='X'.repeat(64),keyA='a'.repeat(48),keyB='b'.repeat(48);
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function createSystem(){const db=new DatabaseSync(':memory:');const sql={exec(q,...args){let stmt=db.prepare(q);if(/^SELECT\b/.test(q))return {toArray:()=>stmt.all(...args)};stmt.run(...args);return {toArray:()=>[]};}};
 const doObj=new ClusterLease({storage:{sql}},{});const env={HA_ADMIN_TOKEN:admin,CLUSTERS:{idFromName:()=>C,get:()=>({fetch:r=>doObj.fetch(r)})}};
 async function call(route,token,payload={}){const r=await Worker.fetch(new Request('https://ha-control.thophuong.com/v1/'+route,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({clusterId:C,...payload})}),env);return {status:r.status,data:await r.json()};}
 return {call,db};}
const health=(id,extra={})=>({clusterId:C,nodeId:id,appDatabase:'thophuong_pro',observedAt:new Date().toISOString(),services:{miniWeb:'down',tunnel:'down'},db:{available:true,logBin:true,readOnly:true,serverId:id===A?11:12,gtidBinlogPos:'0-11-100',gtidSlavePos:'0-11-100',slaveIo:'Yes',slaveSql:'Yes',secondsBehind:0},assets:{verified:true,checkpoint:'1'.repeat(64),observedAt:new Date().toISOString()},...extra});
async function enroll(s){let v=await s.call('admin/register',admin,{nodeId:A,nodeTokenHash:digest(keyA)});assert.equal(v.status,200);v=await s.call('admin/register',admin,{nodeId:B,nodeTokenHash:digest(keyB)});assert.equal(v.status,200);}
test('cloud arbiter serializes lease, rejects unregistered and stale grant',async()=>{
 const s=createSystem();await enroll(s);
 let v=await s.call('admin/config',admin,{mode:'manual',preferredNodeId:A,maxRpoSeconds:30});assert.equal(v.status,200);
 v=await s.call('lease',keyB,{nodeId:B,proof:health(B)});assert.equal(v.data.granted,false);assert.equal(v.data.reason,'NOT_SELECTED');
 v=await s.call('lease',keyA,{nodeId:A,proof:health(A)});assert.equal(v.data.granted,true);assert.equal(v.data.term,1);
 v=await s.call('lease',keyB,{nodeId:B,proof:health(B)});assert.equal(v.data.granted,false);assert.equal(v.data.reason,'LEASE_HELD');
 v=await s.call('lease','wrong'.repeat(12),{nodeId:A,proof:health(A)});assert.equal(v.status,403);
 v=await s.call('lease',keyA,{nodeId:A,proof:health(A,{assets:{verified:false}})});assert.equal(v.data.granted,true);assert.equal(v.data.term,1); // Renewing primary does not hash 500 MB every 3 seconds
});
test('release fences old leader; rejects missing proof and split-brain takeover',async()=>{
 const s=createSystem();await enroll(s);await s.call('admin/config',admin,{mode:'manual',preferredNodeId:A,maxRpoSeconds:0});
 await s.call('lease',keyA,{nodeId:A,proof:health(A)});
 // A planned fence may take longer than 30s to re-hash the entire storage tree.
 s.db.prepare('UPDATE control SET expiry=0 WHERE id=1').run();
 let v=await s.call('release',keyA,{nodeId:A,targetNodeId:B,proof:health(A,{db:{...health(A).db,readOnly:false}})});
 assert.equal(v.status,409);
 v=await s.call('release',keyA,{nodeId:A,targetNodeId:B,proof:health(A)});assert.equal(v.status,200);
 v=await s.call('lease',keyA,{nodeId:A,proof:health(A)});assert.equal(v.data.granted,false);
 v=await s.call('lease',keyB,{nodeId:B,proof:health(B)});assert.equal(v.data.granted,true);assert.equal(v.data.term,2);
 v=await s.call('lease',keyA,{nodeId:A,proof:health(A)});assert.equal(v.data.reason,'LEASE_HELD');
});
test('snapshot does not confer promotion: mismatched GTID, assets and zero-RPO block',async()=>{
 const s=createSystem();await enroll(s);await s.call('admin/config',admin,{mode:'auto',preferredNodeId:A,maxRpoSeconds:0});
 await s.call('lease',keyA,{nodeId:A,proof:health(A)});s.db.prepare('UPDATE control SET expiry=0 WHERE id=1').run();
 let v=await s.call('lease',keyB,{nodeId:B,proof:health(B)});assert.equal(v.data.reason,'RPO_UNPROVEN');
 await s.call('admin/config',admin,{mode:'auto',preferredNodeId:A,maxRpoSeconds:60});
 v=await s.call('lease',keyB,{nodeId:B,proof:health(B,{db:{...health(B).db,gtidSlavePos:'0-11-99'}})});assert.equal(v.data.reason,'GTID_MISMATCH');
 v=await s.call('lease',keyB,{nodeId:B,proof:health(B,{assets:{...health(B).assets,checkpoint:'2'.repeat(64)}})});assert.equal(v.data.reason,'ASSETS_MISMATCH');
 v=await s.call('lease',keyB,{nodeId:B,proof:health(B)});assert.equal(v.data.granted,true);
});
