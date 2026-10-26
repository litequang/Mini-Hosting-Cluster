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
 if(!UUID.test(c.clusterId)||!UUID.test(c.nodeId)||!['status','heartbeat','begin','abort'].includes(action))throw Error('AUTHORITY_REQUEST_INVALID');
 const nonce=crypto.randomUUID();url.pathname='/v1/clusters/'+c.clusterId+'/'+action;
 let response;
 try{response=await fetcher(url,{method:action==='status'?'GET':'POST',headers:{authorization:'Bearer '+c.token,'x-mhc-node':c.nodeId,'x-mhc-nonce':nonce,'content-type':'application/json'},
  body:action==='status'?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'});}catch{throw Error('AUTHORITY_UNREACHABLE');}
 const raw=await response.text();if(raw.length>131072)throw Error('AUTHORITY_REPLY_TOO_LARGE');
 let v;try{v=JSON.parse(raw);}catch{throw Error('AUTHORITY_REPLY_INVALID');}
 if(!response.ok){const code=typeof v.error==='string'&&/^[A-Z_]{1,60}$/.test(v.error)?v.error:'REQUEST_REJECTED';throw Error('AUTHORITY_'+code);}
 if(v.mode!==MODE||v.clusterId!==c.clusterId||v.nonce!==nonce||!Number.isSafeInteger(v.revision)||v.revision<0||!Number.isSafeInteger(v.epoch)||v.epoch<0||!Array.isArray(v.nodes)||v.nodes.length>200||v.writeLeaseGranted!==false||v.canComplete!==false)throw Error('AUTHORITY_REPLY_MISMATCH');
 return v;
}
export async function sharedStatus(role='panel'){return authorityRequest(config(role),'status');}
export async function sharedAction(body){
 if(['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'].some(p=>fs.existsSync(path.join(home(),p))))throw Error('PRODUCTION_FOOTPRINT_BLOCKS_AUTHORITY_LAB');
 if(!['begin','abort'].includes(body?.action)||!UUID.test(body.requestId||'')||!UUID.test(body.id||'')||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)throw Error('AUTHORITY_ACTION_INVALID');
 return authorityRequest(config('panel'),body.action,{requestId:body.requestId,expectedRevision:body.expectedRevision,
  ...(body.action==='begin'?{targetNodeId:body.id}:{operationId:body.id})});
}
async function heartbeat(){const c=config('agent'),s=await authorityRequest(c,'status');return authorityRequest(c,'heartbeat',{sequence:s.callerSequence+1,sentAt:Date.now()});}
async function main(args){
 if(args.length!==1||!['status','heartbeat','watch'].includes(args[0]))throw Error('Usage: cluster-authority status|heartbeat|watch');
 if(args[0]==='status')return sharedStatus();
 if(args[0]==='heartbeat')return heartbeat();
 while(true){try{const s=await heartbeat();console.log(JSON.stringify({at:new Date().toISOString(),mode:s.mode,revision:s.revision,epoch:s.epoch,writeLeaseGranted:false}));}catch(e){console.error(e.message);}await new Promise(r=>setTimeout(r,30000));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(v=>{if(v)console.log(JSON.stringify(v,null,2));}).catch(e=>{console.error(e.message);process.exitCode=1;});
