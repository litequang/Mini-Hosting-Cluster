// Cloudflare DO witness tests with isolated in-memory SQLite-KV stand-in.
// The Cloudflare service is NOT deployed; this validates source behavior only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import worker,{LabWitness,SCOPE} from '../reference/cloudflare-lab-witness/worker.mjs';
import {witnessRequest} from '../bin/lease-witness-lab.mjs';
let n=0;function check(v,msg){assert.ok(v,msg);n++}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-witness-test-'));
const originalTime=Date.now;let now=1700000000000;
Date.now=()=>now;
try{
 const store=new Map();const ctx={storage:{kv:{get(k){return store.get(k)},put(k,v){store.set(k,structuredClone(v))}},sync:async()=>{}}};
 let seen=0;const witness=new LabWitness(ctx,{});
 const env={LAB_ADMIN_TOKEN:'A'.repeat(48),LAB_NODE_KEYS_JSON:JSON.stringify({lab_A:'a'.repeat(48),lab_B:'b'.repeat(48)}),
  LAB_WITNESSES:{idFromName(x){return x},get(id){check(id==='lab-cluster','isolated cluster');return {fetch:r=>{seen++;return witness.fetch(r)}}}}};
 const cfgA={url:'https://lab-witness.example/',clusterId:'lab-cluster',nodeId:'lab_A'};
 const cfgB={...cfgA,nodeId:'lab_B'};
 const fake=(u,opts)=>worker.fetch(new Request(u,opts),env);
 const req=(cfg,action,tok,body,admin=false)=>witnessRequest(cfg,action,tok,body,admin,fake);
 const direct=async(action,tok,node='',data=undefined,nonce='0'.repeat(32))=>{
  const method=data===undefined?'GET':'POST';
  const p='https://lab-witness.example/v1/lab/lab-cluster/'+action+(['status','verify'].includes(action)?'?nonce='+nonce:'');
  const h={'authorization':'Bearer '+tok,'x-mhc-lab-node':node};
  const r=await worker.fetch(new Request(p,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)}),env);
  return [r.status,await r.json()];
 };
 // Auth is checked in front worker, never routed to durable storage on failure.
 let before=seen;
 let [status]=await direct('status','wrong','lab_A');check(status===401,'unauthorized');
 check(seen===before,'unauthorized never sees DO');
 [status]=await direct('verify','a'.repeat(48),'lab_B');check(status===401,'node token cannot impersonate');
 [status]=await direct('freeze','a'.repeat(48),'lab_A',{});check(status===403,'node cannot freeze');
 [status]=await direct('grant-initial','a'.repeat(48),'lab_A',{nodeId:'lab_A'});check(status===403,'node cannot grant');
 [status]=await direct('verify','A'.repeat(48),'lab_A');check(status===403,'admin not node');
 [status]=await direct('status','a'.repeat(48),'lab_A',undefined,'missing-nonce');check(status===400,'nonce required');
 const mis=await req(cfgA,'status','x'.repeat(48));check(!mis.labGatePass&&mis.status==='UNAVAILABLE','auth failure fail closed');
 const empty=await req(cfgA,'status','a'.repeat(48));check(empty.phase==='EMPTY'&&empty.epoch===0&&!empty.labGatePass,'empty witness');
 check(!(await req(cfgA,'verify','a'.repeat(48))).labGatePass,'no bootstrap no writer');
 // Concurrent INITIAL GRANT requests: only one can be written (no await in critical section).
 const [g1,g2]=await Promise.all([req(cfgA,'grant-initial','A'.repeat(48),{nodeId:'lab_A'},true),req(cfgB,'grant-initial','A'.repeat(48),{nodeId:'lab_B'},true)]);
 check([g1,g2].filter(x=>x.status==='OBSERVED').length===1,'only one grant');
 check([g1,g2].filter(x=>x.status==='DENIED').length===1,'competing bootstrap denied');
 const owner=g1.status==='OBSERVED'?cfgA:cfgB,other=owner===cfgA?cfgB:cfgA;
 const ownerToken=owner===cfgA?'a'.repeat(48):'b'.repeat(48),otherToken=other===cfgA?'a'.repeat(48):'b'.repeat(48);
 check((await req(owner,'verify',ownerToken)).labGatePass,'owner eligible in diagnostic gate');
 check(!(await req(other,'verify',otherToken)).labGatePass,'nonowner denied');
 const e=await req(owner,'status',ownerToken);check(e.phase==='LEASED'&&e.epoch===1,'term starts at 1');
 check(e.haEligible===false&&e.realWriteGateInstalled===false,'not production gate');
 check((await req(owner,'renew',ownerToken,{epoch:2})).status==='DENIED','wrong epoch renewal');
 check((await req(other,'renew',otherToken,{epoch:1})).status==='DENIED','other node renewal');
 now+=11000;check((await req(owner,'renew',ownerToken,{epoch:1})).status==='OBSERVED','owner renews before expiry');
 now+=100;check((await req(owner,'verify',ownerToken)).labGatePass,'renewal extends lease');
 // Failure injection: network, invalid payload, nonce replay, invalid TTL, 403.
 check((await witnessRequest(owner,'verify',ownerToken,undefined,false,async()=>{throw Error('network down')})).labGatePass===false,'network outage fail closed');
 check((await witnessRequest(owner,'verify',ownerToken,undefined,false,async()=>new Response('{}',{status:200}))).labGatePass===false,'invalid response fail closed');
 check((await witnessRequest(owner,'verify',ownerToken,undefined,false,async()=>new Response(JSON.stringify({scope:SCOPE,productionReady:false,haEligible:false,action:'verify',nonce:'x',phase:'LEASED',epoch:1,serverNowMs:now,expiresAtMs:now+12000,callerOwnsLease:true,allowedForLabGate:true}),{status:200}))).labGatePass===false,'replayed nonce blocked');
 check((await witnessRequest(owner,'verify',ownerToken,undefined,false,async(u,opts)=>{
  const r=await fake(u,opts),data=await r.json();return new Response(JSON.stringify({...data,expiresAtMs:data.serverNowMs+1}),{status:200});})).labGatePass===false,'too short remaining lease');
 now+=12001;
 check(!(await req(owner,'verify',ownerToken)).labGatePass,'expired denies');
 const frozen=await req(owner,'status',ownerToken);check(frozen.phase==='FROZEN','expiry persists FROZEN');
 check(store.get('lease').phase==='FROZEN','durable frozen state');
 check((await req(owner,'renew',ownerToken,{epoch:1})).status==='DENIED','renew cannot resurrect expired lease');
 check((await req(owner,'grant-initial','A'.repeat(48),{nodeId:owner.nodeId},true)).status==='DENIED','no rebootstrap');
 check((await req(other,'grant-initial','A'.repeat(48),{nodeId:other.nodeId},true)).status==='DENIED','no failover promotion');
 // DO state survives object restart: same persistent storage map; terminal state stays.
 const rebooted=new LabWitness(ctx,{});const old=witness.fetch;witness.fetch=(r)=>rebooted.fetch(r);
 check((await req(owner,'status',ownerToken)).phase==='FROZEN','persist across DO cold start');
 witness.fetch=old;
 check((await req(owner,'freeze','A'.repeat(48),{},true)).phase==='FROZEN','admin freeze idempotent');
 const saved=structuredClone(store.get('lease'));store.set('lease',{...saved,phase:'BROKEN'});
 const bad=await req(owner,'status',ownerToken);check(bad.labGatePass===false,'invalid storage blocked');
 store.set('lease',saved);
 now=saved.lastSeenMs-100;
 check((await req(owner,'status',ownerToken)).phase==='FROZEN','clock rollback remains frozen');
 // Client subprocess config safety. Importing CLI does not touch live services.
 const cli=path.join(process.argv[2]||path.dirname(path.dirname(new URL(import.meta.url).pathname)),'bin/lease-witness-lab.mjs');
 const home=path.join(temp,'home');const dir=path.join(home,'.config/mhc-witness-lab');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(dir,'client.json'),JSON.stringify(cfgA),{mode:0o600});fs.writeFileSync(path.join(dir,'node-token'),'a'.repeat(48)+'\n',{mode:0o600});
 fs.writeFileSync(path.join(dir,'admin-token'),'A'.repeat(48)+'\n',{mode:0o600});
 const invoke=(arg)=>spawnSync(process.execPath,[cli,...arg],{env:{...process.env,HOME:home},encoding:'utf8',timeout:4000});
 check(invoke(['plan']).status===0,'plan works without secret');
 check(invoke(['bootstrap']).status!==0,'mutation requires confirmation');
 check(invoke(['freeze']).status!==0,'freeze requires confirmation');
 fs.chmodSync(path.join(dir,'node-token'),0o644);check(invoke(['status']).status!==0,'world-readable token blocked');
 fs.chmodSync(path.join(dir,'node-token'),0o600);
 fs.chmodSync(dir,0o755);check(invoke(['status']).status!==0,'world-readable directory blocked');
 fs.chmodSync(dir,0o700);
 fs.mkdirSync(path.join(home,'.config/mhc-full-installer/static'),{recursive:true});
 check(invoke(['bootstrap','--confirm=ISOLATED_WITNESS_LAB_ONLY']).status!==0,'registered website blocks mutating witness');
 fs.rmSync(path.join(home,'.config/mhc-full-installer/static'),{recursive:true});
 console.log(`PASS: v0.5B2 Cloudflare DO witness LAB + fail-closed client — ${n} checks; simulated storage/network; NO device or Cloudflare deployment`);
}finally{Date.now=originalTime;fs.rmSync(temp,{recursive:true,force:true})}
