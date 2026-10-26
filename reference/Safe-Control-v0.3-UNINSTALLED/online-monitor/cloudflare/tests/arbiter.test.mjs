import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ClusterArbiter} from '../src/arbiter.mjs';
class DB{
 constructor(){this.db=new DatabaseSync(':memory:');}
 exec(q,...params){if(q.trim().startsWith('CREATE TABLE')){this.db.exec(q);return {toArray:()=>[]};}
 const p=this.db.prepare(q),v=/^\s*SELECT/i.test(q)?p.all(...params):(p.run(...params),[]);
 return {toArray:()=>v};}
}
const cluster='ee3ce620-43ae-43a8-907b-c69602802a1a';
const M51='534d051b-b9c2-46bb-bbc1-94e4f9328bb1',X7b='534d051b-b9c2-46bb-bbc1-94e4f9328bb2';
function create(){const control=new ClusterArbiter({storage:{sql:new DB()}},{});const send=async(action,payload)=>{
 const r=await control.fetch(new Request('https://arbiter.internal/'+action,{method:'POST',body:JSON.stringify({clusterId:cluster,...payload})}));return {code:r.status,...await r.json()};};
 return send;}
const good=(fenced=true)=>({fencingReady:true,databaseReady:true,filesReady:true,replicationCaughtUp:true,gtid:'0-1-217',fileSeal:'a'.repeat(64),fenced});
test('fail closed by default, no leases without explicit policy',async()=>{
 const send=create();let x=await send('pulse',{nodeId:M51,proof:good()});assert.equal(x.action,'observe');
 x=await send('view',{});assert.equal(x.mode,'observe');assert.equal(x.authoritativeLeader,null);
});
test('manual handover fences old writer before new term',async()=>{
 const send=create();for(const nodeId of [M51,X7b])await send('pulse',{nodeId,proof:good()});
 let x=await send('policy',{mode:'manual',preferredNodeId:M51,expectedTerm:0});assert.equal(x.code,200);
 x=await send('switch',{targetNodeId:M51,expectedTerm:0});assert.equal(x.code,200);
 x=await send('pulse',{nodeId:M51,proof:good()});assert.equal(x.action,'serve');assert.equal(x.term,1);
 x=await send('pulse',{nodeId:M51,proof:good(false)});assert.equal(x.action,'serve');
 x=await send('switch',{targetNodeId:X7b,expectedTerm:1});assert.equal(x.code,200);
 x=await send('pulse',{nodeId:X7b,proof:good()});assert.equal(x.action,'fence');
 x=await send('pulse',{nodeId:M51,proof:good(false)});assert.equal(x.action,'fence');
 x=await send('pulse',{nodeId:M51,proof:good()});assert.equal(x.action,'fence');
 x=await send('pulse',{nodeId:X7b,proof:good()});assert.equal(x.action,'serve');assert.equal(x.term,2);
 x=await send('pulse',{nodeId:M51,proof:good()});assert.equal(x.action,'fence');
 const state=await send('view',{});assert.equal(state.authoritativeLeader,X7b);
});
test('deny mismatched GTID/file seal, stale terms, and offline leases',async()=>{
 const send=create();for(const nodeId of [M51,X7b])await send('pulse',{nodeId,proof:good()});
 await send('policy',{mode:'auto',preferredNodeId:M51,expectedTerm:0});
 let x=await send('switch',{targetNodeId:M51,expectedTerm:0});assert.equal(x.code,200);
 x=await send('pulse',{nodeId:M51,proof:good()});assert.equal(x.action,'serve');
 x=await send('policy',{mode:'auto',preferredNodeId:X7b,expectedTerm:0});assert.equal(x.code,409);
 x=await send('pulse',{nodeId:X7b,proof:{...good(),gtid:'0-1-216'}});assert.equal(x.action,'fence');
 x=await send('switch',{targetNodeId:X7b,expectedTerm:1});assert.equal(x.code,409);
 const state=await send('view',{});assert.equal(state.term,1);
});
test('non-eligible nodes never get a lease',async()=>{
 const send=create();await send('pulse',{nodeId:M51,proof:{...good(),fencingReady:false}});
 await send('policy',{mode:'auto',preferredNodeId:M51,expectedTerm:0});
 let x=await send('switch',{targetNodeId:M51,expectedTerm:0});assert.equal(x.code,409);
 x=await send('pulse',{nodeId:M51,proof:good()});assert.equal(x.action,'fence');
});
test('auto failback requests planned drain when preferred peer catches up',async()=>{
 const send=create();for(const nodeId of [M51,X7b])await send('pulse',{nodeId,proof:good()});
 await send('policy',{mode:'manual',preferredNodeId:M51,expectedTerm:0});
 await send('switch',{targetNodeId:X7b,expectedTerm:0});
 let x=await send('pulse',{nodeId:X7b,proof:good()});assert.equal(x.action,'serve');
 await send('policy',{mode:'auto',preferredNodeId:M51,expectedTerm:1});
 x=await send('pulse',{nodeId:X7b,proof:good(false)});assert.equal(x.action,'fence');
 x=await send('pulse',{nodeId:X7b,proof:good()});assert.equal(x.action,'fence');
 x=await send('pulse',{nodeId:M51,proof:good()});assert.equal(x.action,'serve');assert.equal(x.term,2);
});
test('expired lease is not remotely fenced by its TTL alone',async()=>{
 const d=new DB(),x=new ClusterArbiter({storage:{sql:d}},{});
 const send=async(a,p)=>{const r=await x.fetch(new Request('https://arbiter.internal/'+a,{method:'POST',body:JSON.stringify({clusterId:cluster,...p})}));return r.json();};
 for(const nodeId of [M51,X7b])await send('pulse',{nodeId,proof:good()});
 await send('policy',{mode:'auto',preferredNodeId:M51,expectedTerm:0});
 await send('switch',{targetNodeId:M51,expectedTerm:0});
 await send('pulse',{nodeId:M51,proof:good()});
 d.exec('UPDATE clusters SET expires_ms=? WHERE cluster_id=?',Date.now()-1000,cluster);
 const v=await send('pulse',{nodeId:X7b,proof:good()});
 assert.equal(v.action,'fence');assert.match(v.reason,/fencing attestation/);
});
