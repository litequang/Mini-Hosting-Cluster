import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-write-path-b3-'));
const originalHome=process.env.HOME;process.env.HOME=tmp;
let n=0;function check(v,msg){assert.ok(v,msg);n++}
function eq(a,b,msg){assert.deepEqual(a,b,msg);n++}
const mod=await import(pathToFileURL(path.join(process.argv[2],'bin/write-path-gate-lab.mjs')).href);
const {main,coverage,writeCanary}=mod;
const dir=path.join(tmp,'.config/mhc-witness-lab');fs.mkdirSync(dir,{recursive:true,mode:0o700});
fs.writeFileSync(path.join(dir,'client.json'),JSON.stringify({clusterId:'lab-cluster',nodeId:'lab-node-1',url:'https://lab.example.com/'}),{mode:0o600});
fs.writeFileSync(path.join(dir,'node-token'),'n'.repeat(48)+'\n',{mode:0o600});
// Server stub enforces nonce and provides deterministic lease. All responses are fake, no network.
let epoch=8,up=true,approved=true,calls=0,lag=6500;
const fetcher=async (url,opts)=>{calls++;
 if(!up)throw Error('network is down');
 const nonce=new URL(url).searchParams.get('nonce');
 return {ok:approved,status:approved?200:403,text:async()=>JSON.stringify({scope:'MHC_LAB_WITNESS_ONLY_NO_HA',productionReady:false,haEligible:false,action:'verify',nonce,phase:approved?'LEASED':'FROZEN',epoch,serverNowMs:10000,expiresAtMs:10000+lag,callerOwnsLease:approved,allowedForLabGate:approved})};
};
const files=path.join(tmp,'mhc-writegate-lab','canaries');
const payload=Buffer.from('LAB_CANARY_SECRET_PAYLOAD');
try{
 const plan=await main(['plan']);check(plan.writePaths.length>=9,'inventory breadth');check(plan.writePaths.filter(x=>x.gate==='ENFORCED_LAB_ONLY').length===5,'four isolated adapters plus LAB HTTP gateway have gate');
 check(plan.writePaths.some(x=>x.path==='mariadb_sql_sessions'&&x.gate==='NOT_ENFORCED'),'MariaDB explicitly NOT enforced');
 check(plan.writePaths.some(x=>x.path==='wordpress_php_application'&&x.gate==='NOT_ENFORCED'),'PHP NOT enforced');
 eq((await main(['status'])).initialized,false,'initially absent');
 await assert.rejects(main(['init']),/Usage/);n++;
 await assert.rejects(main(['canary-write','--confirm=ISOLATED_CANARY_WRITE_ONLY'],{input:payload,check:fetcher}),/ENOENT|UNSAFE_CANARY_DIRECTORY/);n++;
 eq((await main(['init','--confirm=ISOLATED_CANARY_WRITE_ONLY'])).status,'CANARY_LAB_INITIALIZED','initialized');
 await assert.rejects(main(['init','--confirm=ISOLATED_CANARY_WRITE_ONLY']),/ALREADY_EXISTS/);n++;

 function count(){return fs.readdirSync(files).length;}
 function filesEqual(k){eq(count(),k,'expected published count');}
 const first=await main(['canary-write','--confirm=ISOLATED_CANARY_WRITE_ONLY'],{input:payload,check:fetcher});
 eq(first.status,'LAB_CANARY_WRITTEN','canary commit');eq(first.epoch,8,'epoch');eq(fs.readFileSync(path.join(files,first.id)),payload,'data correct');
 check(!first.haEligible&&!first.productionProtected,'never HA');eq(calls,2,'two witness checks per write');filesEqual(1);
 const before= count();up=false;
 await assert.rejects(writeCanary(payload,{check:fetcher}),/FAIL_CLOSED/);n++;filesEqual(before);up=true;
 approved=false;await assert.rejects(writeCanary(payload,{check:fetcher}),/FAIL_CLOSED/);n++;filesEqual(before);approved=true;
 lag=1200;await assert.rejects(writeCanary(payload,{check:fetcher}),/FAIL_CLOSED/);n++;filesEqual(before);lag=6500;
 await assert.rejects(writeCanary(Buffer.alloc(0),{check:fetcher}),/SIZE_INVALID/);n++;
 await assert.rejects(writeCanary(Buffer.alloc(65537),{check:fetcher}),/SIZE_INVALID/);n++;
 // Epoch changes between staging and publish; staged file must be removed.
 let flips=0;const epochFlip=async(...p)=>{const a=await fetcher(...p);if(++flips===2)epoch++;return a;};
 await assert.rejects(writeCanary(payload,{check:epochFlip}),/EPOCH_CHANGED/);n++;filesEqual(before);epoch=8;
 // Bad nonce and mismatched protocol must be rejected, no published file.
 const badNonce=async(url,opts)=>({ok:true,status:200,text:async()=>JSON.stringify({scope:'MHC_LAB_WITNESS_ONLY_NO_HA',productionReady:false,haEligible:false,action:'verify',nonce:'BAD_NONCE',phase:'LEASED',epoch:8,serverNowMs:10000,expiresAtMs:16500,callerOwnsLease:true,allowedForLabGate:true})});
 await assert.rejects(writeCanary(payload,{check:badNonce}),/FAIL_CLOSED/);n++;filesEqual(before);
 const ph=path.join(tmp,'.config/mhc-full-installer/sites');fs.mkdirSync(ph,{recursive:true});
 await assert.rejects(writeCanary(payload,{check:fetcher}),/HOSTED_SITE_BLOCKED/);n++;filesEqual(before);
 fs.rmSync(ph,{recursive:true});
 fs.chmodSync(files,0o755);await assert.rejects(writeCanary(payload,{check:fetcher}),/UNSAFE_CANARY_DIRECTORY/);n++;fs.chmodSync(files,0o700);
 fs.chmodSync(path.join(dir,'node-token'),0o644);await assert.rejects(writeCanary(payload,{check:fetcher}),/UNSAFE_NODE_SECRET/);n++;fs.chmodSync(path.join(dir,'node-token'),0o600);
}catch(e){throw e;}
try{
 const p=path.join(tmp,'apps/thophuongpro');fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'.env'),'PRODUCTION_SECRET');
 await assert.rejects(writeCanary(payload,{check:fetcher}),/PRODUCTION_OR_HA_BLOCKED/);n++;
 fs.unlinkSync(path.join(p,'.env'));
 // Symlink points outside LAB: reject before opening or verifying witness.
 fs.rmSync(files,{recursive:true});fs.symlinkSync(tmp,files,'dir');
 await assert.rejects(writeCanary(payload,{check:fetcher}),/UNSAFE_CANARY_DIRECTORY/);n++;
 fs.rmSync(files);fs.mkdirSync(files,{mode:0o700});
 const s=await main(['status']);eq(s.initialized,true,'status');check(s.successfulCanaryWrites>=1,'journal count');
 // There must be no arbitrary execution, route, SQL or site write action in this CLI.
 await assert.rejects(main(['sql-write','--confirm=ISOLATED_CANARY_WRITE_ONLY']),/Usage/);n++;
 console.log(`PASS: B3 isolated per-write witness gate, failures, integrity and NO production claims — ${n} assertions`);
}finally{process.env.HOME=originalHome;fs.rmSync(tmp,{recursive:true,force:true});}
