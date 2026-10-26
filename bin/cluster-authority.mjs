#!/usr/bin/env node
// Shared M2 client. All transport/config failures are terminal; no local role fallback.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MODE='SHARED_AUTHORITY_PREPARE_ONLY';
const home=()=>process.env.HOME||os.homedir();
const configPath=()=>path.join(home(),'.config/mhc-full-installer/authority.json');
export function authorityConfigured(){try{fs.lstatSync(configPath());return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function privateRead(file){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>8192)throw Error('AUTHORITY_PRIVATE_FILE_UNSAFE');return fs.readFileSync(file,'utf8');}
function labDirectory(){
 const dir=path.dirname(configPath()),st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('AUTHORITY_CONFIG_DIRECTORY_UNSAFE');
 if(['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'].some(p=>fs.existsSync(path.join(home(),p))))throw Error('PRODUCTION_FOOTPRINT_BLOCKS_AUTHORITY_LAB');
 if(fs.readFileSync(path.join(dir,'installed'),'utf8').trim()!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux'||fs.existsSync(path.join(dir,'install-incomplete')))throw Error('UPGRADE_TEST_SOURCE_FIRST');
 return dir;
}
function writeExclusive(file,value){
 // Android may prohibit hardlinks. Serialize cooperating writers with a private
 // lock directory, then atomically rename only after an absent-target check.
 // Crash leaves a lock for inspection; never remove another writer's lock.
 const lock=file+'.lock',tmp=file+'.'+crypto.randomUUID()+'.tmp';
 fs.mkdirSync(lock,{mode:0o700});
 try{
  if(fs.lstatSync(file,{throwIfNoEntry:false}))throw Object.assign(Error('EXISTING_PRIVATE_FILE'),{code:'EEXIST'});
  const fd=fs.openSync(tmp,'wx',0o600);
  try{fs.writeFileSync(fd,value);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,file);
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);fs.rmdirSync(lock);}
}
function enrollment(){
 const dir=labDirectory(),self=JSON.parse(privateRead(path.join(dir,'node-identity.json')));
 if(!UUID.test(self.nodeId)||typeof self.label!=='string'||!self.label.length||self.label.length>80)throw Error('RUN_NODE_INIT_FIRST');
 const file=path.join(dir,'authority-enrollment.json');
 let value;
 try{value=JSON.parse(privateRead(file));}catch(e){
  if(e.code!=='ENOENT')throw e;
  value={schema:1,nodeId:self.nodeId,label:self.label,agentKey:crypto.randomBytes(32).toString('base64url'),panelKey:crypto.randomBytes(32).toString('base64url')};
  try{writeExclusive(file,JSON.stringify(value)+'\n');}catch(err){if(err.code!=='EEXIST')throw err;value=JSON.parse(privateRead(file));}
 }
 if(value.schema!==1||value.nodeId!==self.nodeId||value.label!==self.label||![value.agentKey,value.panelKey].every(k=>/^[A-Za-z0-9_-]{43,128}$/.test(k))||value.agentKey===value.panelKey)throw Error('AUTHORITY_ENROLLMENT_INVALID');
 return {dir,file,value};
}
export function prepareEnrollment(){const {file,value}=enrollment();return {nodeId:value.nodeId,label:value.label,privateEnrollmentFile:file,configured:authorityConfigured(),writeLeaseGranted:false};}
export async function configureAuthority(origin,clusterId){
 const {dir,value}=enrollment();
 const base={schema:1,url:origin,clusterId,nodeId:value.nodeId};
 // Both role credentials must work against the live endpoint before installing anything.
 const agent=await authorityRequest({...base,token:value.agentKey},'status');
 const panel=await authorityRequest({...base,token:value.panelKey},'status');
 if(![agent,panel].every(s=>s.nodes.some(n=>n.nodeId===value.nodeId)))throw Error('AUTHORITY_MEMBERSHIP_MISSING');
 const credentialDir=path.join(dir,'authority-credentials');
 try{fs.mkdirSync(credentialDir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 const st=fs.lstatSync(credentialDir);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('AUTHORITY_CREDENTIAL_DIRECTORY_UNSAFE');
 for(const [role,key] of [['agent',value.agentKey],['panel',value.panelKey]]){
  const file=path.join(credentialDir,role+'-token');
  try{writeExclusive(file,key+'\n');}catch(e){if(e.code!=='EEXIST')throw e;if(privateRead(file).trim()!==key)throw Error('EXISTING_AUTHORITY_TOKEN_DIFFERS');}
  base[role+'TokenFile']=file;
 }
 if(authorityConfigured()){
  const old=JSON.parse(privateRead(configPath()));
  if(Object.keys(base).some(k=>old[k]!==base[k]))throw Error('EXISTING_AUTHORITY_CONFIG_DIFFERS');
 }else writeExclusive(configPath(),JSON.stringify(base,null,2)+'\n');
 return {configured:true,nodeId:value.nodeId,clusterId,mode:panel.mode,revision:panel.revision,writeLeaseGranted:false,serviceInstalled:false};
}
function config(role){
 const p=configPath(),dir=fs.lstatSync(path.dirname(p));if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077))throw Error('AUTHORITY_CONFIG_DIRECTORY_UNSAFE');
 const c=JSON.parse(privateRead(p));
 const self=JSON.parse(privateRead(path.join(path.dirname(p),'node-identity.json')));
 if(c.schema!==1||!UUID.test(c.clusterId)||!UUID.test(c.nodeId)||c.nodeId!==self.nodeId)throw Error('AUTHORITY_IDENTITY_INVALID');
 const file=c[role==='agent'?'agentTokenFile':'panelTokenFile'];
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('AUTHORITY_TOKEN_PATH_INVALID');
 const token=privateRead(file).trim();if(!/^[A-Za-z0-9_-]{43,128}$/.test(token))throw Error('AUTHORITY_TOKEN_INVALID');
 return {...c,token};
}
export async function authorityRequest(c,action,body={},fetcher=fetch){
 const url=new URL(c.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('AUTHORITY_HTTPS_ORIGIN_REQUIRED');
 if(!UUID.test(c.clusterId)||!UUID.test(c.nodeId)||!['status','heartbeat','begin','abort','history'].includes(action))throw Error('AUTHORITY_REQUEST_INVALID');
 const nonce=crypto.randomUUID();url.pathname='/v1/clusters/'+c.clusterId+'/'+action;
 let response;
 try{response=await fetcher(url,{method:['status','history'].includes(action)?'GET':'POST',headers:{authorization:'Bearer '+c.token,'x-mhc-node':c.nodeId,'x-mhc-nonce':nonce,'content-type':'application/json',...(action==='history'?{'x-mhc-target':body.targetNodeId}:{})},
  body:['status','history'].includes(action)?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'});}catch{throw Error('AUTHORITY_UNREACHABLE');}
 const reader=response.body?.getReader();let raw='';const decoder=new TextDecoder();let size=0;
 if(!reader)throw Error('AUTHORITY_REPLY_INVALID');
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072){await reader.cancel();throw Error('AUTHORITY_REPLY_TOO_LARGE');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();
 let v;try{v=JSON.parse(raw);}catch{throw Error('AUTHORITY_REPLY_INVALID');}
 if(!response.ok){const code=typeof v.error==='string'&&/^[A-Z_]{1,60}$/.test(v.error)?v.error:'REQUEST_REJECTED';throw Error('AUTHORITY_'+code);}
 if(v.mode!==MODE||v.clusterId!==c.clusterId||v.nonce!==nonce||!Number.isSafeInteger(v.revision)||v.revision<0||!Number.isSafeInteger(v.epoch)||v.epoch<0||!Array.isArray(v.nodes)||v.nodes.length>200||v.writeLeaseGranted!==false||v.canComplete!==false)throw Error('AUTHORITY_REPLY_MISMATCH');
 return v;
}
export async function sharedStatus(role='panel'){return authorityRequest(config(role),'status');}
export async function sharedHistory(targetNodeId){
 if(!UUID.test(targetNodeId||''))throw Error('MONITOR_NODE_ID_INVALID');
 return authorityRequest(config('panel'),'history',{targetNodeId});
}
export async function sharedAction(body){
 if(['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'].some(p=>fs.existsSync(path.join(home(),p))))throw Error('PRODUCTION_FOOTPRINT_BLOCKS_AUTHORITY_LAB');
 if(!['begin','abort'].includes(body?.action)||!UUID.test(body.requestId||'')||!UUID.test(body.id||'')||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw Error('AUTHORITY_ACTION_INVALID');
 return authorityRequest(config('panel'),body.action,{requestId:body.requestId,expectedRevision:body.expectedRevision,
  ...(body.action==='begin'?{targetNodeId:body.id}:{operationId:body.id})});
}
async function heartbeat(){
 const c=config('agent'),s=await authorityRequest(c,'status');
 let telemetry=null;
 try{
  // This module is deployed to Termux with the agent; no raw files or PII sent.
  const module=await import('./node-monitor.mjs');
  telemetry=module.compactTelemetry(await module.collectNodeMetrics());
 }catch{/* monitoring failure must never block membership heartbeat */}
 return authorityRequest(c,'heartbeat',{sequence:s.callerSequence+1,sentAt:Date.now(),...(telemetry?{telemetry}:{})});
}
async function main(args){
 if(args.length===1&&args[0]==='prepare')return prepareEnrollment();
 if(args.length===4&&args[0]==='configure'&&args[3]==='--confirm=CONFIGURE_LAB_PREPARE_ONLY')return configureAuthority(args[1],args[2]);
 if(args[0]==='service-install'){
  if(args.length!==2||args[1]!=='--confirm=INSTALL_LAB_AUTHORITY_AGENT'||process.env.PREFIX!=='/data/data/com.termux/files/usr')throw Error('LAB_TERMUX_SERVICE_CONFIRMATION_REQUIRED');
  config('agent');
  if(['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'].some(p=>fs.existsSync(path.join(home(),p))))throw Error('PRODUCTION_FOOTPRINT_BLOCKS_AUTHORITY_LAB');
  const marker=fs.readFileSync(path.join(home(),'.config/mhc-full-installer/installed'),'utf8').trim();
  if(marker!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux')throw Error('UPGRADE_TEST_SOURCE_FIRST');
  const service=path.join(process.env.PREFIX,'var/service/mhc-authority-agent');
  const run='#!/data/data/com.termux/files/usr/bin/sh\nexec /data/data/com.termux/files/usr/bin/node "$HOME/.local/share/mhc-full-installer/bin/cluster-authority.mjs" watch\n';
  if(fs.existsSync(service)){
   if(fs.lstatSync(service).isSymbolicLink()||fs.readFileSync(path.join(service,'run'),'utf8')!==run)throw Error('EXISTING_SERVICE_REQUIRES_REVIEW');
   return {installed:true,alreadyPresent:true};
  }
  fs.mkdirSync(service,{mode:0o700});fs.writeFileSync(path.join(service,'run'),run,{mode:0o700,flag:'wx'});
  return {installed:true,scope:'HEARTBEAT_ONLY_NO_WRITER_GRANT'};
 }
 if(args.length!==1||!['status','heartbeat','watch'].includes(args[0]))throw Error('Usage: cluster-authority status|heartbeat|watch');
 if(args[0]==='status')return sharedStatus();
 if(args[0]==='heartbeat')return heartbeat();
 while(true){try{const s=await heartbeat();console.log(JSON.stringify({at:new Date().toISOString(),mode:s.mode,revision:s.revision,epoch:s.epoch,writeLeaseGranted:false}));}catch(e){console.error(e.message);}await new Promise(r=>setTimeout(r,30000));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(v=>{if(v)console.log(JSON.stringify(v,null,2));}).catch(e=>{console.error(e.message);process.exitCode=1;});
