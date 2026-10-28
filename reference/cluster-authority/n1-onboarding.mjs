// Same cluster DO: one approved node, one resumable management Tunnel. No DNS/site/lease mutation.
import {controlNodes,verifyControlProof} from './control-nodes.mjs';
export const N1_ACTIONS=['n1-provision','n1-publish','n1-control-proof'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail=(code,status=409)=>{throw Object.assign(Error(code),{status});};
export async function verifyN1Enrollment(value,{clusterId,nodeId,joinSecret}){
 if(!value||typeof value.publicKey!=='string'||value.publicKey.length>500||!/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----\n?$/.test(value.publicKey)||!/^[A-Za-z0-9_-]{86}$/.test(value.signature||''))fail('N1_ENROLLMENT_INVALID');
 const p={scope:'MHC_N1_ENROLLMENT',clusterId,nodeId,publicKey:value.publicKey,joinSecret};
 try{const k=await crypto.subtle.importKey('spki',Uint8Array.from(atob(value.publicKey.replace(/-----[^-]+-----|\s/g,'')),v=>v.charCodeAt(0)),'Ed25519',false,['verify']);
  const sig=Uint8Array.from(atob(value.signature.replaceAll('-','+').replaceAll('_','/')+'=='),v=>v.charCodeAt(0));
  if(!await crypto.subtle.verify('Ed25519',k,sig,new TextEncoder().encode(JSON.stringify(p))))throw Error();
 }catch{fail('N1_ENROLLMENT_SIGNATURE_INVALID');}return value.publicKey;
}
export function n1Config(env){
 if(env.MHC_N1_ENABLED!=='LAB_SELF_SERVICE')fail('N1_NOT_ENABLED',403);
 let c;try{c=JSON.parse(env.MHC_N1_CONFIG_JSON||'null');}catch{fail('N1_CONFIG_REQUIRED',503);}
 if(!c||c.accountId!=='35b2468610cfa060d5d02865b7996a74'||c.hostname!=='panel-lab.giaouoc.com'||!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(c.teamDomain||'')||!/^[A-Za-z0-9_-]{32,128}$/.test(c.audience||''))fail('N1_EXACT_LAB_CONFIG_REQUIRED',503);
 return c;
}
export async function n1EffectiveEnv(env,tx){
 const enrolled=await tx.get('n1-control-registry')||{},statics=controlNodes(env),combined={...statics};
 for(const [id,entry] of Object.entries(enrolled)){
  if(statics[id]&&JSON.stringify(statics[id])!==JSON.stringify(entry))fail('N1_EXISTING_CONTROL_PIN_CHANGED',503);
  combined[id]=entry;
 }
 const e={...env,MHC_CONTROL_NODES_JSON:JSON.stringify(combined)};controlNodes(e,JSON.parse(env.MHC_P32_PROOF_KEYS_JSON||'{}'));return e;
}
export function n1PublicView(row){return row?{phase:row.phase,tunnelId:row.tunnelId||null,controlRegistered:row.phase==='CONTROL_REGISTERED',tunnelVerifiedAt:row.verifiedAt?new Date(row.verifiedAt).toISOString():null,errorCode:row.errorCode||null,writerGranted:false,siteReady:false}:null;}
function ingress(c){return [{hostname:c.hostname,service:'http://127.0.0.1:9090',originRequest:{access:{required:true,teamName:c.teamDomain.replace('.cloudflareaccess.com',''),audTag:[c.audience]}}},{service:'http_status:404'}];}
function configMatches(raw,c,{legacy=false}={}){
 const rules=raw?.config?.ingress;
 if(!Array.isArray(rules)||rules.length!==(legacy?3:2))return false;
 const panel=rules.find(r=>r.hostname===c.hostname),access=panel?.originRequest?.access;
 if(panel?.service!=='http://127.0.0.1:9090'||access?.required!==true||access.teamName!==c.teamDomain.replace('.cloudflareaccess.com','')||JSON.stringify(access.audTag)!==JSON.stringify([c.audience])||rules.at(-1)?.service!=='http_status:404'||rules.at(-1)?.hostname)return false;
 return rules.every(r=>!r.hostname||r.hostname===c.hostname||legacy&&r.hostname==='preview-lab.giaouoc.com'&&r.service==='http://127.0.0.1:18131'&&r.originRequest?.access?.required===true&&r.originRequest?.access?.teamName===access.teamName&&JSON.stringify(r.originRequest?.access?.audTag)===JSON.stringify(access.audTag));
}
async function cf(env,c,method,suffix,body,fetcher){
 if(!/^[A-Za-z0-9._~-]{25,256}$/.test(env.MHC_N1_CF_TOKEN||''))fail('N1_CF_TUNNEL_PERMISSION_REQUIRED',503);
 let res;try{res=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+c.accountId+'/cfd_tunnel'+suffix,{method,headers:{authorization:'Bearer '+env.MHC_N1_CF_TOKEN,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(10000)});}catch{fail('N1_CF_UNREACHABLE',503);}
 if(res.status===401||res.status===403)fail('N1_CF_TUNNEL_PERMISSION_REQUIRED',503);
 if(!res.ok)fail('N1_CF_API_FAILED',503);
 let raw='',size=0;for await(const b of res.body||[]){size+=b.length;if(size>524288)fail('N1_CF_REPLY_TOO_LARGE',503);raw+=new TextDecoder().decode(b);}
 let data;try{data=JSON.parse(raw);}catch{fail('N1_CF_REPLY_INVALID',503);}if(data.success!==true)fail('N1_CF_API_FAILED',503);return data.result;
}
const fresh=(s,id,now)=>{const h=s.heartbeats?.[id];return h&&now>=h.receivedAt&&now-h.receivedAt<=90000&&now>=h.metricsAt&&now-h.metricsAt<=90000&&h.telemetry?.services?.['amh-panel']==='running'&&h.telemetry?.services?.['mhc-authority-agent']==='running';};
export async function n1Action({ctx,env,action,body={},nodeId,authorize,fetcher=fetch,now=Date.now()}){
 const c=n1Config(env);
 // Only the node agent can provision/publish itself; any authenticated Panel may read a candidate proof.
 const plan=await ctx.storage.transaction(async tx=>{
  const s=await tx.get('state');if(!s||await authorize(s)!==(action==='n1-control-proof'?'panel':'agent'))fail('ROLE_DENIED',403);
  if(action==='n1-control-proof'){
   if(!uuid.test(body.targetNodeId||''))fail('N1_TARGET_INVALID');
   const effective=await n1EffectiveEnv(env,tx),entry=controlNodes(effective)[body.targetNodeId],row=await tx.get('n1-node:'+body.targetNodeId),cached=await tx.get('n1-proof:'+body.targetNodeId),r=await tx.get('p33')||{epoch:s.epoch,revision:0,operationId:null};
   if(!entry||!row||row.phase!=='CONTROL_REGISTERED'||!row.verifiedAt||now-row.verifiedAt>90000||!fresh(s,body.targetNodeId,now)||!cached)fail('N1_CONTROL_PROOF_PENDING');
   await verifyControlProof(cached,entry,{...s,clusterId:env.MHC_CLUSTER_ID},r,{nodeId:body.targetNodeId,nonce:cached.proof?.nonce,kind:'READY',now});
   return {value:{envelope:cached,publicKey:entry.publicKey,clusterId:env.MHC_CLUSTER_ID}};
  }
  const member=s.dynamicMembers?.find(n=>n.nodeId===nodeId),approved=controlNodes(env)[nodeId],key=member?.controlPublicKey||approved?.publicKey;
  if(!key||!member||!fresh(s,nodeId,now))fail('N1_APPROVED_FRESH_MEMBERSHIP_REQUIRED');
  if(approved&&approved.publicKey!==key)fail('N1_EXISTING_CONTROL_PIN_CHANGED');
  let row=await tx.get('n1-node:'+nodeId);
  if(row&&row.publicKey!==key)fail('N1_EXISTING_CONTROL_PIN_CHANGED');
  if(action==='n1-publish'){
   const effective=await n1EffectiveEnv(env,tx),entry=controlNodes(effective)[nodeId],r=await tx.get('p33')||{epoch:s.epoch,revision:0,operationId:null};
   if(!row||row.phase!=='CONTROL_REGISTERED'||now-row.verifiedAt>90000||!entry)fail('N1_TUNNEL_NOT_VERIFIED');
   await verifyControlProof(body.envelope,entry,{...s,clusterId:env.MHC_CLUSTER_ID},r,{nodeId,nonce:body.envelope?.proof?.nonce,kind:'READY',now});
   await tx.put('n1-proof:'+nodeId,body.envelope);return {value:{published:true,...n1PublicView(row)}};
  }
  if(action!=='n1-provision')fail('N1_ACTION_INVALID');
  if(row?.busyUntil>now)fail('N1_PROVISION_IN_PROGRESS');
  if(!row){
   const registry=await tx.get('n1-control-registry')||{};
   if(new Set([...Object.keys(controlNodes(env)),...Object.keys(registry)]).size>=198)fail('N1_CONTROL_REGISTRY_FULL');
   row={schema:1,nodeId,publicKey:key,createdAt:now,name:'mhc-n1-'+env.MHC_CLUSTER_ID.slice(0,8)+'-'+nodeId.slice(0,8)+'-'+crypto.randomUUID().slice(0,8),phase:'APPROVED',...(approved?{tunnelId:approved.tunnelId,legacy:true}:{}),attempt:0};
  }
  row={...row,attempt:row.attempt+1,busyUntil:now+45000,errorCode:null};await tx.put('n1-node:'+nodeId,row);
  return {row};
 });
 if(plan.value)return plan.value;
 let row=plan.row;const commit=async patch=>ctx.storage.transaction(async tx=>{const current=await tx.get('n1-node:'+nodeId);if(current?.attempt!==row.attempt)fail('N1_PROVISION_CONFLICT');row={...current,...patch};await tx.put('n1-node:'+nodeId,row);return row;});
 try{
  if(!row.tunnelId){
   // A previous POST may have succeeded before a disconnect. Reconcile only the private journal name.
   const matches=await cf(env,c,'GET','?is_deleted=false&name='+encodeURIComponent(row.name)+'&per_page=2',null,fetcher);
   if(!Array.isArray(matches)||matches.length>1||matches.some(t=>t.name!==row.name||t.config_src!=='cloudflare'||t.deleted_at))fail('N1_TUNNEL_RECONCILIATION_REQUIRED');
   let t=matches[0];
   if(!t){await commit({phase:'CREATE_REQUESTED'});t=await cf(env,c,'POST','',{name:row.name,config_src:'cloudflare'},fetcher);}
   if(!uuid.test(t?.id||'')||t.name!==row.name||t.config_src!=='cloudflare')fail('N1_CF_TUNNEL_ID_INVALID');
   await commit({tunnelId:t.id,phase:'CREATED'});
  }
  const t=await cf(env,c,'GET','/'+row.tunnelId,null,fetcher);
  if(t?.id!==row.tunnelId||t.deleted_at||t.config_src!=='cloudflare'||!row.legacy&&t.name!==row.name)fail('N1_TUNNEL_IDENTITY_CONFLICT');
  let cfg=await cf(env,c,'GET','/'+row.tunnelId+'/configurations',null,fetcher);
  if(!configMatches(cfg,c,{legacy:row.legacy===true})){
   if(row.legacy||!['CREATED','CONFIGURE_REQUESTED'].includes(row.phase))fail('N1_EXISTING_TUNNEL_CONFIG_CHANGED');
   const existing=cfg?.config?.ingress;if(existing?.length&&!(existing.length===1&&!existing[0].hostname&&existing[0].service==='http_status:404'))fail('N1_EXISTING_TUNNEL_CONFIG_CHANGED');
   await commit({phase:'CONFIGURE_REQUESTED'});await cf(env,c,'PUT','/'+row.tunnelId+'/configurations',{config:{ingress:ingress(c)}},fetcher);
   cfg=await cf(env,c,'GET','/'+row.tunnelId+'/configurations',null,fetcher);if(!configMatches(cfg,c))fail('N1_TUNNEL_CONFIG_VERIFY_FAILED');
  }
  const token=await cf(env,c,'GET','/'+row.tunnelId+'/token',null,fetcher);if(typeof token!=='string'||token.length<30||token.length>8192||!/^[A-Za-z0-9_=+\/-]+$/.test(token))fail('N1_TUNNEL_TOKEN_INVALID',503);
  const healthy=t.status==='healthy'&&Array.isArray(t.connections)&&t.connections.some(v=>!v.is_pending_reconnect);
  await ctx.storage.transaction(async tx=>{
   const current=await tx.get('n1-node:'+nodeId);if(current?.attempt!==row.attempt)fail('N1_PROVISION_CONFLICT');
   const registry=await tx.get('n1-control-registry')||{},entry={publicKey:row.publicKey,tunnelId:row.tunnelId};
   if(healthy){
    if(registry[nodeId]&&JSON.stringify(registry[nodeId])!==JSON.stringify(entry))fail('N1_EXISTING_CONTROL_PIN_CHANGED');
    const next={...registry,[nodeId]:entry};const e={...env,MHC_CONTROL_NODES_JSON:JSON.stringify({...controlNodes(env),...next})};controlNodes(e,JSON.parse(env.MHC_P32_PROOF_KEYS_JSON||'{}'));
    await tx.put('n1-control-registry',next);
   }
   row={...current,phase:healthy?'CONTROL_REGISTERED':'WAITING_CONNECTOR',busyUntil:0,verifiedAt:healthy?now:null,errorCode:null};await tx.put('n1-node:'+nodeId,row);
   if(current.phase!==row.phase)await tx.put('n1-audit:'+nodeId+':'+row.attempt,{nodeId,phase:row.phase,at:new Date(now).toISOString(),writerGranted:false,dnsChanged:false});
  });
  // Only the authenticated owner receives its own token. Never put this response into status/audit.
  return {...n1PublicView(row),tunnelToken:token,origin:{schema:1,hostname:c.hostname,teamDomain:c.teamDomain,audience:c.audience},publicKey:row.publicKey};
 }catch(e){const code=/^N1_[A-Z0-9_]+$/.test(e.message)?e.message:'N1_PROVISION_FAILED';await commit({busyUntil:row.phase==='CREATE_REQUESTED'&&!row.tunnelId?now+45000:0,errorCode:code});fail(code,e.status||503);}
}
