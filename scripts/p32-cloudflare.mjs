#!/usr/bin/env node
// GET-only account audit and configuration plan. No API mutation or token stdout.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {p32Config,LAB_NODES} from '../reference/cluster-authority/p32-lab.mjs';
const HEX32=/^[a-f0-9]{32}$/;const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HOSTS=['panel.giaouoc.com','panel-lab.giaouoc.com','preview-lab.giaouoc.com'];
function fail(code){throw Error(code);}
export function buildLabPlan(c){
 if(!HEX32.test(c.zoneId||'')||!Array.isArray(c.records)||!c.tunnels||!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(c.teamDomain||'')||!/^[A-Za-z0-9_-]{32,128}$/.test(c.audience||''))fail('P32_PLAN_INPUT_INVALID');
 const routes=c.records.map(r=>({zoneId:c.zoneId,recordId:r.id,hostname:r.hostname,kind:r.kind,nodeTargets:Object.fromEntries(LAB_NODES.map(id=>{if(!UUID.test(c.tunnels[id]||''))fail('P32_PLAN_TUNNEL_ID_INVALID');return [id,c.tunnels[id]+'.cfargotunnel.com'];}))}));
 const vars={MHC_P32_LAB_ENABLED:'READ_ONLY_ROUTING',MHC_P32_INITIAL_NODE_ID:LAB_NODES[0],MHC_P32_ROUTES_JSON:JSON.stringify(routes),MHC_P32_PROOF_KEYS_JSON:JSON.stringify(c.proofKeys)};
 p32Config({...vars,MHC_P32_CF_TOKEN:'PLAN_ONLY_NO_RUNTIME_SECRET_123456789'});
 const access={required:true,teamName:c.teamDomain.replace('.cloudflareaccess.com',''),audTag:[c.audience]};
 return {mode:'PLAN_ONLY',mutatesCloudflare:false,productionHostnameExcluded:'panel.giaouoc.com',worker:'mhc-cluster-authority-lab',preserveExisting:['MHC_CLUSTER_ID','MHC_MEMBERS_JSON','MHC_AUTHORITY binding','v1 migration/DO state','other secrets/vars/routes'],workerVars:vars,workerSecretRequired:'MHC_P32_CF_TOKEN (DNS Edit only giaouoc LAB; never copy to Android)',recoveryInitiallyDisabled:true,recoveryOptInAfterAcceptance:{MHC_P32_PANEL_RECOVERY_ENABLED:'LAB_PANEL_ONLY'},panelApplication:{hostname:'panel-lab.giaouoc.com',teamDomain:c.teamDomain,audience:c.audience},tunnelIngressToAppend:[{hostname:'panel-lab.giaouoc.com',service:'http://127.0.0.1:9090',originRequest:{access}},{hostname:'preview-lab.giaouoc.com',service:'http://127.0.0.1:18131',originRequest:{httpHostHeader:'127.0.0.1:18131',access}}],instructions:'Append before existing catch-all on BOTH distinct Tunnels. Preserve all existing Vsmart ingress. Do not publish the hostname on the second Tunnel using a workflow that silently replaces its DNS record. Initial DNS points only to Vsmart; record targets change through the DO journal.'};
}
export async function auditCloudflare({accountId,token},fetcher=fetch){
 if(!HEX32.test(accountId||'')||typeof token!=='string'||!/^[A-Za-z0-9._~+/-]{25,8192}={0,2}$/.test(token))fail('P32_AUDIT_CREDENTIAL_FORMAT');
 const get=async route=>{
  try{
   const r=await fetcher('https://api.cloudflare.com/client/v4'+route,{method:'GET',headers:{authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
   let raw='',size=0;const decoder=new TextDecoder();for await(const b of r.body||[]){size+=b.length;if(size>1048576)fail('P32_AUDIT_RESPONSE_TOO_LARGE');raw+=decoder.decode(b,{stream:true});}raw+=decoder.decode();
   const data=JSON.parse(raw);if(!r.ok||data.success!==true)return {ok:false,status:r.status};return {ok:true,value:data.result};
  }catch{return {ok:false,status:'NETWORK_OR_RESPONSE_ERROR'};}
 };
 const base='/accounts/'+accountId,script=base+'/workers/scripts/mhc-cluster-authority-lab';
 const [settings,deployments,schedules,tunnels,apps,zones]=await Promise.all([get(script+'/settings'),get(script+'/deployments'),get(script+'/schedules'),get(base+'/cfd_tunnel?is_deleted=false&per_page=100'),get(base+'/access/apps?per_page=100'),get('/zones?account.id='+accountId+'&name=giaouoc.com&per_page=5')]);
 const safe=(r,f)=>r.ok?{ok:true,...f(r.value)}:{ok:false,status:r.status};
 const report={mode:'READ_ONLY_AUDIT',mutatesCloudflare:false,dnsMutationCalls:0,sourceHashVerification:'NOT_VERIFIED_METADATA_ONLY',worker:{settings:safe(settings,v=>({bindings:(v.bindings||[]).map(b=>({name:b.name,type:b.type,...(b.class_name?{className:b.class_name}:{})})),compatibilityDate:v.compatibility_date||null})),deployments:safe(deployments,v=>({deployments:(v.deployments||v||[]).slice(0,5).map(d=>({id:d.id,source:d.source,createdOn:d.created_on,versions:d.versions}))})),schedules:safe(schedules,v=>({schedules:(v.schedules||v||[]).map(x=>({cron:x.cron}))}))},tunnels:safe(tunnels,v=>({tunnels:(Array.isArray(v)?v:[]).filter(t=>/mhc|vsmart|xz3/i.test(t.name||'')).map(t=>({id:t.id,name:t.name,status:t.status,connections:Array.isArray(t.connections)?t.connections.length:null,configSrc:t.config_src}))})),access:safe(apps,v=>({applications:(Array.isArray(v)?v:[]).filter(a=>HOSTS.includes(a.domain)||(a.destinations||[]).some(d=>HOSTS.includes(d.uri||d.hostname))).map(a=>({id:a.id,name:a.name,type:a.type,domain:a.domain,audience:a.aud,destinations:(a.destinations||[]).map(d=>({uri:d.uri||d.hostname,type:d.type}))}))})),zone:safe(zones,v=>({zones:(Array.isArray(v)?v:[]).filter(z=>z.name==='giaouoc.com').map(z=>({id:z.id,name:z.name,status:z.status}))}))};
 if(report.access.ok&&!report.access.applications.length)report.access.verification='NO_MATCH_IS_NOT_PROOF_OF_ABSENCE';
 if(zones.ok&&zones.value?.length===1&&HEX32.test(zones.value[0].id)){
  const z=zones.value[0].id;report.dns=await Promise.all(HOSTS.map(async host=>({hostname:host,...safe(await get('/zones/'+z+'/dns_records?name='+host+'&per_page=10'),v=>({records:(Array.isArray(v)?v:[]).map(r=>({id:r.id,type:r.type,name:r.name,content:r.content,proxied:r.proxied}))}))})));
 }
 if(report.access.ok)for(const app of report.access.applications){
  if(!UUID.test(app.id||''))continue;
  app.policies=safe(await get(base+'/access/apps/'+app.id+'/policies'),v=>({policies:(Array.isArray(v)?v:[]).map(p=>({id:p.id,name:p.name,decision:p.decision,includeSelectors:(p.include||[]).flatMap(x=>Object.keys(x)),requireSelectors:(p.require||[]).flatMap(x=>Object.keys(x))}))}));
 }
 if(report.tunnels.ok)for(const t of report.tunnels.tunnels){
  if(!UUID.test(t.id||''))continue;
  t.configuration=safe(await get(base+'/cfd_tunnel/'+t.id+'/configurations'),v=>({ingress:(v.config?.ingress||[]).filter(i=>HOSTS.includes(i.hostname)).map(i=>({hostname:i.hostname,service:i.service,httpHostHeader:i.originRequest?.httpHostHeader||null,accessRequired:i.originRequest?.access?.required===true,teamName:i.originRequest?.access?.teamName||null,audTag:i.originRequest?.access?.audTag||[]}))}));
 }
 return report;
}
function privateToken(file){
 if(process.platform==='win32')fail('P32_USE_POSIX_PRIVATE_TOKEN_FILE');
 file=path.resolve(file);for(let p=file;;p=path.dirname(p)){const st=fs.lstatSync(p);if(st.isSymbolicLink())fail('P32_AUDIT_SYMLINK_DENIED');if(fs.existsSync(path.join(p,'.git')))fail('P32_AUDIT_TOKEN_INSIDE_GIT');if(p===path.dirname(p))break;}
 const st=fs.lstatSync(file),parent=fs.statSync(path.dirname(file));if(!st.isFile()||st.size>1000||(st.mode&0o077)||(parent.mode&0o077))fail('P32_AUDIT_PRIVATE_TOKEN_REQUIRED');return fs.readFileSync(file,'utf8').trim();
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [cmd,file]=process.argv.slice(2);if(!['plan','audit'].includes(cmd)||!file)fail('Usage: p32-cloudflare.mjs plan NONSECRET_CONFIG_JSON | audit CONFIG_WITH_ACCOUNT_ID_AND_PRIVATE_TOKEN_FILE');
  const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>65536)fail('P32_INPUT_FILE_UNSAFE');const c=JSON.parse(fs.readFileSync(file,'utf8'));
  const result=cmd==='plan'?buildLabPlan(c):await auditCloudflare({accountId:c.accountId,token:privateToken(c.tokenFile)});console.log(JSON.stringify(result,null,2));
 }catch(e){console.error(/^P32_[A-Z_]+$/.test(e.message)?e.message:'P32_CONFIG_OR_AUDIT_FAILED');process.exitCode=1;}
}
