// Operator-approved management-only targets. Never added to the site/writer set.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail=c=>{throw Object.assign(Error(c),{status:409});};
export function controlNodes(env,siteKeys={}){
 let entries;try{entries=JSON.parse(env.MHC_CONTROL_NODES_JSON||'{}');}catch{fail('CONTROL_REGISTRY_INVALID');}
 if(!entries||typeof entries!=='object'||Array.isArray(entries)||Object.keys(entries).length>18)fail('CONTROL_REGISTRY_INVALID');
 const keys=new Set(Object.values(siteKeys).map(k=>k.replace(/\s/g,''))),tunnels=new Set();
 for(const [id,v]of Object.entries(entries)){
  if(!uuid.test(id)||siteKeys[id]||!v||!uuid.test(v.tunnelId)||typeof v.publicKey!=='string'||v.publicKey.length>500||!/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----\s*$/.test(v.publicKey))fail('CONTROL_REGISTRY_INVALID');
  const key=v.publicKey.replace(/\s/g,'');if(keys.has(key)||tunnels.has(v.tunnelId))fail('CONTROL_REGISTRY_DUPLICATE_KEY_OR_TUNNEL');keys.add(key);tunnels.add(v.tunnelId);
 }
 return entries;
}
export function controlAdapter(base,entries){
 const routes=base.routes.map(r=>r.kind==='panel'?{...r,nodeTargets:{...r.nodeTargets,...Object.fromEntries(Object.entries(entries).map(([id,v])=>[id,v.tunnelId+'.cfargotunnel.com']))}}:r);
 if(Object.values(entries).some(v=>base.routes.some(r=>Object.values(r.nodeTargets).includes(v.tunnelId+'.cfargotunnel.com'))))fail('CONTROL_TUNNEL_MUST_BE_SEPARATE');
 return {...base.adapter,MHC_P3_ROUTES_JSON:JSON.stringify(routes)};
}
export async function verifyControlProof(envelope,entry,s,r,{nodeId,nonce,kind,now=Date.now()}){
 const p=envelope?.proof;
 if(!p||p.schema!==1||p.scope!=='MHC_CONTROL_ONLY'||p.nodeId!==nodeId||p.clusterId!==s.clusterId||p.epoch!==r.epoch||p.revision!==r.revision||p.operationId!==r.operationId||p.nonce!==nonce||!/^[a-f0-9]{64}$/.test(nonce||'')||p.kind!==kind||!Number.isSafeInteger(p.checkedAt)||p.expiresAt!==p.checkedAt+15000||now<p.checkedAt-2000||now>p.expiresAt||p.writerGranted!==false||p.siteReady!==false||!s.nodes?.some(n=>n.nodeId===nodeId)&&!s.dynamicMembers?.some(n=>n.nodeId===nodeId))fail('CONTROL_PROOF_STALE_OR_MISMATCH');
 if(p.management?.panel!==true||p.management?.agent!==true||p.management?.tunnel!==true)fail('CONTROL_MANAGEMENT_NOT_READY');
 if(kind==='PUBLIC_PANEL'&&(p.host!=='panel-lab.giaouoc.com'||p.accessVerified!==true))fail('CONTROL_PUBLIC_ACCESS_REQUIRED');
 try{
  const pem=entry.publicKey.replace(/-----[^-]+-----|\s/g,''),key=await crypto.subtle.importKey('spki',Uint8Array.from(atob(pem),v=>v.charCodeAt(0)),'Ed25519',false,['verify']);
  if(!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature||''))throw Error();
  const signature=Uint8Array.from(atob(envelope.signature.replaceAll('-','+').replaceAll('_','/')+'=='),v=>v.charCodeAt(0));
  if(!await crypto.subtle.verify('Ed25519',key,signature,new TextEncoder().encode(JSON.stringify(p))))throw Error();
 }catch{fail('CONTROL_SIGNATURE_INVALID');}
 return p;
}
