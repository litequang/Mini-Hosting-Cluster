#!/usr/bin/env node
// MHC TEST 0.3.7: LOCAL READ-ONLY LAB Cluster Panel summary.
// No network requests, no mutations, no secret serialization, no HA decisions.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {sanitizeMemberReport} from './member-telemetry.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SNAP=/^snapshot-[0-9]{8}$/;
const SAFE_LABEL=/^[^\x00-\x1f\x7f]{1,80}$/;
const MAX=1024*1024;
const safe=(v,limit=80)=>typeof v==='string'?v.slice(0,limit):'';
const uuid=v=>UUID.test(v||'')?v:null;
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
const elapsed=(v,now)=>{const t=Date.parse(v);return Number.isFinite(t)?now-t:null;};
function safeJson(filename,warnings){
  try{
    const st=fs.lstatSync(filename);
    if(!st.isFile()||st.isSymbolicLink()||(st.mode & 0o077)||st.size>MAX)throw Error('unsafe file permissions, type, or size');
    const result=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(!result||typeof result!=='object'||Array.isArray(result))throw Error('invalid JSON object');
    return result;
  }catch(e){if(e.code==='ENOENT')return null;warnings.push(`${path.basename(filename)} unavailable or unsafe; data omitted`);return null;}
}
function safeDirList(root,warnings,cap=100){
  try{const st=fs.lstatSync(root);if(!st.isDirectory()||st.isSymbolicLink())throw Error('unsafe directory');
    return fs.readdirSync(root).filter(x=>/^[a-f0-9-]{36}-snapshot-[0-9]{8}\.json$/i.test(x)).sort().slice(-cap);
  }catch(e){if(e.code==='ENOENT')return [];warnings.push('Clone receipt directory unsafe; data omitted');return [];}
}
function snapshotPointer(home,warnings,now){
  const dir=path.join(home,'hosting-backups/mhc-full');
  const file=path.join(dir,'latest-success-path');
  try{const st=fs.lstatSync(file);
    if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>512)throw Error('unsafe pointer');
    const txt=fs.readFileSync(file,'utf8').trim();const name=path.basename(txt);
    if(!SNAP.test(name)||txt!==path.join(dir,name))throw Error('pointer outside managed directory');
    const sub=path.join(dir,name);const s=fs.lstatSync(sub);
    if(!s.isDirectory()||s.isSymbolicLink())throw Error('missing/unsafe snapshot');
    const manifest=fs.lstatSync(path.join(sub,'SHA256SUMS'));
    if(!manifest.isFile()||manifest.isSymbolicLink())throw Error('missing/unsafe checksum manifest');
    return {status:'RECORDED_NOT_REVERIFIED',snapshot:name,recordedAgeHours:Math.round((now-s.mtimeMs)/360000)/10,checksumNowVerified:false};
  }catch(e){if(e.code!=='ENOENT')warnings.push('Latest backup pointer/snapshot unsafe or incomplete');return {status:'NOT_VERIFIED',snapshot:null,checksumNowVerified:false};}
}
function nodesForController(members,offers,now,warnings){
  if(!Array.isArray(members?.nodes)){
    warnings.push('Controller membership registry unavailable; no node claims');return {total:0,items:[]};
  }
  const total=members.nodes.length;
  if(total>10000)warnings.push('Membership registry exceeds supported LAB limit');
  const items=members.nodes.slice(0,200).map(x=>{
    const id=uuid(x?.nodeId);if(!id)return null;
    const hb=stamp(x.lastSeenAt),age=hb?elapsed(hb,now):null;
    const heartbeat=age!==null&&age>=0&&age<180000?'RECENT_AUTHENTICATED':age!==null&&age>=180000?'STALE':'NOT_RECENTLY_VERIFIED';
    const offer=offers?.offers?.[id];const expiresAt=Number.isFinite(offer?.expiresAt)?offer.expiresAt:null;
    const offerStatus=expiresAt===null?'NONE':expiresAt>now?'APPROVED_NOT_CLONED':'EXPIRED';
    const cap=x.capability&&typeof x.capability==='object'&&!Array.isArray(x.capability)?x.capability:{};
    let observedReport=null;
    const received=stamp(x.reportReceivedAt),reportAge=received?elapsed(received,now):null;
    // Registry is local metadata, not a trusted source of asserted readiness.
    if(x.report&&reportAge!==null&&reportAge>=0&&reportAge<3600000){
      try{observedReport=sanitizeMemberReport(x.report);}catch{warnings.push('Invalid member report omitted');}
    }
    const reportFresh=!!(observedReport&&reportAge<300000&&heartbeat==='RECENT_AUTHENTICATED');
    const reportState=reportFresh?'RECENT_AUTHENTICATED_REPORT':observedReport?'STALE_OR_UNVERIFIED_REPORT':'NO_RECENT_REPORT';
    const alerts=[];
    if(x.verification!=='local-controller'&&heartbeat!=='RECENT_AUTHENTICATED')alerts.push('HEARTBEAT_NOT_RECENT');
    if(x.verification!=='local-controller'&&!reportFresh)alerts.push('MEMBER_REPORT_NOT_RECENT');
    if(reportFresh&&observedReport?.clone.state==='INVALID_RECEIPT')alerts.push('CLONE_RECEIPT_INVALID');
    if(reportFresh&&observedReport?.clone.state==='AMBIGUOUS_RECEIPTS')alerts.push('CLONE_RECEIPTS_AMBIGUOUS');
    // No report can ever grant write authority / replica readiness.
    const telemetry=reportFresh?observedReport:null;
    return {nodeId:id,label:SAFE_LABEL.test(x.label||'')?safe(x.label):'Unknown node',
      deviceModel:safe(cap.deviceModel,64)||null,
      memoryMiB:Number.isInteger(cap.memoryMiB)&&cap.memoryMiB>=0?cap.memoryMiB:null,
      freeDiskMiB:Number.isInteger(cap.freeDiskMiB)&&cap.freeDiskMiB>=0?cap.freeDiskMiB:null,
      enrolledAt:stamp(x.enrolledAt),lastSeenAt:hb,heartbeat,cloneOffer:offerStatus,
      memberReport:{state:reportState,receivedAt:received,ageSeconds:reportAge===null?null:Math.round(reportAge/1000),evidence:telemetry},alerts,
      offeredSnapshot:offerStatus==='APPROVED_NOT_CLONED'&&SNAP.test(offer.snapshot||'')?offer.snapshot:null,
      replicated:false,haEligible:false,primaryVerified:false};
  }).filter(Boolean);
  return {total,items};
}
function privateLabCount(dir,warnings,validator){
  try{
    const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink())throw Error('unsafe directory');
    let count=0;
    for(const name of fs.readdirSync(dir).slice(0,1001)){
      if(!/^[a-z][a-z0-9-]{1,30}\.json$/.test(name))continue;
      const obj=safeJson(path.join(dir,name),warnings);
      if(obj&&validator(obj,name.slice(0,-5)))count++;
    }
    return count;
  }catch(e){if(e.code==='ENOENT')return 0;warnings.push('Lab evidence count unavailable');return null;}
}
function localClone(home,joined,warnings){
  const source=uuid(joined?.controllerNodeId);if(!source)return {state:'NO_LAB_CLONE',snapshot:null};
  const base=path.join(home,'hosting-clones/mhc-full');const receiptDir=path.join(base,'receipts');
  const names=safeDirList(receiptDir,warnings).filter(x=>x.startsWith(`${source}-`));
  if(names.length!==1)return {state:names.length>1?'AMBIGUOUS_RECEIPTS':'NO_LAB_CLONE',snapshot:null};
  const rec=safeJson(path.join(receiptDir,names[0]),warnings);
  if(!rec||rec.sourceNodeId!==source||rec.recipientNodeId!==joined.nodeId||!SNAP.test(rec.snapshot||''))return {state:'INVALID_RECEIPT',snapshot:null};
  const att=safeJson(path.join(base,'stage-attestations',names[0]),warnings);
  const stageRecorded=!!(att&&att.sourceNodeId===source&&att.snapshot===rec.snapshot&&Array.isArray(att.files));
  const lab=path.join(base,'labs',source,rec.snapshot);
  const readiness=safeJson(path.join(lab,'readiness.json'),warnings);
  const labRecorded=!!(readiness&&readiness.snapshot===rec.snapshot);
  return {state:labRecorded?'LAB_PREPARED_NOT_LIVE':stageRecorded?'STAGE_RECORDED_NOT_REVERIFIED':'RECEIPT_RECORDED_NOT_REVERIFIED',
    snapshot:rec.snapshot,receivedAt:stamp(rec.receivedAt),stageRecorded,labRecorded,
    restoredSiteCount:labRecorded&&Array.isArray(readiness.sites)?readiness.sites.length:null,
    sqlLabRecordedCount:labRecorded?privateLabCount(path.join(lab,'lab-databases'),warnings,(x,slug)=>x.slug===slug&&x.status==='IMPORTED_LAB_ONLY'):null,
    wpPreviewPreparedCount:labRecorded?privateLabCount(path.join(lab,'previews'),warnings,(x,slug)=>x.slug===slug&&x.sourceSnapshot===rec.snapshot&&x.sourceDbCredentialsCopied===false):null,
    checksumsVerifiedNow:false,websiteLiveVerified:false,sqlLiveReplication:false};
}
export function buildClusterSummary(home=process.env.HOME||os.homedir(),now=Date.now()){
  const warnings=[];const cfg=path.join(home,'.config/mhc-full-installer');
  const id=safeJson(path.join(cfg,'node-identity.json'),warnings);
  const cluster=safeJson(path.join(cfg,'cluster.json'),warnings);
  const joined=safeJson(path.join(cfg,'joined.json'),warnings);
  const isController=!!(uuid(id?.nodeId)&&uuid(cluster?.clusterId)&&cluster.mode==='inventory-only'&&cluster.controllerNodeId===id.nodeId&&!joined);
  const member=isController?null:!!(uuid(id?.nodeId)&&uuid(joined?.clusterId)&&joined.nodeId===id.nodeId&&joined.mode==='inventory-only');
  const offers=isController?safeJson(path.join(cfg,'clone-offers.json'),warnings):null;
  const members=isController?safeJson(path.join(cfg,'members.json'),warnings):null;
  const nodes=isController?nodesForController(members,offers,now,warnings):{total:0,items:[]};
  const clone=member?localClone(home,joined,warnings):{state:'NO_LAB_CLONE',snapshot:null};
  const productionSignals=['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json']
    .some(p=>fs.existsSync(path.join(home,p)));
  if(productionSignals)warnings.push('Existing production/HA signals: TEST Cluster Panel is not an authority for live operation');
  if(isController&&nodes.total>nodes.items.length)warnings.push(`Showing ${nodes.items.length} of ${nodes.total} enrolled nodes (UI limit)`);
  const alerts=nodes.items.flatMap(n=>n.alerts.map(code=>({nodeId:n.nodeId,code})));
  return {schema:1,release:'TEST 0.5.0C-WRITER-AUDIT',generatedAt:new Date(now).toISOString(),
    mode:isController?'INVENTORY_CONTROLLER':member?'ENROLLED_MEMBER':'STANDALONE_OR_UNVERIFIED',
    node:{nodeId:uuid(id?.nodeId),label:safe(id?.label)||null,clusterId:uuid(cluster?.clusterId)||uuid(joined?.clusterId)},
    inventory:nodes,alerts:{total:alerts.length,items:alerts.slice(0,400)},backup:snapshotPointer(home,warnings,now),clone,
    capabilities:{writeFenceVerified:false,gtidReplicationVerified:false,continuousFileReplicationVerified:false,cloudflareRoutingVerified:false,
      standbyReady:false,haEligible:false,automaticFailover:false,productionNodeControl:false},
    warnings,disclaimer:'Authenticated reports are member claims observed over pinned SSH, not live polls, restored-site tests, or fresh cryptographic verification. NEVER evidence of Primary, online availability, or HA readiness.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.slice(2).join(' ')!=='status'){console.error('Usage: mhc-full cluster status  (read-only, local)');process.exitCode=2;}
  else console.log(JSON.stringify(buildClusterSummary(),null,2));
}
