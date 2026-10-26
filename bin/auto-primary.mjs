#!/usr/bin/env node
// MHC 0.5C AUTO PRIMARY LAB: chooses a standby for BEST-EFFORT RECOVERY, not a fencing proof.
// Explicit opt-in required; Cloudflare routing is disabled unless configured and independently administered.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const HOME=process.env.HOME||os.homedir();
const ROOT=path.join(HOME,'.config/mhc-full-installer');
const DIR=path.join(ROOT,'manual-primary');
const CFG=path.join(DIR,'auto-config.json'),STATE=path.join(DIR,'selection.json'), PENDING=path.join(DIR,'route-pending.json'), MEMBERS=path.join(ROOT,'members.json');
const UID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CFID=/^[0-9a-f]{32}$/i;
const SNAP=/^snapshot-([0-9]{8})$/;
const deny=m=>{throw Error(m)};
function secureDir(p){const st=fs.lstatSync(p);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))deny('Unsafe directory');}
function read(p,optional=false){try{const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>131072)deny('Unsafe private JSON');return JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}}
function write(p,o){const tmp=p+'.'+crypto.randomUUID();let fd;
 try{fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(o,null,2)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=null;
  fs.renameSync(tmp,p);const dirfd=fs.openSync(path.dirname(p),'r');try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}
 }catch(e){if(fd!==undefined&&fd!==null)fs.closeSync(fd);fs.rmSync(tmp,{force:true});throw e;}}

function controller(){secureDir(ROOT);const id=read(path.join(ROOT,'node-identity.json'));const cfg=read(path.join(ROOT,'cluster.json'));if(!UID.test(id?.nodeId)||cfg?.controllerNodeId!==id.nodeId||cfg?.mode!=='inventory-only')deny('Must run on enrolled controller');return {nodeId:id.nodeId,clusterId:cfg.clusterId};}
async function lock(fn){fs.mkdirSync(DIR,{recursive:true,mode:0o700});secureDir(DIR);let fd;const loc=path.join(DIR,'operation.lock');try{fd=fs.openSync(loc,'wx',0o600);}catch(e){deny('Operation lock held: inspect before retry');}try{return await fn();}finally{fs.closeSync(fd);fs.rmSync(loc,{force:true});}}
function prodGuard(){if(['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'].some(p=>fs.existsSync(path.join(HOME,p))))deny('Existing production / legacy HA footprint: AUTO LAB BLOCKED');}
export function rankNodes(nodes,currentId,now=Date.now(),timeout=180000){
 if(!Array.isArray(nodes))return [];
 return nodes.filter(n=>UID.test(n?.nodeId)&&n.nodeId!==currentId).map(n=>{
  const age=now-Date.parse(n.lastSeenAt||'');const live=Number.isFinite(age)&&age>=0&&age<=timeout&&['local-controller','ssh-authenticated-pairing-only'].includes(n.verification);
  const report=n.reportReceivedAt&&now-Date.parse(n.reportReceivedAt)<timeout?n.report:null;
  const stamps=[report?.backup?.snapshot,report?.clone?.snapshot].filter(x=>SNAP.test(x||''));
  const stamp=stamps.sort().at(-1)||null;
  const mem=Number.isSafeInteger(n.capability?.memoryMiB)?n.capability.memoryMiB:0;
  const free=Number.isSafeInteger(n.capability?.freeDiskMiB)?n.capability.freeDiskMiB:0;
  const backupKnown=!!stamp;
  return {nodeId:n.nodeId,label:String(n.label||'Node').slice(0,60),available:live,backupStamp:stamp,backupKnown,
   memoryMiB:Math.max(0,Math.min(mem,1000000)),freeDiskMiB:Math.max(0,Math.min(free,10000000)),
   lastSeenAt:n.lastSeenAt||null,backupActualDataVerified:false,healthProbeVerified:false};
 }).filter(x=>x.available).sort((a,b)=>Number(b.backupKnown)-Number(a.backupKnown)||
   (b.backupStamp||'').localeCompare(a.backupStamp||'')||b.freeDiskMiB-a.freeDiskMiB||b.memoryMiB-a.memoryMiB||a.nodeId.localeCompare(b.nodeId));
}
export function choose(members,current,now,timeout){const ranked=rankNodes(members,current,now,timeout);return {selected:ranked[0]||null,ranked,
  caveat:'Backup snapshot date is only a recorded freshness hint, not verified live database freshness. Offline writes and missing files may be lost.'};}
