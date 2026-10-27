// P3 LAB: Cloudflare DNS route adapter. Runs in Worker/DO only; secrets NEVER leave Worker.
// Operator-assist and DNS-verification are NOT proven old-writer fencing or application readiness.
const HEX32=/^[a-f0-9]{32}$/i;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TUNNEL=/^[a-f0-9-]{36}\.cfargotunnel\.com$/i;
const HOST=/^(?=.{5,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?){2,}$/;
const error=(code)=>{throw Object.assign(Error(code),{status:409});};
export function p3Config(env){
 if(env.MHC_P3_LAB_ENABLED!=='OPERATOR_ASSISTED_DNS_ONLY')error('P3_NOT_ENABLED');
 let routes;try{routes=JSON.parse(env.MHC_P3_ROUTES_JSON||'null');}catch{error('P3_CONFIG_INVALID');}
 if(!Array.isArray(routes)||routes.length<1||routes.length>8)error('P3_CONFIG_INVALID');
 const names=new Set(),records=new Set();
 for(const r of routes){
  if(!r||!HEX32.test(r.zoneId||'')||!HEX32.test(r.recordId||'')||
    !HOST.test(r.hostname||'')||!['site','panel'].includes(r.kind)||
    !r.nodeTargets||typeof r.nodeTargets!=='object'||Array.isArray(r.nodeTargets)||
    names.has(r.hostname)||records.has(r.zoneId+':'+r.recordId))error('P3_CONFIG_INVALID');
  names.add(r.hostname);records.add(r.zoneId+':'+r.recordId);
  const members=Object.entries(r.nodeTargets);
  if(members.length<2||members.length>20||
     members.some(([k,v])=>!UUID.test(k)||!TUNNEL.test(v)))error('P3_CONFIG_INVALID');
 }
 if(!UUID.test(env.MHC_P3_INITIAL_PRIMARY_NODE_ID||''))error('P3_CONFIG_INVALID');
 if(typeof env.MHC_P3_CF_TOKEN!=='string'||env.MHC_P3_CF_TOKEN.length<25||/\s/.test(env.MHC_P3_CF_TOKEN))error('P3_CLOUDFLARE_TOKEN_MISSING');
 // Always update sites before the shared admin hostname, to maximize recovery time.
 return routes.slice().sort((a,b)=>Number(a.kind==='panel')-Number(b.kind==='panel'));
}
async function cfRequest(env,method,route,body,fetcher){
 const url='https://api.cloudflare.com/client/v4/zones/'+route.zoneId+'/dns_records/'+route.recordId;
 let res;
 try{res=await fetcher(url,{method,headers:{
  'authorization':'Bearer '+env.MHC_P3_CF_TOKEN,'content-type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',cache:'no-store',
  signal:AbortSignal.timeout(7000)});}
 catch{error('P3_CLOUDFLARE_NETWORK_FAILED');}
 if(!res.ok)error('P3_CLOUDFLARE_API_FAILED');
 let data;try{const raw=await res.text();if(raw.length>15000)error('P3_CLOUDFLARE_RESPONSE_INVALID');data=JSON.parse(raw);}catch{error('P3_CLOUDFLARE_RESPONSE_INVALID');}
 if(data?.success!==true||!data.result||typeof data.result!=='object')error('P3_CLOUDFLARE_API_FAILED');
 return data.result;
}
function verifyRecord(r,observed){
 if(observed.id!==r.recordId||observed.name!==r.hostname||observed.type!=='CNAME'||observed.proxied!==true)
  error('P3_EXISTING_ROUTE_MISMATCH');
}
async function switchDns(env,{fromNodeId,targetNodeId},fetcher,onlyPanel){
 const routes=p3Config(env).filter(r=>!onlyPanel||r.kind==='panel');
 if(onlyPanel&&routes.length!==1)error('P3_PANEL_ROUTE_MISSING_OR_DUPLICATE');
 if(!UUID.test(fromNodeId||'')||!UUID.test(targetNodeId||'')||fromNodeId===targetNodeId)
  error('P3_NODE_PAIR_INVALID');
 // Before touching any route, check ALL configured records point either to the incumbent
 // or the proposed target. The latter enables safe, idempotent crash recovery.
 const planned=[];
 for(const r of routes){
  const oldTarget=r.nodeTargets[fromNodeId],newTarget=r.nodeTargets[targetNodeId];
  if(!TUNNEL.test(oldTarget||'')||!TUNNEL.test(newTarget||'')||oldTarget===newTarget)
   error('P3_TARGET_TUNNEL_NOT_CONFIGURED');
  const current=await cfRequest(env,'GET',r,null,fetcher);
  verifyRecord(r,current);
  if(current.content!==oldTarget&&current.content!==newTarget)error('P3_ROUTE_CONFLICT_MANUAL_REVIEW');
  planned.push({route:r,newTarget,already:current.content===newTarget});
 }
 const results=[];
 for(const p of planned){
  if(!p.already){
   const changed=await cfRequest(env,'PATCH',p.route,{content:p.newTarget,proxied:true},fetcher);
   verifyRecord(p.route,changed);
  }
  const checked=await cfRequest(env,'GET',p.route,null,fetcher);
  verifyRecord(p.route,checked);
  if(checked.content!==p.newTarget)error('P3_DNS_VERIFY_FAILED');
  results.push({hostname:p.route.hostname,kind:p.route.kind,dnsTargetVerified:true});
 }
 return {dnsOnlyVerified:true,records:results,applicationVerified:false,writerFenced:false};
}

// Standby recovery changes only the protected Panel CNAME; website/DB and Primary
// authority must remain unchanged. Called by the scheduled DO, never by an agent.
export async function p3SwitchPanelDns(env,fromTo,fetcher=fetch){
 return switchDns(env,fromTo,fetcher,true);
}
export async function p3SwitchDns(env,fromTo,fetcher=fetch){
 return switchDns(env,fromTo,fetcher,false);
}
