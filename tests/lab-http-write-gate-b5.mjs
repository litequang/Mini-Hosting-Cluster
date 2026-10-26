// MHC B5 integration: actual localhost HTTP POST -> two fake witness checks -> isolated file.
// No Cloudflare connection, no Android runtime, no production website changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-b5-http-lab-'));
const prior=process.env.HOME;process.env.HOME=tmp;
let n=0;const ok=(v,m)=>{assert.ok(v,m);n++};const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++};
let server;
try{
 const src=process.argv[2];
 const gate=await import(pathToFileURL(path.join(src,'bin/write-path-gate-lab.mjs')).href);
 const api=await import(pathToFileURL(path.join(src,'bin/lab-http-write-gate.mjs')).href);
 const prefix=path.join(tmp,'.config/mhc-witness-lab');fs.mkdirSync(prefix,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(prefix,'client.json'),JSON.stringify({clusterId:'http-lab-b5',nodeId:'node-a',url:'https://example.test/'}),{mode:0o600});
 fs.writeFileSync(path.join(prefix,'node-token'),'z'.repeat(48)+'\n',{mode:0o600});
 const body=Buffer.from('MHC REAL HTTP LAB ONLY, NOT PRODUCTION');
 eq((await gate.main(['init','--confirm=ISOLATED_CANARY_WRITE_ONLY'])).status,'CANARY_LAB_INITIALIZED','must prepare fixture sandbox');
 eq((await api.main(['plan'])).haEligible,false,'plan cannot claim HA');
 eq((await api.main(['status'])).configured,false,'not initialized');
 await assert.rejects(api.main(['serve']),/Usage/);n++;
 await assert.rejects(api.main(['init']),/Usage/);n++;
 const created=await api.main(['init','--confirm=ISOLATED_HTTP_WRITE_GATE_LAB_ONLY']);
 eq(created.status,'HTTP_GATE_INITIALIZED_LAB_ONLY','init with explicit confirmation');
 ok(!created.secretExposed,'token not returned');
 await assert.rejects(api.main(['init','--confirm=ISOLATED_HTTP_WRITE_GATE_LAB_ONLY']),/ALREADY_INITIALIZED/);n++;
 const secret=path.join(tmp,'.config/mhc-lab-http-write-gate/http-token');
 const token=fs.readFileSync(secret,'utf8').trim();eq(token.length,64,'random token length');
 eq(fs.statSync(secret).mode&0o077,0,'token permissions 600');
 eq(fs.statSync(path.dirname(secret)).mode&0o077,0,'config dir permissions 700');
 let up=true,authorized=true,epoch=7,calls=0,delayHook=null;
 const witness=async(url)=>{
  calls++;
  if(delayHook){const wait=delayHook;delayHook=null;await wait();}
  if(!up)throw new Error('witness offline');
  const nonce=new URL(url).searchParams.get('nonce');
  return {ok:authorized,status:authorized?200:403,text:async()=>JSON.stringify({
   scope:'MHC_LAB_WITNESS_ONLY_NO_HA',productionReady:false,haEligible:false,action:'verify',nonce,
   phase:authorized?'LEASED':'FROZEN',epoch,serverNowMs:1000,expiresAtMs:9000,
   callerOwnsLease:authorized,allowedForLabGate:authorized})};
 };
 server=api.createLabHttpServer({check:witness});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 eq(server.address().address,'127.0.0.1','bind loopback only');
 const base=`http://127.0.0.1:${server.address().port}`;
 const request=(route,options={})=>fetch(base+route,options);
 const post=(kind,data,headers={})=>request('/v1/lab/'+kind,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/octet-stream',...headers},body:data});
 let res=await post('preview',body,{authorization:'Bearer '+'0'.repeat(64)});eq(res.status,401,'unauthorized rejects write');
 res=await request('/v1/lab/health');eq(res.status,401,'even health requires auth');
 res=await request('/v1/lab/health',{headers:{authorization:'Bearer '+token}});
 eq(res.status,200,'authenticated health returns diagnostic');let health=await res.json();
 eq(health.witnessVerifiedNow,false,'health does not imply witness observed');
 eq(health.productionProtected,false,'health does not claim production fencing');
 res=await request('/v1/lab/preview',{method:'GET',headers:{authorization:'Bearer '+token}});eq(res.status,405,'GET cannot write');
 res=await post('unknown',body);eq(res.status,404,'no arbitrary route');
 res=await post('preview',body,{origin:'https://attacker.test'});eq(res.status,403,'deny browser origin');
 res=await post('preview',body,{'content-type':'text/plain'});eq(res.status,400,'reject wrong content type');
 res=await post('job-receipt',Buffer.alloc(8193));eq(res.status,413,'body size enforced');
 eq(calls,0,'invalid requests never contact witness');
 const routes=[['canary','canaries','.bin'],['preview','static-preview','.html'],['upload-fixture','upload-fixtures','.bin'],['job-receipt','job-receipts','.json']];
 for(const [route,dir,extension] of routes){
  const before=calls;
  const out=await post(route,body);
  eq(out.status,201,'HTTP POST 201 '+route);
  const receipt=await out.json();
  eq(calls-before,2,'two live witness checks for '+route);
  ok(receipt.receiptId.endsWith(extension),'file type '+route);
  eq(receipt.sha256,crypto.createHash('sha256').update(body).digest('hex'),'payload SHA256 '+route);
  eq(fs.readFileSync(path.join(tmp,'mhc-writegate-lab',dir,receipt.receiptId)),body,'HTTP payload published '+route);
  ok(receipt.productionProtected===false&&receipt.haEligible===false,'no HA/production claims');
  ok(!JSON.stringify(receipt).includes(token),'never return HTTP token');
 }
 const count=()=>fs.readdirSync(path.join(tmp,'mhc-writegate-lab','static-preview')).length;
 const old=count();
 up=false;res=await post('preview',body);eq(res.status,503,'witness offline rejects');eq(count(),old,'no publication on outage');up=true;
 authorized=false;res=await post('preview',body);eq(res.status,503,'lease denied rejects');eq(count(),old,'no publication with denied lease');authorized=true;
 // Epoch changes exactly between two witness checks, not across test invocations.
 let changed=false;const flip=async(url,...other)=>{const r=await witness(url,...other);if(!changed){changed=true;const saved=await r.text();epoch+=1;return {...r,text:async()=>saved};}return r;};
 await new Promise(resolve=>server.close(resolve));
 server=api.createLabHttpServer({check:flip});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const target=`http://127.0.0.1:${server.address().port}/v1/lab/preview`;
 const goodHeaders={authorization:'Bearer '+token,'content-type':'application/octet-stream'};
 res=await fetch(target,{method:'POST',headers:goodHeaders,body});eq(res.status,503,'epoch change rejects real HTTP');eq(count(),old,'epoch rejects publication');
 await new Promise(resolve=>server.close(resolve));
 server=api.createLabHttpServer({check:witness});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/v1/lab/preview`;
 // One in-flight writer, even with two HTTP requests racing.
 let unblock;let seenFirst=false;
 delayHook=()=>new Promise(resolve=>{unblock=resolve;seenFirst=true});
 const pending=fetch(url,{method:'POST',headers:goodHeaders,body});
 for(let i=0;!seenFirst&&i<100;i++)await new Promise(r=>setTimeout(r,5));
 ok(seenFirst,'first HTTP request is waiting at witness');
 res=await fetch(url,{method:'POST',headers:goodHeaders,body});eq(res.status,409,'parallel HTTP writer gets busy');
 unblock();res=await pending;eq(res.status,201,'first request completes after release');
 const prod=path.join(tmp,'.config/mhc-full-installer/sites');fs.mkdirSync(prod,{recursive:true});
 res=await fetch(url,{method:'POST',headers:goodHeaders,body});eq(res.status,503,'site presence immediately blocks HTTP path');
 fs.rmSync(prod,{recursive:true});
 fs.chmodSync(secret,0o644);res=await fetch(url,{method:'POST',headers:goodHeaders,body});eq(res.status,503,'unsafe token permissions fail closed');
 fs.chmodSync(secret,0o600);
 eq((await api.main(['status'])).configured,true,'status metadata available');
 console.log(`PASS: B5 real HTTP loopback witness-gated fixture path and failures — ${n} assertions; production writes STILL NOT FENCED`);
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 process.env.HOME=prior;
 fs.rmSync(tmp,{force:true,recursive:true});
}