function settings(){const c=read(CFG,true);if(!c)return {enabled:false,mode:'RECOMMEND_ONLY',timeoutMs:180000,criticalNotice:'No automatic routing configured'};
 if(c.schema!==1||typeof c.enabled!=='boolean'||c.mode!=='RECOMMEND_ONLY'&&c.mode!=='BEST_EFFORT_ROUTE'||!Number.isSafeInteger(c.timeoutMs)||c.timeoutMs<120000||c.timeoutMs>900000)deny('Invalid auto-primary configuration');return c;}
function sanitized(){controller();fs.mkdirSync(DIR,{recursive:true,mode:0o700});secureDir(DIR);const s=read(STATE,true);const c=settings();const m=read(MEMBERS,true);
 const primary=s?.declaredPrimary?.nodeId||null;const retired=new Set((s?.retiredPrimaries||[]).map(x=>x.nodeId));const ranks=choose((m?.nodes||[]).filter(n=>!retired.has(n.nodeId)&&n.nodeId!==controller().nodeId),primary,Date.now(),c.timeoutMs);
 const primaryEntry=m?.nodes?.find(n=>n.nodeId===primary);
 const last=primaryEntry?.lastSeenAt?Date.parse(primaryEntry.lastSeenAt):null;
 const offline=primary!==null&&(last===null||Date.now()-last>c.timeoutMs);
 return {enabled:c.enabled,mode:c.mode,declaredPrimary:primary,pendingManual:!!s?.pending,primaryOffline:offline,
  chosenCandidate:ranks.selected,ranked:ranks.ranked,quarantined:s?.retiredPrimaries||[],pendingRoute:(()=>{const p=read(PENDING,true);return p?{from:p.from,to:p.to,createdAt:p.createdAt,status:'RECOVERY_REQUIRED_ROUTE_MAY_ALREADY_BE_CHANGED'}:null;})(),lastElection:s?.lastAutoElection||null,
  routingChangedAutomatically:s?.lastAutoElection?.routeVerified===true,
  independentFencingProven:false,controllerMustRemainOnline:true,
  caveat:ranks.caveat+' On rejoin the former Primary is a STANDBY in controller inventory; this does not itself stop a remote writer.'};}
