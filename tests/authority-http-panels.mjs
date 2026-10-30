// Two real Panel HTTP processes + real TLS client + Worker storage fixture.
// This is NOT two Android devices or a deployed Cloudflare Durable Object.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import worker,{ClusterAuthority} from '../reference/cluster-authority/worker.mjs';
import {prepareSecrets} from '../reference/cluster-authority/prepare-secrets.mjs';
if(process.platform==='win32'){console.log('NOT RUN: authority HTTP panels requires POSIX permissions and openssl; run on Termux/Linux.');process.exit(0);}
const root=path.resolve(process.argv[2]||'.'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-authority-http-'));
const client=path.join(root,'bin/cluster-authority.mjs'),cluster=crypto.randomUUID(),children=[];
let tls,offline=false,object;
const storage={data:new Map(),tail:Promise.resolve(),transaction(fn){
 const result=this.tail.then(async()=>{const next=new Map(structuredClone([...this.data]));const v=await fn({get:async k=>structuredClone(next.get(k)),put:async(k,v)=>next.set(k,structuredClone(v))});this.data=next;return v;});
 this.tail=result.catch(()=>{});return result;
}};
function child(args,env){return new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 const timeout=setTimeout(()=>{p.kill();reject(Error('CHILD_TIMEOUT'));},15000);
 p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);
 p.on('error',e=>{clearTimeout(timeout);reject(e);});p.on('exit',code=>{clearTimeout(timeout);resolve({code,stdout,stderr});});
});}
const port=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const write=(file,v)=>fs.writeFileSync(file,typeof v==='string'?v:JSON.stringify(v),{mode:0o600});
try{
 const cert=path.join(tmp,'cert.pem'),key=path.join(tmp,'key.pem');
 const ssl=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore',timeout:15000});
 assert.equal(ssl.status,0,'openssl fixture certificate generation');
 const nodes=[];
 for(let i=0;i<2;i++){
  const home=path.join(tmp,'node'+i),cfg=path.join(home,'.config/mhc-full-installer');fs.mkdirSync(cfg,{recursive:true,mode:0o700});
  const id=crypto.randomUUID();write(path.join(cfg,'node-identity.json'),{schema:1,nodeId:id,label:'LAB '+i});write(path.join(cfg,'installed'),'TEST 0.5.0C-REMOTE-PANEL installed on clean Termux');
  const env={...process.env,HOME:home,NODE_EXTRA_CA_CERTS:cert,PREFIX:path.join(home,'prefix')};
  const prepare=await child([client,'prepare'],env);assert.equal(prepare.code,0,prepare.stderr);
  const file=path.join(cfg,'authority-enrollment.json'),bytes=fs.readFileSync(file);
  assert.equal((await child([client,'prepare'],env)).code,0);assert.deepEqual(fs.readFileSync(file),bytes,'prepare must not rotate keys');
  const membership=JSON.parse(bytes);assert(!prepare.stdout.includes(membership.agentKey));assert(!prepare.stdout.includes(membership.panelKey));
  fs.mkdirSync(path.join(home,'apps/thophuongpro'),{recursive:true});write(path.join(home,'apps/thophuongpro/.env'),'fixture');
  assert.notEqual((await child([client,'prepare'],env)).code,0,'production footprint rejected');fs.unlinkSync(path.join(home,'apps/thophuongpro/.env'));
  assert(!fs.existsSync(path.join(cfg,'authority.json')),'prepare cannot enable shared mode');
  nodes.push({home,cfg,id,env,file,membership});
 }
 const secrets=path.join(tmp,'secrets.json');prepareSecrets(secrets,cluster,nodes.map(n=>n.file));
 assert.equal(fs.statSync(secrets).mode&0o777,0o600);
 assert.throws(()=>prepareSecrets(secrets,cluster,nodes.map(n=>n.file)),/EEXIST/);
 assert.throws(()=>prepareSecrets(path.join(tmp,'duplicate.json'),cluster,[nodes[0].file,nodes[0].file]),/DUPLICATE/);
 assert(!fs.existsSync(path.join(tmp,'duplicate.json')));
 fs.chmodSync(nodes[0].file,0o644);
 assert.throws(()=>prepareSecrets(path.join(tmp,'unsafe.json'),cluster,nodes.map(n=>n.file)),/UNSAFE/);
 fs.chmodSync(nodes[0].file,0o600);assert(!fs.existsSync(path.join(tmp,'unsafe.json')));
 const env=JSON.parse(fs.readFileSync(secrets,'utf8'));
 env.MHC_AUTHORITY={idFromName:id=>id,get:()=>({fetch:req=>object.fetch(req)})};object=new ClusterAuthority({storage},env);
 tls=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},async(req,res)=>{
  try{if(offline){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"AUTHORITY_UNAVAILABLE"}');return;}
   const chunks=[];for await(const b of req)chunks.push(b);
   const r=await worker.fetch(new Request('https://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})}),env);
   res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
  }catch{res.writeHead(500);res.end();}
 });
 await new Promise(resolve=>tls.listen(0,'127.0.0.1',resolve));const origin='https://127.0.0.1:'+tls.address().port;
 for(const n of nodes){
  const args=[client,'configure',origin,cluster,'--confirm=CONFIGURE_LAB_PREPARE_ONLY'];
  assert.notEqual((await child([client,'configure',origin.replace('https:','http:'),cluster,'--confirm=CONFIGURE_LAB_PREPARE_ONLY'],n.env)).code,0);
  // Failed handshake never installs config.
  offline=true;assert.notEqual((await child(args,n.env)).code,0);assert(!fs.existsSync(path.join(n.cfg,'authority.json')));offline=false;
  const result=await child(args,n.env);assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).writeLeaseGranted,false);
  assert.equal((await child(args,n.env)).code,0,'configure retry');
  const original=fs.readFileSync(path.join(n.cfg,'authority.json'));
  assert.notEqual((await child([client,'configure',origin,crypto.randomUUID(),'--confirm=CONFIGURE_LAB_PREPARE_ONLY'],n.env)).code,0);
  assert.deepEqual(fs.readFileSync(path.join(n.cfg,'authority.json')),original);
  assert.equal((await child([client,'heartbeat'],n.env)).code,0);
  const panel=path.join(n.home,'android-hosting-panel');
  fs.cpSync(path.join(root,'vendor/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/panel'),panel,{recursive:true});
  fs.cpSync(path.join(root,'bin/legacy-panel-src'),panel,{recursive:true});
  const installed=path.join(n.home,'.local/share/mhc-full-installer/bin');fs.mkdirSync(installed,{recursive:true});fs.copyFileSync(client,path.join(installed,'cluster-authority.mjs'));for(const f of ['authority-traffic.mjs','authority-usage.mjs'])fs.copyFileSync(path.join(root,'bin',f),path.join(installed,f));
  fs.mkdirSync(path.join(panel,'data'),{recursive:true});const salt=crypto.randomBytes(16).toString('hex');n.password=crypto.randomBytes(24).toString('base64url');
  write(path.join(panel,'data/admin.json'),{salt,hash:crypto.scryptSync(n.password,salt,64).toString('hex')});
  n.port=await port();n.base='http://127.0.0.1:'+n.port;
  const p=spawn(process.execPath,[path.join(panel,'src/server.mjs')],{env:{...n.env,AMH_PORT:String(n.port)},stdio:'ignore'});children.push(p);n.process=p;
  let ready=false;for(let i=0;i<60;i++){try{ready=(await fetch(n.base+'/api/session')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,'Panel starts');
  assert.equal((await fetch(n.base+'/api/mhc/cluster')).status,401);
  const login=await fetch(n.base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:n.password})});assert.equal(login.status,200);
  n.cookie=login.headers.get('set-cookie').split(';')[0];n.csrf=(await login.json()).csrf;
 }
 const status=async n=>(await fetch(n.base+'/api/mhc/primary-selection',{headers:{cookie:n.cookie}})).json();
 const mutate=(n,b,csrf=n.csrf)=>fetch(n.base+'/api/mhc/primary-selection',{method:'POST',headers:{cookie:n.cookie,'content-type':'application/json','x-csrf-token':csrf,origin:n.base},body:JSON.stringify(b)});
 assert.deepEqual((await status(nodes[0])).nodes,(await status(nodes[1])).nodes);
 assert.equal((await mutate(nodes[0],{},'wrong')).status,403);
 const requests=nodes.map((n,i)=>({action:'begin',id:nodes[1-i].id,expectedRevision:0,requestId:crypto.randomUUID()}));
 const races=await Promise.all(nodes.map((n,i)=>mutate(n,requests[i])));assert.equal(races.filter(r=>r.status===200).length,1);
 const winner=races.findIndex(r=>r.status===200);const first=await races[winner].json();assert.equal(first.writeLeaseGranted,false);assert.equal(first.canComplete,false);
 object=new ClusterAuthority({storage},env); // DO restart fixture preserves state
 const retry=await mutate(nodes[winner],requests[winner]);assert.equal(retry.status,200);assert.deepEqual((await retry.json()).receipt,first.receipt);
 assert.deepEqual((await status(nodes[0])).pending,(await status(nodes[1])).pending);
 nodes[0].process.kill();await new Promise(resolve=>nodes[0].process.once('exit',resolve));
 const fromSurvivor=await status(nodes[1]);assert.equal(fromSurvivor.pending.operationId,first.pending.operationId);
 assert.notEqual((await mutate(nodes[1],{action:'complete',id:first.pending.operationId,requestId:crypto.randomUUID(),expectedRevision:1})).status,200);
 const abort=await mutate(nodes[1],{action:'abort',id:first.pending.operationId,requestId:crypto.randomUUID(),expectedRevision:1});assert.equal(abort.status,200);assert.equal((await abort.json()).pending,null);
 offline=true;const unavailable=await status(nodes[1]);assert.equal(unavailable.mode,'AUTHORITY_UNAVAILABLE');assert.equal(unavailable.canComplete,false);
 const text=JSON.stringify(unavailable);for(const n of nodes){assert(!text.includes(n.membership.agentKey));assert(!text.includes(n.membership.panelKey));}
 console.log('PASS: private enrollment/config handshake/retry; two real Panel HTTP processes share TLS authority; auth/CSRF, concurrent prepare, receipt replay, DO restart fixture, surviving Panel abort, authority outage fail-closed');
 console.log('SCOPE: one machine, isolated homes/processes, in-memory DO storage. Cloudflare and two Android NOT RUN. No Primary activation/route/writer grant.');
}finally{
 for(const p of children){if(p.exitCode===null&&p.signalCode===null){p.kill();await new Promise(resolve=>p.once('exit',resolve));}}
 if(tls){tls.closeAllConnections();await new Promise(resolve=>tls.close(resolve));}
 fs.rmSync(tmp,{recursive:true,force:true});
}
