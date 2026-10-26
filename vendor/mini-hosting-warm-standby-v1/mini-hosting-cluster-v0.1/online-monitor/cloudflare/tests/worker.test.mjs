import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker,{MonitorStore,sanitize} from '../src/worker.mjs';

class SQLMock {
 constructor(){this.db=new DatabaseSync(':memory:');}
 exec(query,...params){
  if(query.trim().startsWith('CREATE TABLE')){this.db.exec(query);return {toArray:()=>[]};}
  const st=this.db.prepare(query);
  const arr=/^\s*SELECT/i.test(query)?st.all(...params):(st.run(...params),[]);
  return {toArray:()=>arr};
 }
}
function setup(){
 const obj=new MonitorStore({storage:{sql:new SQLMock()}},{});
 const env={ACCESS_ALLOWED_EMAIL:'owner@example.com',STORE:{idFromName:()=> 'store',get:()=>({fetch:r=>obj.fetch(r)})}};
 const viewer={access:{getIdentity:async()=>({email:'owner@example.com'})}};
 const req=(host,path,method='GET',body,extra={})=>new Request(`https://${host}${path}`,{method, ...(body?{body:JSON.stringify(body)}:{}),headers:{...(body?{'content-type':'application/json'}:{}),...extra}});
 return {env,viewer,req};
}
const CLUSTER='a10c1f07-c05b-4770-a991-c3e6f2f6b970',NODE='a10c1f07-c05b-4770-a991-c3e6f2f6b971';
test('cloud monitor defaults to deny without authenticated Cloudflare Access',async()=>{
 const {env,req}=setup();
 assert.equal((await worker.fetch(req('monitor.thophuong.com','/'),env,{})).status,403);
 assert.equal((await worker.fetch(req('other.thophuong.com','/'),env,{})).status,404);
});
test('Access authenticated viewer pairing, single-use registration, authorized node health',async()=>{
 const {env,viewer,req}=setup();
 let response=await worker.fetch(req('monitor.thophuong.com','/api/pair','POST'),env,viewer);
 assert.equal(response.status,200);let {pairingCode}=await response.json();assert.ok(pairingCode.length>=70);
 const token='token-'+('a'.repeat(48));
 let identity={clusterId:CLUSTER,nodeId:NODE,label:'HONOR X7b',pairingCode,token};
 response=await worker.fetch(req('telemetry.thophuong.com','/v1/enroll','POST',identity),env,{});assert.equal(response.status,200);
 response=await worker.fetch(req('telemetry.thophuong.com','/v1/enroll','POST',{...identity,nodeId:'e10c1f07-c05b-4770-a991-c3e6f2f6b972'}),env,{});assert.equal(response.status,403);
 const hb={clusterId:CLUSTER,nodeId:NODE,label:'HONOR X7b',declaredRole:'standby',services:{miniWeb:'down',mysqld:'run',tunnel:'down'},monitor:{battery:{available:false},memory:{total:1000,available:500},disk:{total:9000,available:8000},nodeProcesses:[{name:'Thờ Phượng Pro · Web/API',rssBytes:50000000,args:'--secret password'}]}};
 response=await worker.fetch(req('telemetry.thophuong.com','/v1/heartbeat','POST',hb,{authorization:'Bearer WRONG-TOKEN-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'}),env,{});assert.equal(response.status,403);
 response=await worker.fetch(req('telemetry.thophuong.com','/v1/heartbeat','POST',hb,{authorization:'Bearer '+token}),env,{});assert.equal(response.status,200);
 response=await worker.fetch(req('monitor.thophuong.com','/api/nodes'),env,viewer);assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.nodes.length,1);assert.equal(data.nodes[0].online,true);assert.equal(data.nodes[0].health.monitor.nodeProcesses[0].args,undefined);
 assert.deepEqual(data.observedServingCandidates,[]);assert.equal(data.authoritativeLeader,null);
});
test('sanitize never includes credentials, env, process args, wifi network names',()=>{
 const data=sanitize({nodeId:NODE,clusterId:CLUSTER,label:'M51',secret:'database-password',wifiSSID:'Personal',monitor:{nodeProcesses:[{name:'web',args:'--password 123',rssBytes:123}]} });
 const str=JSON.stringify(data);
 assert.equal(str.includes('password'),false);assert.equal(str.includes('Personal'),false);assert.equal(data.monitor.nodeProcesses[0].name,'web');
});
