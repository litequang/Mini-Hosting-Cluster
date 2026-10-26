// MHC TEST 0.4.0C3: operator-quiesced GTID/file pairing and OFFLINE versioned copy.
// NO live apply, NO database mutations, NO SSH, NO HA, NO atomic snapshot claim.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {scan,verifyBundle,copyChecked,makeParent,directory,noLinksTo,jsonRead,jsonWrite,LAB,SOURCE,REPLICA} from './file-delta-lab.mjs';
const execute=promisify(execFile);
const HOME=process.env.HOME||os.homedir(), ID=/^delta-[0-9]{13}-[a-f0-9]{10}$/;
const GTID=/^(?:[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,20})(?:,[0-9]{1,10}-[0-9]{1,10}-[0-9]{1,20})*$/;
const SCOPE='MHC_C3_QUIESCED_OFFLINE_LAB_ONLY';
const PROOF='OPERATOR_ASSERTED_QUIESCENCE_NOT_ATOMIC_SNAPSHOT';
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fail(s){throw Error(s)}
async function stat(p){return fsp.lstat(p).catch(e=>e.code==='ENOENT'?null:Promise.reject(e))}
function validateId(id){if(!ID.test(id||''))fail('Invalid delta ID')}
async function labGuard(){
 const s=await stat(LAB);if(!s||!s.isDirectory()||s.isSymbolicLink())fail('Isolated LAB root is missing or unsafe');
 const mark=path.join(HOME,'.config/mhc-full-installer/installed');const m=await stat(mark);
 if(!m||!m.isFile()||m.isSymbolicLink()||(m.mode&0o077)!==0)fail('Private installed TEST marker required');
 if(!/^TEST 0\.(3\.|4\.|5\.)/.test((await fsp.readFile(mark,'utf8')).trim()))fail('Only installed MHC TEST LAB permitted');
 for(const s of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json','.config/mhc-full-installer/install-incomplete'])
  if(await stat(path.join(HOME,s)))fail('STOP: production, cluster or incomplete-install footprint');
 // Do not even perform the offline apply on a device hosting a managed website.
 const sites=path.join(HOME,'.config/mhc-full-installer');
 for(const relative of ['static','sites']){
  const p=path.join(sites,relative);if(await stat(p)){
   const names=await fsp.readdir(p);
   if(names.some(n=>n.endsWith(relative==='static'?'.conf':'.env')))fail('STOP: registered live website; use a dedicated isolated LAB node');
  }
 }
}
async function sql(name){
 const expr=name==='read_only'?'@@global.read_only':name==='source'?'@@global.gtid_binlog_pos':'@@global.gtid_slave_pos';
 try{
  const {stdout}=await execute('mariadb',['--no-defaults','--batch','--skip-column-names','--connect-timeout=2','-e',`SELECT ${expr};`],{timeout:6000,maxBuffer:256,env:{...process.env,MYSQL_PWD:''}});
  return stdout.trim();
 }catch{fail('Local MariaDB LAB read-only query failed')}
}
async function dbState(which){const ro=await sql('read_only');if(ro!=='1')fail('MariaDB LAB must be read_only=ON and quiesced');
 const pos=await sql(which);if(!GTID.test(pos))fail('Nonempty valid MariaDB GTID required');return pos;}
const sameFiles=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function verified(id,where){const folder=path.join(LAB,where,id);await noLinksTo(folder);return verifyBundle(folder)}
async function checkpointCreate(id,confirm){
 validateId(id);if(confirm!=='--confirm=QUIESCED_LAB_ONLY')fail('Confirmation QUIESCED_LAB_ONLY required');
 await labGuard();await directory(path.join(LAB,'outbox'));
 const bundle=await verified(id,'outbox');const dest=path.join(bundle.full,'checkpoint.json');
 if(await stat(dest))fail('Checkpoint already exists, do not overwrite transferred evidence');
 const gtid1=await dbState('source');const live=await scan(SOURCE);const gtid2=await dbState('source');
 if(gtid1!==gtid2)fail('GTID changed during checkpoint; source not quiesced');
 if(!sameFiles(live.files,bundle.next.files))fail('Source files changed since delta capture; create a new bundle');
 const cp={schema:1,scope:SCOPE,deltaId:id,gtid:gtid1,bundleMetaSha256:digest(bundle.m),fileManifestSha256:digest(bundle.next.files),proof:PROOF,createdAt:new Date().toISOString()};
 await jsonWrite(dest,cp);
 return {scope:SCOPE,status:'LAB_CHECKPOINT_RECORDED_NOT_ATOMIC',id,files:live.fileCount,gtidObserved:true,operatorQuiescenceAsserted:true,atomicDatabaseFileSnapshotVerified:false,haEligible:false};
}
async function checkpointRead(id,bundle){
 const file=path.join(bundle.full,'checkpoint.json');const cp=await jsonRead(file,4096);
 if(cp.schema!==1||cp.scope!==SCOPE||cp.deltaId!==id||cp.proof!==PROOF||!GTID.test(cp.gtid)||cp.bundleMetaSha256!==digest(bundle.m)||cp.fileManifestSha256!==digest(bundle.next.files))fail('Checkpoint missing, altered or not tied to exact verified bundle');
 return cp;
}
async function receiverEvidence(id,checkpointFile){
 const p=path.join(LAB,'transport','receipts',id+'.json');
 const r=await jsonRead(p,4096);
 if(r.schema!==1||r.id!==id||r.status!=='CHECKSUM_VERIFIED_NOT_APPLIED')fail('Verified C2 receiver receipt required');
 const st=await stat(checkpointFile);if(!st||!st.isFile()||st.isSymbolicLink()||st.size>4096)fail('Invalid receiver checkpoint');
 const checksum=crypto.createHash('sha256').update(await fsp.readFile(checkpointFile)).digest('hex');
 if(r.checkpointSha256!==checksum)fail('Checkpoint changed after C2 receiver verification');
 return r;
}
async function preflight(id,{database=true}={}){
 validateId(id);await labGuard();
 const bundle=await verified(id,'inbox');await receiverEvidence(id,path.join(bundle.full,'checkpoint.json'));const cp=await checkpointRead(id,bundle);
 const candidate=path.join(LAB,'candidates',id);const actual=await scan(candidate);
 if(!sameFiles(actual.files,bundle.next.files))fail('Offline candidate differs from exact checkpoint manifest');
 const baseline=await scan(REPLICA);
 if(!sameFiles(baseline.files,bundle.base.files))fail('Replica baseline diverged after C1 stage');
 let gtid=null;
 if(database){const first=await dbState('replica');const second=await dbState('replica');
  if(first!==second||first!==cp.gtid)fail('Replica GTID does not exactly match quiesced source checkpoint');gtid=first;
 }
 return {bundle,cp,candidate,gtid};
}
async function plan(id){const {bundle}=await preflight(id);
 return {scope:SCOPE,status:'OFFLINE_APPLY_PLAN_PASS',id,files:bundle.next.fileCount,removedFromCandidate:bundle.expected.removed.length,gtidExactMatchObserved:true,liveWebsiteApply:false,databaseMutation:false,atomicDatabaseFileSnapshotVerified:false,standbyReady:false,haEligible:false,notice:'Manual quiescence assertion plus equal local GTID is NOT transactional cross-resource consistency proof.'};}
async function apply(id,confirm){if(confirm!=='--confirm=OFFLINE_LAB_APPLY')fail('Confirmation OFFLINE_LAB_APPLY required');
 const {bundle,candidate,cp,gtid}=await preflight(id);
 const applied=path.join(LAB,'applied');await directory(applied,true);
 const dest=path.join(applied,id);if(await stat(dest))fail('Applied LAB version already exists; no overwrite');
 const tmp=path.join(applied,'pending-'+id+'-'+crypto.randomBytes(5).toString('hex'));
 await fsp.mkdir(tmp,{mode:0o700});let published=false;
 try{
  for(const [rel,meta] of Object.entries(bundle.next.files)){
   await makeParent(tmp,rel);await copyChecked(path.join(candidate,rel),path.join(tmp,rel),meta);
  }
  const result=await scan(tmp);if(!sameFiles(result.files,bundle.next.files))fail('Staged LAB applied tree differs from checkpoint');
  const last=await dbState('replica');if(last!==gtid||last!==cp.gtid)fail('Replica GTID advanced during offline copy; no publish');
  const baseline=await scan(REPLICA);if(!sameFiles(baseline.files,bundle.base.files))fail('Replica base changed during offline copy');
  await fsp.rename(tmp,dest);published=true;
  const rec={schema:1,scope:SCOPE,id,status:'OFFLINE_VERSIONED_LAB_COPY_NOT_LIVE',files:result.fileCount,manifestSha256:digest(result.files),checkpointMetaSha256:cp.bundleMetaSha256,gtidMatchedAtCopy:true,operatorQuiescenceAsserted:true,atomicDatabaseFileSnapshotVerified:false,liveApply:false,haEligible:false,createdAt:new Date().toISOString()};
  await directory(path.join(LAB,'reports'),true);
  await jsonWrite(path.join(LAB,'reports',id+'-c3-offline.json'),rec);
  return {scope:SCOPE,status:rec.status,id,files:result.fileCount,removedFromOfflineVersion:bundle.expected.removed.length,liveApply:false,atomicDatabaseFileSnapshotVerified:false,haEligible:false};
 }finally{if(!published)await fsp.rm(tmp,{recursive:true,force:true}).catch(()=>{});}
}
async function status(){
 if(!(await stat(LAB)))return {scope:SCOPE,status:'NOT_CONFIGURED',offlineVersions:0,haEligible:false};
 await labGuard();const p=path.join(LAB,'applied');let versions=0;
 if(await stat(p)){await noLinksTo(p);for(const name of await fsp.readdir(p))if(ID.test(name)&&((await stat(path.join(p,name)))?.isDirectory()))versions++;}
 return {scope:SCOPE,status:'OFFLINE_LAB_ONLY',offlineVersions:versions,liveApply:false,atomicDatabaseFileSnapshotVerified:false,haEligible:false};
}
async function main(){const [cmd,...args]=process.argv.slice(2);let data;
 if(cmd==='checkpoint-create'&&args.length===2)data=await checkpointCreate(...args);
 else if(cmd==='apply-plan'&&args.length===1)data=await plan(args[0]);
 else if(cmd==='apply-offline'&&args.length===2)data=await apply(...args);
 else if(cmd==='consistent-status'&&args.length===0)data=await status();
 else fail('Usage file-sync checkpoint-create DELTA_ID --confirm=QUIESCED_LAB_ONLY | apply-plan DELTA_ID | apply-offline DELTA_ID --confirm=OFFLINE_LAB_APPLY | consistent-status');
 console.log(JSON.stringify(data,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(e=>{console.error('FILE_CONSISTENT_LAB_ERROR:',e.message);process.exitCode=1});
