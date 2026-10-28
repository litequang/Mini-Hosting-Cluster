// Original Panel orchestrates one durable manual transition; node actions never trust UI attestations.
import crypto from 'node:crypto';
import {sharedStatus,sharedManagedRequest} from './cluster-authority.mjs';
import {p31PeerEnvelope} from './p31-control.mjs';
import {P33_SCOPE} from './p33-node.mjs';
const fail=c=>{throw Error(c);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
function view(s){if(s.p33?.enabled!==true||s.p33.scope!==P33_SCOPE)fail('P33_NOT_CONFIGURED');return s.p33;}
const requestBody=s=>({requestId:crypto.randomUUID(),expectedRevision:s.revision,expectedP33Revision:view(s).revision,operationId:s.p33.operationId});
export async function p33Request(nodeId,action,nonce=null){
 const s=await sharedStatus(),r=view(s);nonce ||= r.challenge||crypto.randomBytes(32).toString('hex');
 const request={action,nodeId,nonce,requestId:crypto.randomUUID(),epoch:r.epoch,revision:r.revision,operationId:r.operationId};
 const {envelope,publicKey,clusterId}=await p31PeerEnvelope(nodeId,request);
 const p=envelope?.proof;
 if(!p||p.scope!==P33_SCOPE||p.schema!==3||p.nodeId!==nodeId||p.clusterId!==clusterId||p.nonce!==nonce||p.epoch!==r.epoch||p.revision!==r.revision||p.operationId!==r.operationId||p.expiresAt-p.checkedAt!==15000||Date.now()<p.checkedAt-2000||Date.now()>p.expiresAt||!crypto.verify(null,Buffer.from(JSON.stringify(p)),publicKey,Buffer.from(envelope.signature||'','base64url')))fail('P33_PEER_PROOF_INVALID');
 return envelope;
}
export async function p33Readiness(){
 const s=await sharedStatus(),r=view(s);const nodes=await Promise.all(s.nodes.filter(n=>['4ed4c025-62ae-4c2a-8d68-65dd76ecf550','4a9672d1-bb62-4286-946a-a78b73e57b24'].includes(n.nodeId)).map(async n=>{try{const e=await p33Request(n.nodeId,'p33-ready');return {nodeId:n.nodeId,label:n.label,ready:true,dataset:e.proof.dataset,management:e.proof.management};}catch(e){return {nodeId:n.nodeId,label:n.label,ready:false,problem:/^(P33|P31|AUTHORITY)_[A-Z0-9_]+$/.test(e.message)?e.message:'P33_PEER_UNAVAILABLE'};}}));return {scope:P33_SCOPE,phase:r.phase,nodes};
}
async function publicEnvelope(url,jwt){
 let response,bytes='';try{response=await fetch(url,{headers:{cookie:'CF_Authorization='+jwt,'cache-control':'no-cache'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});for await(const b of response.body||[]){bytes+=Buffer.from(b).toString('utf8');if(bytes.length>32768)fail('P33_PUBLIC_REPLY_TOO_LARGE');}if(!response.ok)fail('P33_PUBLIC_UNREACHABLE');return JSON.parse(bytes);}catch{fail('P33_PUBLIC_UNREACHABLE');}
}
export async function p33Confirm(context){
 if(context.accessVerified!==true||context.host!=='panel-lab.giaouoc.com'||typeof context.jwt!=='string')fail('P33_CONFIRM_FROM_PUBLIC_ACCESS_PANEL_REQUIRED');
 const s=await sharedStatus(),r=view(s),j=r.journal;if(j?.status!=='AWAITING_PUBLIC')return s;
 const panelEnvelope=await publicEnvelope('https://panel-lab.giaouoc.com/api/mhc/p33-origin-proof?nonce='+j.challenge,context.jwt);
 const siteEnvelope=j.kind==='both'?await publicEnvelope('https://preview-lab.giaouoc.com/__mhc_primary?nonce='+j.challenge,context.jwt):undefined;
 return sharedManagedRequest('p33-confirm',{...requestBody(s),panelEnvelope,...(siteEnvelope?{siteEnvelope}:{})});
}
export async function p33Continue(context={}){
 let s=await sharedStatus(),r=view(s);
 if(['ACTIVATING','ACTIVE','DNS_REQUESTED','AWAITING_PUBLIC'].includes(r.phase)&&(!r.lease||r.lease.expiresAt<=Date.now())){s=await sharedManagedRequest('p33-refence',requestBody(s));r=view(s);}
 if(r.phase==='FENCING'){
  const envelopes=await Promise.all((await p33Readiness()).nodes.map(n=>p33Request(n.nodeId,'p33-fence')));
  s=await sharedManagedRequest('p33-fenced',{...requestBody(await sharedStatus()),envelopes});r=view(s);
 }
 if(r.phase==='ACTIVATING'){
  const envelope=await p33Request(r.targetNodeId,'p33-activate');s=await sharedManagedRequest('p33-active',{...requestBody(await sharedStatus()),envelope});r=view(s);
 }
 if(r.phase==='ACTIVE'||r.journal?.status==='DNS_REQUESTED'){
  const envelope=r.phase==='ACTIVE'?await p33Request(r.targetNodeId,'p33-active'):undefined;
  s=await sharedManagedRequest('p33-route',{...requestBody(await sharedStatus()),...(envelope?{envelope}:{})});r=view(s);
 }
 if(r.journal?.status==='AWAITING_PUBLIC'&&context.accessVerified){
  for(let i=0;i<3;i++)try{return await p33Confirm(context);}catch{if(i<2)await sleep(2000);}
  return {...s,manualNotice:'Tuyến đã đổi, còn chờ kiểm Internet. Tải lại Panel LAB và bấm Hoàn tất kiểm tra.'};
 }
 return s;
}
export async function p33Action(body,context={}){
 const s=await sharedStatus(),r=view(s);
 if(!['switch','resume','control','confirm','cancel'].includes(body?.action))fail('P33_ACTION_INVALID');
 if(body.expectedRevision!==s.revision||body.expectedP33Revision!==r.revision)fail('P33_REVISION_CONFLICT');
 if(body.action==='confirm')return p33Confirm(context);
 if(body.action==='switch'){
  if(body.acceptTargetData!==true)fail('P33_TARGET_DATA_ACCEPTANCE_REQUIRED');
  const readiness=await p33Readiness();if(readiness.nodes.length!==2||readiness.nodes.some(n=>!n.ready)||!readiness.nodes.some(n=>n.nodeId===body.id))fail('P33_ALL_LAB_NODES_MUST_BE_REACHABLE');
  await sharedManagedRequest('p33-begin',{...requestBody(s),requestId:body.requestId,targetNodeId:body.id,acceptTargetData:true});
 }else if(body.action==='control'){
  const nonce=crypto.randomBytes(32).toString('hex'),envelope=await p33Request(body.id,'p33-ready',nonce);
  await sharedManagedRequest('p33-control',{...requestBody(s),requestId:body.requestId,targetNodeId:body.id,nonce,envelope});
 }else if(body.action==='cancel'){
  const envelopes=await Promise.all((await p33Readiness()).nodes.map(n=>p33Request(n.nodeId,'p33-fence')));
  return sharedManagedRequest('p33-cancel',{...requestBody(await sharedStatus()),envelopes});
 }
 return p33Continue(context);
}
