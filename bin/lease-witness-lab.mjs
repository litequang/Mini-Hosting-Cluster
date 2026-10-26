// MHC TEST 0.5.0B2 — LAB client for *independent* Cloudflare Durable Object witness.
// Never attached to Nginx/PHP/MariaDB/live write paths. Results are diagnostic only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const HOME=process.env.HOME||os.homedir();
const DIR=path.join(HOME,'.config/mhc-witness-lab');
const CONFIG=path.join(DIR,'client.json');
const NODE_SECRET=path.join(DIR,'node-token');
const ADMIN_SECRET=path.join(DIR,'admin-token');
const CID=/^[a-z][a-z0-9-]{2,39}$/;const NID=/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const SCOPE='MHC_LAB_WITNESS_ONLY_NO_HA';
const fail=m=>{throw new Error(m)};
function privateContent(p,maxBytes=2048){
 const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>maxBytes||st.size<1)fail('UNSAFE_LAB_FILE_PERMISSIONS');
 return fs.readFileSync(p,'utf8').trim();
}
export function loadConfiguration(){
 const dir=fs.lstatSync(DIR);if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077))fail('UNSAFE_LAB_DIRECTORY');
 const cfg=JSON.parse(privateContent(CONFIG));
 if(Object.keys(cfg).sort().join(',')!=='clusterId,nodeId,url')fail('INVALID_LAB_CONFIG_FIELDS');
 if(!CID.test(cfg.clusterId)||!NID.test(cfg.nodeId))fail('INVALID_LAB_IDENTITY');
 const u=new URL(cfg.url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||u.pathname!=='/'||!u.hostname||u.hostname==='localhost'||u.hostname==='127.0.0.1')fail('HTTPS_PUBLIC_WITNESS_ENDPOINT_REQUIRED');
 if(!/^[a-z0-9.-]+$/i.test(u.hostname))fail('INVALID_WITNESS_HOST');
 return cfg;
}
function secret(admin=false){const tok=privateContent(admin?ADMIN_SECRET:NODE_SECRET,512);if(tok.length<32||/\s/.test(tok))fail('INVALID_WITNESS_TOKEN');return tok;}
function urlOf(cfg,action,nonce){return cfg.url+'v1/lab/'+cfg.clusterId+'/'+action+(nonce?'?nonce='+nonce:'');}
const ALLOWED_ACTIONS=new Set(['status','verify','renew','grant-initial','freeze']);
export async function witnessRequest(cfg,action,token,body=undefined,admin=false,fetcher=fetch){
 if(!ALLOWED_ACTIONS.has(action))fail('UNKNOWN_WITNESS_ACTION');
 const nonce=['status','verify'].includes(action)?crypto.randomBytes(16).toString('hex'):null;
 const c=new AbortController();const timeout=setTimeout(()=>c.abort(),2200);
 try{
  const h={'authorization':'Bearer '+token,'x-mhc-lab-node':admin?'':cfg.nodeId,'cache-control':'no-store'};
  if(body!==undefined)h['content-type']='application/json';
  const res=await fetcher(urlOf(cfg,action,nonce),{method:body===undefined?'GET':'POST',headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:c.signal,redirect:'error',cache:'no-store'});
  if(!res||!Number.isInteger(res.status))fail('WITNESS_NO_RESPONSE');
  const raw=await res.text();if(raw.length>4096)fail('WITNESS_RESPONSE_TOO_LARGE');
  let data;try{data=JSON.parse(raw)}catch{fail('WITNESS_INVALID_JSON')}
  if(data?.scope!==SCOPE||data.productionReady!==false||data.haEligible!==false||data.action!==action)fail('WITNESS_INVALID_PROTOCOL');
  if(nonce&&data.nonce!==nonce)fail('WITNESS_NONCE_MISMATCH');
  if(!['EMPTY','LEASED','FROZEN'].includes(data.phase)||!Number.isSafeInteger(data.epoch)||data.epoch<0||!Number.isSafeInteger(data.serverNowMs)||!Number.isSafeInteger(data.expiresAtMs))fail('WITNESS_INVALID_STATE');
  if(!res.ok)return {status:'DENIED',reason:'WITNESS_'+String(data.error||res.status).replace(/[^A-Z0-9_]/g,'').slice(0,50),epoch:data.epoch,phase:data.phase,labGatePass:false,haEligible:false};
  const ttl=data.expiresAtMs-data.serverNowMs;
  if(action==='verify'&&(!data.callerOwnsLease||!data.allowedForLabGate||ttl<3000||ttl>12000))fail('WITNESS_WRITE_GATE_FAIL_CLOSED');
  return {status:'OBSERVED',phase:data.phase,epoch:data.epoch,labGatePass:action==='verify'&&ttl>=3000&&ttl<=12000,validForMs:Math.max(0,ttl),haEligible:false,realWriteGateInstalled:false};
 }catch(e){return {status:'UNAVAILABLE',reason:e.message==='WITNESS_NONCE_MISMATCH'?'NONCE_MISMATCH':'WITNESS_REQUEST_FAILED_CLOSED',labGatePass:false,haEligible:false};}
 finally{clearTimeout(timeout)}
}
function guardMachine(){
 const forbidden=[path.join(HOME,'apps/thophuongpro/.env'),path.join(HOME,'.config/mini-hosting-cluster/ha.json'),path.join(HOME,'.config/mini-hosting-cluster/node.json')];
 if(forbidden.some(p=>fs.existsSync(p)))fail('PRODUCTION_OR_HA_NODE_BLOCKED');
 if(fs.existsSync(path.join(HOME,'.config/mhc-full-installer/sites'))||fs.existsSync(path.join(HOME,'.config/mhc-full-installer/static')))fail('REGISTERED_WEBSITE_BLOCKED');
}
export async function main(args=process.argv.slice(2)){
 const cmd=args[0];
 if(cmd==='plan'&&args.length===1){return {scope:SCOPE,change:'None',commands:['plan','status','gate-check','bootstrap','renew','freeze'],realWriteGateInstalled:false,haEligible:false,requiresCloudflareLabWitness:true,notice:'No write path in Hosting Panel, Nginx, PHP or MariaDB is protected by this client.'};}
 if(!['status','gate-check','bootstrap','renew','freeze'].includes(cmd))fail('Usage: mhc-full witness plan|status|gate-check|bootstrap|renew|freeze');
 const c=loadConfiguration();
 if(['bootstrap','renew','freeze'].includes(cmd)){
  guardMachine();
  if(args[1]!=='--confirm=ISOLATED_WITNESS_LAB_ONLY'||args.length!==2)fail('EXPLICIT_LAB_CONFIRMATION_REQUIRED');
 }else if(args.length!==1)fail('INVALID_ARGUMENTS');
 const admin=['bootstrap','freeze'].includes(cmd);
 const tok=secret(admin);
 const action={status:'status','gate-check':'verify',bootstrap:'grant-initial',renew:'renew',freeze:'freeze'}[cmd];
 // Renewal obtains the current witness epoch first; never guess from a stored local value.
 let body;
 if(cmd==='bootstrap')body={nodeId:c.nodeId};
 if(cmd==='freeze')body={};
 if(cmd==='renew'){
  const state=await witnessRequest(c,'verify',tok);
  if(!state.labGatePass)return {...state,action:'renew',reason:'CURRENT_LEASE_NOT_VERIFIED'};
  body={epoch:state.epoch};
 }
 const result=await witnessRequest(c,action,tok,body,admin);
 return {...result,action:cmd,scope:SCOPE,notice:'LAB witness only. This command does NOT protect any real database, web ingress, file writer, or Cloudflare route.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().then(x=>{console.log(JSON.stringify(x,null,2));if(x.status==='UNAVAILABLE'||x.status==='DENIED')process.exitCode=1;}).catch(e=>{console.error('WITNESS_LAB_BLOCKED:',e.message);process.exitCode=1});