function audit(msg){fs.appendFileSync(path.join(DIR,'auto-events.jsonl'),JSON.stringify({at:new Date().toISOString(),...msg})+'\n',{mode:0o600});}
function updateState(modifier){let old=read(STATE,true)||{schema:1,declaredPrimary:null,pending:null,revision:0};if(old.schema!==1||!Number.isSafeInteger(old.revision))deny('Bad selection state');const next=modifier(old);write(STATE,{...next,revision:old.revision+1});}
function markRejoin(id){if(!UID.test(id))deny('Bad node ID');updateState(s=>{if(s.declaredPrimary?.nodeId===id)deny('Cannot quarantine currently recorded Primary');const demoted=(s.retiredPrimaries||[]).filter(x=>x.nodeId!==id);demoted.push({nodeId:id,status:'STANDBY_REJOIN_REQUIRES_RESTORE',recordedAt:new Date().toISOString()});return {...s,retiredPrimaries:demoted.slice(-150)};});audit({action:'QUARANTINE_REJOIN',nodeId:id});}
function safeConfig(config){const d={schema:1,enabled:false,mode:'RECOMMEND_ONLY',timeoutMs:180000};write(CFG,d);return d;}
async function fetchCloudflare(url,method,token,data,fetcher=fetch){const ac=new AbortController();const to=setTimeout(()=>ac.abort(),6000);
 try{const r=await fetcher(url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:data?JSON.stringify(data):undefined,signal:ac.signal,redirect:'error',cache:'no-store'});if(!r.ok)deny('Cloudflare API HTTP status '+r.status);const t=await r.text();if(t.length>30000)deny('Oversized Cloudflare reply');const j=JSON.parse(t);if(!j.success||!j.result)deny('Cloudflare rejected operation');return j.result;}finally{clearTimeout(to)}
}
export async function updateCloudflareRoute(config,nodeId,currentId,fetcher=fetch){
 const cf=config.cloudflare;if(!cf||!CFID.test(cf.zoneId)||!CFID.test(cf.recordId)||!/^[a-z0-9.-]{3,150}$/i.test(cf.hostname||''))deny('Cloudflare DNS config missing');
 const tunnel=cf.nodeTargets?.[nodeId],oldTarget=cf.nodeTargets?.[currentId];
 const tunnelRegex=/^[0-9a-f-]{36}\.cfargotunnel\.com$/i;
 if(!tunnelRegex.test(tunnel||'')||!tunnelRegex.test(oldTarget||''))deny('Only predeclared Tunnel CNAME targets allowed');
 const tokenfile=cf.tokenFile;if(!tokenfile||!path.isAbsolute(tokenfile))deny('Token file must be absolute');
 const st=fs.lstatSync(tokenfile);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>4096)deny('Unsafe Cloudflare token');const token=fs.readFileSync(tokenfile,'utf8').trim();if(token.length<30||/\s/.test(token))deny('Invalid Cloudflare token');
 const url=`https://api.cloudflare.com/client/v4/zones/${cf.zoneId}/dns_records/${cf.recordId}`;
 const before=await fetchCloudflare(url,'GET',token,null,fetcher);
 if(before.name!==cf.hostname||before.type!=='CNAME'||before.proxied!==true)deny('Cloudflare record metadata mismatch');
 // A previous attempt may have PATCHed DNS but crashed before saving controller state.
 // In that case, verify existing target and finalize without issuing a second PATCH.
 if(before.content!==tunnel){if(before.content!==oldTarget)deny('Live Cloudflare route not at the incumbent or proposed target; STOP');
  await fetchCloudflare(url,'PATCH',token,{content:tunnel,proxied:true},fetcher);}
 const after=await fetchCloudflare(url,'GET',token,null,fetcher);
 if(after.name!==cf.hostname||after.content!==tunnel||after.proxied!==true)deny('Cloudflare update not verified');return {routeVerified:true};
}
function validatePending(p){
 if(!p||p.schema!==1||!UID.test(p.from)||!UID.test(p.to)||p.from===p.to||!Number.isFinite(Date.parse(p.createdAt||'')))deny('Corrupt route-pending record; manual review required');
 return p;
}
function completeRoute(p){
 updateState(s=>{if(s.declaredPrimary?.nodeId!==p.from||s.pending)deny('Primary record changed while routing pending; manual review required');
  return {...s,declaredPrimary:{nodeId:p.to,recordedAt:new Date().toISOString(),authority:'AUTO_BEST_EFFORT_ROUTE_ONLY',routingVerified:true,fencingVerified:false},
    retiredPrimaries:[...(s.retiredPrimaries||[]).filter(x=>x.nodeId!==p.to&&x.nodeId!==p.from),{nodeId:p.from,status:'STANDBY_REJOIN_REQUIRES_RESTORE',recordedAt:new Date().toISOString()}].slice(-150),
    lastAutoElection:{at:new Date().toISOString(),from:p.from,to:p.to,sourceBackupStamp:p.backupStamp,routeVerified:true,fencingVerified:false,possiblyLostWrites:true}};
 });
 // A crash here is recoverable too: controller already points to p.to, so next tick only removes journal.
 audit({action:'BEST_EFFORT_DNS_SWITCHED',from:p.from,to:p.to});
 fs.rmSync(PENDING,{force:true});
 return {action:'ROUTE_SWITCHED_BEST_EFFORT',from:p.from,to:p.to,routeVerified:true,oldNodeFenced:false,potentialDataLoss:true};
}
async function tick(){return await lock(async()=>{
 prodGuard();const ctrl=controller();const cfg=settings();if(!cfg.enabled)return {action:'DISABLED'};
 const st=read(STATE,true),members=read(MEMBERS,true);
 const existing=read(PENDING,true);
 if(existing){
  const p=validatePending(existing);
  if(st?.declaredPrimary?.nodeId===p.to&&!st.pending){fs.rmSync(PENDING,{force:true});return {action:'RECOVERED_ALREADY_COMMITTED',to:p.to};}
  if(st?.declaredPrimary?.nodeId!==p.from||st.pending)deny('Pending route conflicts with selection; manual review required');
  if(cfg.mode!=='BEST_EFFORT_ROUTE'||cfg.iAcceptSplitBrainRisk!==true||cfg.independentControllerDeclared!==true||cfg.oldNodeRejoinGuardDeclared!==true)deny('Pending route: routing opt-in removed; inspect Cloudflare manually');
  await updateCloudflareRoute(cfg,p.to,p.from);
  return completeRoute(p);
 }
 if(!st?.declaredPrimary?.nodeId||st.pending)return {action:'NO_ACTIVE_RECORDED_PRIMARY_OR_PENDING_MANUAL'};
 const current=st.declaredPrimary.nodeId;if(current===ctrl.nodeId)return {action:'CONTROLLER_IS_PRIMARY_NO_INDEPENDENT_ELECTION'};
 const primary=members?.nodes?.find(n=>n.nodeId===current);
 const age=Date.now()-Date.parse(primary?.lastSeenAt||'');
 if(Number.isFinite(age)&&age>=0&&age<=cfg.timeoutMs)return {action:'PRIMARY_HEARTBEAT_RECENT'};
 const retired=new Set((st.retiredPrimaries||[]).map(x=>x.nodeId));const chosen=choose((members?.nodes||[]).filter(x=>!retired.has(x.nodeId)&&x.nodeId!==ctrl.nodeId),current,Date.now(),cfg.timeoutMs).selected;
 if(!chosen)return {action:'NO_HEALTHY_STANDBY',current};
 if(cfg.mode!=='BEST_EFFORT_ROUTE'){
  audit({action:'RECOMMEND_ONLY',candidate:chosen.nodeId,current});return {action:'CANDIDATE_RECOMMENDED_ONLY',candidate:chosen,notice:'NOT promoted or routed'};
 }
 if(cfg.iAcceptSplitBrainRisk!==true||cfg.independentControllerDeclared!==true||cfg.oldNodeRejoinGuardDeclared!==true)deny('Best-effort election not explicitly authorized / no external controller declared');
 const pending={schema:1,from:current,to:chosen.nodeId,backupStamp:chosen.backupStamp,createdAt:new Date().toISOString()};
 // Persist intent BEFORE making the irreversible network call. If the process dies, the next
 // tick reconciles the SAME target, never elects another candidate mid-flight.
 write(PENDING,pending);
 await updateCloudflareRoute(cfg,chosen.nodeId,current);
 return completeRoute(pending);
 });}
