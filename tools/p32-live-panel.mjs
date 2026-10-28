// Run only on an approved Android LAB node. Credentials stay local/in memory.
// Public Internet confirmation must come from the real Access Panel session.
import fs from 'node:fs';import os from 'node:os';import crypto from 'node:crypto';import assert from 'node:assert/strict';import http from 'node:http';
const [action,id,kind='both']=process.argv.slice(2),home=os.homedir(),origin='http://127.0.0.1:9090';let cookie='',csrf='';
async function call(route,body,auth=true){const r=await fetch(origin+route,{method:body?'POST':'GET',headers:{...(auth&&cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin,...(auth?{'x-csrf-token':csrf}:{})}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(60000)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
const safe=s=>({revision:s.revision,epoch:s.epoch,primary:s.declaredPrimary,pending:s.pending?{operationId:s.pending.operationId,targetNodeId:s.pending.targetNodeId,status:s.pending.status}:null,writer:s.writeLeaseGranted,p32:s.p32?{enabled:s.p32.enabled,routeRevision:s.p32.routeRevision,siteNodeId:s.p32.siteNodeId,panelNodeId:s.p32.panelNodeId,recoveryEnabled:s.p32.recoveryEnabled,journal:s.p32.journal?{operationId:s.p32.journal.operationId,status:s.p32.journal.status,kind:s.p32.journal.kind,targetNodeId:s.p32.journal.targetNodeId,httpVerified:s.p32.journal.httpVerified}:null}:null});
async function originCheck(){
 // Raw HTTP preserves the Host header on Android Node26; fetch may normalize it.
 const request=(route,headers={})=>new Promise((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port:9090,path:route,headers,timeout:5000},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));r.on('error',reject);});q.on('error',reject);q.on('timeout',()=>q.destroy(Error('P32_ORIGIN_CHECK_TIMEOUT')));q.end();});
 const host='panel-lab.giaouoc.com';
 assert.equal(await request('/api/session',{host}),403);
 assert.equal(await request('/api/session',{host,'cf-access-jwt-assertion':'invalid.invalid.invalid'}),403);
 assert.equal(await request('/api/session',{host:'unconfigured.giaouoc.com','cf-access-jwt-assertion':'invalid.invalid.invalid'}),403);
 assert.equal((await call('/api/mhc/p32-origin-proof?nonce='+crypto.randomBytes(32).toString('hex'),null,false)).status,401);
 assert.equal((await call('/api/mhc/p32-route',{action:'p32-confirm'},false)).status,401);
 return {action:'origin-check',nodeId:JSON.parse(fs.readFileSync(home+'/.config/mhc-full-installer/node-identity.json')).nodeId,result:'PASS',checks:5,publicAccessLoginVerified:false,credentialsRead:false};
}
try{
 if(process.env.PREFIX!=='/data/data/com.termux/files/usr'||!['status','origin-check','p32-route','p32-resume','p32-rollback','confirm-denied-local'].includes(action)||!['both','panel'].includes(kind))throw Error('P32_APPROVED_ANDROID_LAB_REQUIRED');
 for(const f of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'])if(fs.existsSync(home+'/'+f))throw Error('P32_PRODUCTION_FOOTPRINT_DENIED');
 const nodeId=JSON.parse(fs.readFileSync(home+'/.config/mhc-full-installer/node-identity.json')).nodeId;
 if(!['4ed4c025-62ae-4c2a-8d68-65dd76ecf550','4a9672d1-bb62-4286-946a-a78b73e57b24'].includes(nodeId))throw Error('P32_UNAPPROVED_NODE');
 if(id&&!['4ed4c025-62ae-4c2a-8d68-65dd76ecf550','4a9672d1-bb62-4286-946a-a78b73e57b24'].includes(id))throw Error('P32_UNAPPROVED_TARGET');
 if(action==='origin-check'){console.log(JSON.stringify(await originCheck()));process.exit(0);}
 const p=[home+'/.config/mhc-full-installer/panel-login-once',home+'/.local/state/mhc-p31-lab/panel-test-password'].find(p=>fs.existsSync(p));if(!p)throw Error('P32_PANEL_PASSWORD_FILE_UNAVAILABLE');const st=fs.lstatSync(p);if(st.isSymbolicLink()||(st.mode&0o077)||st.size>1000)throw Error('P32_PANEL_PASSWORD_FILE_UNSAFE');
 assert.equal((await call('/api/mhc/p32-origin-proof?nonce='+crypto.randomBytes(32).toString('hex'),null,false)).status,401);
 const login=await call('/api/login',{username:'admin',password:fs.readFileSync(p,'utf8').trim()},false);if(login.status!==200)throw Error('P32_PANEL_LOGIN_FAILED');cookie=login.cookie.split(';')[0];csrf=login.data.csrf;
 const s=(await call('/api/mhc/primary-selection')).data;if(action==='status'){console.log(JSON.stringify(safe(s)));process.exit(0);}
 if(!['p32-route','p32-resume','p32-rollback','confirm-denied-local'].includes(action)||!['both','panel'].includes(kind)||!s.p32?.enabled)throw Error('P32_TEST_INVALID');
 const body={action:action==='confirm-denied-local'?'p32-confirm':action,id,kind,requestId:crypto.randomUUID(),expectedRevision:s.revision,expectedRouteRevision:s.p32.routeRevision};
 const r=await call('/api/mhc/p32-route',body);
 if(action==='confirm-denied-local'){assert.notEqual(r.status,200);assert.match(r.data.error||'',/P32_CONFIRM_FROM_PUBLIC_LAB_PANEL_REQUIRED/);console.log(JSON.stringify({localConfirmationRefused:true,status:r.status,error:r.data.error}));}
 else{if(r.status!==200){console.log(JSON.stringify({action,status:r.status,error:r.data.error}));throw Error('P32_LIVE_ACTION_REJECTED');}console.log(JSON.stringify({action,status:r.status,state:safe(r.data)}));}
}catch(e){console.error(/^P32_[A-Z0-9_]+$/.test(e.message)?e.message:'P32_LIVE_ACCEPTANCE_FAILED');process.exitCode=1;}
