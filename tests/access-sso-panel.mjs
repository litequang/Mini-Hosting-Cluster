// E2E local process: Cloudflare-signed JWT auto login is remote-only; local password stays.
// JWT/JWKS mock is test-only, never shipped as an origin fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'.');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-access-sso-'));
let proc;
const sleep=n=>new Promise(r=>setTimeout(r,n));
const port=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const x=s.address().port;s.close(()=>resolve(x));});});
const request=(port,host,route,more={})=>new Promise((resolve,reject)=>{
 const headers={host,...(more.jwt?{'cf-access-jwt-assertion':more.jwt}:{}),...(more.cookie?{cookie:more.cookie}:{}),...(more.csrf?{'x-csrf-token':more.csrf}:{}),...(more.origin?{origin:more.origin}:{})};
 const body=more.body?JSON.stringify(more.body):null;
 if(body){headers['content-type']='application/json';headers['content-length']=Buffer.byteLength(body);}
 const req=http.request({hostname:'127.0.0.1',port,path:route,method:more.method||'GET',headers},r=>{
  let raw='';r.on('data',b=>raw+=b);r.on('end',()=>{let data=null;try{data=JSON.parse(raw);}catch{}resolve({status:r.statusCode,data,cookie:r.headers['set-cookie']?.[0]||''});});
 });
 req.on('error',reject);req.end(body);
});
try{
 const panel=path.join(tmp,'android-hosting-panel');
 fs.cpSync(path.join(root,'vendor/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/panel'),panel,{recursive:true});
 fs.cpSync(path.join(root,'bin/legacy-panel-src'),panel,{recursive:true});
 fs.mkdirSync(path.join(panel,'data'),{recursive:true,mode:0o700});
 const pwd='a-test-only-password-123';
 const salt=crypto.randomBytes(16).toString('hex');
 fs.writeFileSync(path.join(panel,'data/admin.json'),JSON.stringify({salt,hash:crypto.scryptSync(pwd,salt,64).toString('hex')}),{mode:0o600});
 const host='panel.lab.example',team='mhc-lab.cloudflareaccess.com',aud='a'.repeat(64);
 fs.writeFileSync(path.join(panel,'data/remote-access.json'),JSON.stringify({schema:1,hostname:host,teamDomain:team,audience:aud}),{mode:0o600});
 const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...keys.publicKey.export({format:'jwk'}),kid:'mhc-fixture',alg:'RS256'};
 const jwks=path.join(tmp,'jwks.json');fs.writeFileSync(jwks,JSON.stringify({keys:[jwk]}));
 const preload=path.join(tmp,'mock-jwks.mjs');
 fs.writeFileSync(preload,`import fs from 'node:fs';
// Windows cannot express POSIX 0600. Emulate mode bits ONLY for this fake config;
// an explicit unsafe-mode assertion below still exercises the real origin guard.
if(process.platform==='win32'){
 const originalStat=fs.lstatSync;
 fs.lstatSync=function(p,...a){const st=originalStat.call(fs,p,...a);if(String(p)===process.env.MHC_ACCESS_FIXTURE_CONFIG)st.mode=(st.mode&~0o777)|(fs.existsSync(String(p)+'.insecure')?0o644:0o600);return st;};
}
const original=globalThis.fetch;
globalThis.fetch=(u,o)=>String(u)==='https://${team}/cdn-cgi/access/certs'?
 Promise.resolve(new Response(fs.readFileSync(process.env.MHC_JWKS_FIXTURE,'utf8'),{status:200,headers:{'content-type':'application/json'}})):
 original(u,o);
`);
 const sign=(overrides={})=>{
  const now=Math.floor(Date.now()/1000);
  const a=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url'); // typ intentionally omitted
  const b=Buffer.from(JSON.stringify({iss:'https://'+team,aud:[aud],iat:now-1,exp:now+600,...overrides})).toString('base64url');
  const signature=crypto.sign('RSA-SHA256',Buffer.from(a+'.'+b),keys.privateKey).toString('base64url');
  return a+'.'+b+'.'+signature;
 };
 const jwt=sign();
 const p=await port();
 proc=spawn(process.execPath,['--import',pathToFileURL(preload).href,path.join(panel,'src/server.mjs')],{
  env:{...process.env,HOME:tmp,AMH_PORT:String(p),MHC_JWKS_FIXTURE:jwks,MHC_ACCESS_FIXTURE_CONFIG:path.join(panel,'data/remote-access.json')},stdio:['ignore','pipe','pipe']
 });
 let err='';proc.stderr.on('data',b=>{err+=b;});
 let ready=false;
 for(let i=0;i<80;i++){try{const x=await request(p,'127.0.0.1:'+p,'/api/session');if(x.status===200){ready=true;break;}}catch{}await sleep(100);}
 assert(ready,'panel started');
 // Local password still works; no Access identity available on localhost.
 const local=await request(p,'127.0.0.1:'+p,'/api/session');
 assert.equal(local.status,200);assert.equal(local.data.loggedIn,false);
 assert.equal((await request(p,'127.0.0.1:'+p,'/api/mhc/p31-readiness')).status,401,'readiness requires Panel authentication');
 const login=await request(p,'127.0.0.1:'+p,'/api/login',{method:'POST',body:{username:'admin',password:pwd}});
 assert.equal(login.status,200);assert.equal(login.data.authMode,'password');
 const localCookie=login.cookie.split(';')[0];
 assert.equal((await request(p,'127.0.0.1:'+p,'/api/mhc/p31-readiness',{cookie:localCookie})).data.enabled,false);
 assert.equal((await request(p,'127.0.0.1:'+p,'/api/mhc/primary-selection',{cookie:localCookie,method:'POST',body:{action:'p31-prepare'}})).status,403,'candidate activation requires CSRF');
 assert.equal((await request(p,'127.0.0.1:'+p,'/api/sites',{cookie:localCookie})).status,200);
 // Access JWT validated on every remote request. Does NOT require Panel password.
 assert.equal((await request(p,host,'/api/session')).status,403,'remote blocked without JWT');
 assert.equal((await request(p,'unexpected.lab.example','/api/session',{jwt})).status,403,'wrong Host blocked');
 assert.equal((await request(p,host,'/api/session',{jwt:sign({aud:['other']})})).status,403,'wrong Access audience blocked');
 const accessConfig=path.join(panel,'data/remote-access.json');
 if(process.platform==='win32')fs.writeFileSync(accessConfig+'.insecure','fixture');else fs.chmodSync(accessConfig,0o644);
 assert.equal((await request(p,host,'/api/session',{jwt})).status,403,'unsafe private config permissions blocked');
 if(process.platform==='win32')fs.unlinkSync(accessConfig+'.insecure');else fs.chmodSync(accessConfig,0o600);
 const remote=await request(p,host,'/api/session',{jwt});
 assert.equal(remote.status,200);assert.equal(remote.data.loggedIn,true);
 assert.equal(remote.data.authMode,'cloudflare-access');
 assert(remote.cookie.includes('Secure'),'remote cookie bound to HTTPS');
 assert(remote.cookie.includes('SameSite=Strict'));
 const remoteCookie=remote.cookie.split(';')[0];
 assert.equal((await request(p,host,'/api/sites',{jwt,cookie:remoteCookie})).status,200,'Access-only authenticated API');
 assert.equal((await request(p,'127.0.0.1:'+p,'/api/session',{cookie:remoteCookie})).data.loggedIn,false,'remote cookie does not grant localhost admin');
 assert.equal((await request(p,host,'/api/sites',{jwt,cookie:localCookie})).status,401,'localhost password session not valid remotely');
 assert.equal((await request(p,host,'/api/sites',{jwt:sign({iat:Math.floor(Date.now()/1000)-15}),cookie:remoteCookie})).status,401,'remote session is bound to original verified JWT');
 assert.equal((await request(p,host,'/api/logout',{method:'POST',jwt,cookie:remoteCookie,origin:'https://'+host})).status,403,'CSRF still required');
 const logout=await request(p,host,'/api/logout',{method:'POST',jwt,cookie:remoteCookie,csrf:remote.data.csrf,origin:'https://'+host});
 assert.equal(logout.status,200);assert.equal(logout.data.accessLogout,true);
 assert(!err.includes(jwt),'raw JWT must not appear in Panel error output');
 console.log('PASS: Access verified JWT auto-login, remote secure cookie, no second password, local password recovery, cross-origin session isolation, JWT binding, CSRF/logout.');
}finally{
 if(proc){proc.kill();if(proc.exitCode===null)await new Promise(r=>proc.once('exit',r));}
 fs.rmSync(tmp,{force:true,recursive:true});
}