export async function main(args){const [cmd,...params]=args;switch(cmd){
 case 'plan':return {scope:'AUTO_PRIMARY_LAB',mode:'RECOMMEND_ONLY_DEFAULT',enabled:false,
  algorithm:'Recent SSH authenticated heartbeat + newest recorded snapshot YYYYMMDD, then free disk and RAM. Not live freshness.',
  requires:['Controller independent of serving Primary','SSH heartbeat to independent controller','Remote node services obey rejoin/demotion policy','Optional Cloudflare API token with DNS Write limited zone','Per-node healthy Tunnel','Backup restored separately, possible data loss accepted'],
  warning:'DNS-only failover does NOT stop old database writers. Auto promotion is best-effort / potential split-brain.'};
 case 'status':return sanitized();
 case 'init':controller();prodGuard();fs.mkdirSync(DIR,{recursive:true,mode:0o700});secureDir(DIR);if(fs.existsSync(CFG))deny('Already configured; edit private auto-config.json deliberately');return lock(()=>({initialized:true,settings:safeConfig()}));
 case 'tick':return await tick();
 case 'service-install':{controller();prodGuard();if(params.length!==1||params[0]!=='--confirm=INSTALL_LAB_AUTO_WATCH')deny('Explicit LAB service confirmation required');const cfg=settings();if(!cfg.enabled)deny('Enable recommendation mode first');
  const prefix=process.env.PREFIX||'/data/data/com.termux/files/usr';if(!prefix.startsWith('/data/data/com.termux/files/usr'))deny('Only Termux runit path supported');const services=path.join(prefix,'var/service');const serviceDir=path.join(services,'mhc-auto-primary');if(fs.existsSync(serviceDir))deny('Service already present, inspect manually');fs.mkdirSync(serviceDir,{recursive:true,mode:0o700});const runScript=path.join(serviceDir,'run');fs.writeFileSync(runScript,'#!/data/data/com.termux/files/usr/bin/sh\nexec '+prefix+'/bin/node '+path.join(HOME,'.local/share/mhc-full-installer/bin/auto-primary.mjs')+' watch --confirm=START_LAB_WATCH\n',{mode:0o700,flag:'wx'});return {created:true,service:serviceDir,startedByThisCommand:false,command:'sv up mhc-auto-primary'};}
 case 'watch':{if(params.length!==1||params[0]!=='--confirm=START_LAB_WATCH')deny('Explicit watch confirmation required');
  controller();prodGuard();console.error('MHC auto-primary watch active; this is a BEST EFFORT TEST, not hard fencing.');
  while(true){try{const result=await tick();console.log(JSON.stringify({at:new Date().toISOString(),...result}));}catch(e){console.error('WATCH BLOCKED:',e.message);}
   await new Promise(resolve=>setTimeout(resolve,45000));}
 }
 case 'enable':controller();prodGuard();return lock(()=>{const cfg=settings();if(!fs.existsSync(CFG))deny('Initialize first');
  if(params.length!==1||params[0]!=='--confirm=ENABLE_AUTO_ELECTION_RECOMMEND_ONLY')deny('Explicit confirmation required');
  write(CFG,{...cfg,enabled:true,mode:'RECOMMEND_ONLY'});return {enabled:true,mode:'RECOMMEND_ONLY',routingChanged:false};});
 case 'disable':controller();return lock(()=>{const cfg=settings();if(!fs.existsSync(CFG))deny('Initialize first');
  if(params.length!==1||params[0]!=='--confirm=DISABLE_AUTO_ELECTION')deny('Explicit confirmation required');write(CFG,{...cfg,enabled:false});return {enabled:false};});
 case 'role':{const ctrl=controller(),id=params[0];if(!UID.test(id||'')||params.length!==1)deny('Valid node ID required');const state=read(STATE,true);const current=state?.declaredPrimary?.nodeId;return {nodeId:id,role:current===id?'RECORDED_PRIMARY':'STANDBY',quarantined:(state?.retiredPrimaries||[]).some(x=>x.nodeId===id),remoteWriterFenced:false,authority:'CONTROLLER_LOCAL_RECORD_ONLY',clusterId:ctrl.clusterId};}
 case 'rejoin':controller();prodGuard();if(params.length!==2||params[1]!=='--confirm=QUARANTINE_OLD_PRIMARY')deny('Explicit quarantine confirmation required');return lock(()=>{markRejoin(params[0]);return {nodeId:params[0],role:'STANDBY_REJOIN_REQUIRES_RESTORE',serviceStoppedOnRemote:false};});
 default:deny('Usage: auto-primary plan|status|init|enable|disable|tick|watch|service-install|role NODE_ID|rejoin NODE_ID');
}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error('STOP:',e.message);process.exitCode=1});
