// MHC TEST 0.5.0B5 — witness-gated isolated LAB artifact writer adapters.
// Canary + offline static preview + fake upload fixture + offline job receipt.
// Not for real hosting, PHP, SQL, Sheet/uploads, or HA fencing.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadConfiguration,witnessRequest} from './lease-witness-lab.mjs';
const HOME=process.env.HOME||os.homedir();
const ROOT=path.join(HOME,'mhc-writegate-lab');
const CANARY=path.join(ROOT,'canaries');
const STATE=path.join(ROOT,'audit.jsonl');
const ADAPTERS=Object.freeze({
 canary:{subdir:'canaries',max:65536,extension:'.bin',status:'LAB_CANARY_WRITTEN'},
 preview:{subdir:'static-preview',max:65536,extension:'.html',status:'LAB_PREVIEW_WRITTEN'},
 upload:{subdir:'upload-fixtures',max:262144,extension:'.bin',status:'LAB_UPLOAD_FIXTURE_WRITTEN'},
 job:{subdir:'job-receipts',max:8192,extension:'.json',status:'LAB_JOB_RECEIPT_WRITTEN'}
});
const WRITE_CONFIRM='--confirm=ISOLATED_LAB_WRITE_ONLY';

const SCOPE='MHC_ISOLATED_WRITE_GATE_FIXTURES_ONLY';
const CONFIRM='--confirm=ISOLATED_CANARY_WRITE_ONLY';
const BLOCKED=[path.join(HOME,'apps/thophuongpro/.env'),path.join(HOME,'.config/mini-hosting-cluster/ha.json'),path.join(HOME,'.config/mini-hosting-cluster/node.json')];
export const coverage=Object.freeze([
 {path:'isolated_canary_files',gate:'ENFORCED_LAB_ONLY',readOnly:false},
 {path:'isolated_static_preview_files',gate:'ENFORCED_LAB_ONLY',readOnly:false},
 {path:'isolated_upload_fixtures',gate:'ENFORCED_LAB_ONLY',readOnly:false},
 {path:'isolated_job_receipts',gate:'ENFORCED_LAB_ONLY',readOnly:false},
 {path:'isolated_loopback_http_fixture_gateway',gate:'ENFORCED_LAB_ONLY',readOnly:false},
 {path:'http_nginx_ingress',gate:'NOT_ENFORCED',readOnly:false},
 {path:'wordpress_php_application',gate:'NOT_ENFORCED',readOnly:false},
 {path:'mariadb_sql_sessions',gate:'NOT_ENFORCED',readOnly:false},
 {path:'site_uploads_and_sheet_files',gate:'NOT_ENFORCED',readOnly:false},
 {path:'hosting_panel_write_apis',gate:'NOT_ENFORCED',readOnly:false},
 {path:'background_jobs_and_cron',gate:'NOT_ENFORCED',readOnly:false},
 {path:'ssh_and_local_shell_writers',gate:'NOT_ENFORCED',readOnly:false},
 {path:'backup_restore_and_replica_apply',gate:'NOT_ENFORCED',readOnly:false},
 {path:'cloudflare_routes',gate:'NOT_ENFORCED',readOnly:false}
]);
const fail=(m)=>{throw new Error(m)};
function checkLabMachine(){
 if(BLOCKED.some(fs.existsSync))fail('PRODUCTION_OR_HA_BLOCKED');
 // Mere presence of a registration folder is intentional stop, as in witness B2.
 for(const folder of ['static','sites'])if(fs.existsSync(path.join(HOME,'.config/mhc-full-installer',folder)))fail('HOSTED_SITE_BLOCKED');
}
function privateDir(p){
 const st=fs.lstatSync(p);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))fail('UNSAFE_CANARY_DIRECTORY');
 if(typeof process.getuid==='function'&&st.uid!==process.getuid())fail('FOREIGN_CANARY_DIRECTORY');
 return st;
}
function existingLab(){
 privateDir(ROOT);
 for(const {subdir} of Object.values(ADAPTERS))privateDir(path.join(ROOT,subdir));
}
export function assertIsolatedLab(){checkLabMachine();existingLab();}
function validateWriterDirectory(dir,stagedName=null){
 privateDir(dir);
 const entries=fs.readdirSync(dir);
 if(entries.length>=25)fail('LAB_ARTIFACT_QUOTA_REACHED');
 for(const name of entries){
  if(name===stagedName)continue;
  if(!/^lab-[0-9a-f]{24}\.(bin|html|json)$/.test(name))fail('UNEXPECTED_LAB_ARTIFACT');
  const st=fs.lstatSync(path.join(dir,name));
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077))fail('UNSAFE_LAB_ARTIFACT');
 }
}

function canaryRootAbsent(){if(fs.existsSync(ROOT))fail('CANARY_LAB_ALREADY_EXISTS');}
function safeInit(){
 checkLabMachine();canaryRootAbsent();
 fs.mkdirSync(ROOT,{mode:0o700});
 try{for(const {subdir} of Object.values(ADAPTERS))fs.mkdirSync(path.join(ROOT,subdir),{mode:0o700});existingLab();}catch(e){fs.rmSync(ROOT,{recursive:true,force:true});throw e;}
}
async function gate(check=undefined){
 const cfg=loadConfiguration();
 const tokenDir=path.join(HOME,'.config/mhc-witness-lab');
 privateDir(tokenDir);
 const tokenFile=path.join(tokenDir,'node-token');
 const st=fs.lstatSync(tokenFile);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size<32||st.size>512)fail('UNSAFE_NODE_SECRET');
 const token=fs.readFileSync(tokenFile,'utf8').trim();
 if(token.length<32||/\s/.test(token))fail('INVALID_NODE_SECRET');
 const x=await witnessRequest(cfg,'verify',token,undefined,false,check||fetch);
 if(x.status!=='OBSERVED'||x.labGatePass!==true||x.phase!=='LEASED'||!Number.isSafeInteger(x.epoch)||x.epoch<1||x.validForMs<3000||x.validForMs>12000)fail('WITNESS_WRITE_DENIED_FAIL_CLOSED');
 return x;
}
export async function verifyLabLease(check=undefined){
 checkLabMachine();existingLab();return gate(check);
}
function noFollow(){return fs.constants.O_NOFOLLOW||0;}
function safeAudit(entry){
 // Local diagnostic only; an audit file is not a consensus proof of fencing.
 const fd=fs.openSync(STATE,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_APPEND|noFollow(),0o600);
 try{fs.writeSync(fd,JSON.stringify(entry)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function readAuditCount(){
 try{const st=fs.lstatSync(STATE);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))return null;
  const data=fs.readFileSync(STATE,'utf8');if(data.length>1048576)return null;
  return data.split('\n').filter(Boolean).length;
 }catch{return 0;}
}
// One guarded writer for a small, fixed allowlist of offline LAB artifacts.
// No dynamic path, delete, append, user-selected filename, service restart or DB write.
export async function writeLabArtifact(kind,data,{check=undefined}={}){
 const spec=ADAPTERS[kind];if(!spec)fail('UNKNOWN_LAB_WRITE_ADAPTER');
 checkLabMachine();existingLab();
 if(!Buffer.isBuffer(data)||data.length<1||data.length>spec.max)fail('LAB_DATA_SIZE_INVALID');
 const dir=path.join(ROOT,spec.subdir);
 validateWriterDirectory(dir);
 const g1=await gate(check); // fail before creating even a temporary artifact
 checkLabMachine();existingLab();validateWriterDirectory(dir);
 const id='lab-'+crypto.randomBytes(12).toString('hex')+spec.extension;
 const tmp=path.join(dir,'.'+id+'.tmp');const dest=path.join(dir,id);
 let pending=false;
 try{
  const fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|noFollow(),0o600);pending=true;
  try{fs.writeSync(fd,data,0,data.length,0);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const g2=await gate(check);
  if(g1.epoch!==g2.epoch)fail('WITNESS_EPOCH_CHANGED_FAIL_CLOSED');
  checkLabMachine();existingLab();
  // Do not treat double verification as real fencing or an atomic lease check.
  // After this check there are NO await boundaries before publication.
  validateWriterDirectory(dir,path.basename(tmp));
  if(fs.existsSync(dest))fail('LAB_DESTINATION_EXISTS');
  fs.renameSync(tmp,dest);pending=false;
  const sha256=crypto.createHash('sha256').update(data).digest('hex');
  try{safeAudit({schema:2,event:'OFFLINE_LAB_ARTIFACT',kind,at:new Date().toISOString(),epoch:g2.epoch,bytes:data.length,sha256,id});}
  catch{fail('LAB_PUBLISHED_AUDIT_FAILED_MANUAL_REVIEW');}
  return {status:spec.status,kind,bytes:data.length,epoch:g2.epoch,sha256,id,productionProtected:false,haEligible:false};
 }finally{if(pending)try{fs.unlinkSync(tmp);}catch{}}
}
export async function writeCanary(data,options={}){return writeLabArtifact('canary',data,options);}
function readLimitedStdin(max){const b=Buffer.alloc(max+1);let total=0;while(total<b.length){const n=fs.readSync(0,b,total,b.length-total,null);if(!n)break;total+=n;}if(total>max||total===0)fail('LAB_DATA_SIZE_INVALID');return b.subarray(0,total);}
export async function main(args=process.argv.slice(2),{check=undefined,input=undefined}={}){
 const command=args[0];
 if(command==='plan'&&args.length===1)return {scope:SCOPE,writePaths:coverage,labOnly:true,haEligible:false,productionProtected:false,notice:'ONLY four isolated fixture types and their loopback HTTP gateway are guarded. Real HTTP, PHP, MariaDB, uploads, hosting Panel, jobs, shell and backup write paths remain unguarded.'};
 if(command==='status'&&args.length===1)return {scope:SCOPE,initialized:fs.existsSync(ROOT)&&Object.values(ADAPTERS).every(x=>fs.existsSync(path.join(ROOT,x.subdir))),localAuditLines:fs.existsSync(ROOT)?readAuditCount():0,successfulCanaryWrites:fs.existsSync(ROOT)?readAuditCount():0,haEligible:false,productionProtected:false,witnessVerifiedNow:false};
 if(command==='init'&&args.length===2&&args[1]===CONFIRM){safeInit();return {scope:SCOPE,status:'CANARY_LAB_INITIALIZED',productionProtected:false,haEligible:false};}
 if(command==='canary-write'&&args.length===2&&args[1]===CONFIRM){
  const bytes=input??readLimitedStdin(ADAPTERS.canary.max);return {scope:SCOPE,...await writeCanary(bytes,{check})};
 }
 const cmdKind={'preview-write':'preview','upload-fixture':'upload','job-receipt':'job'}[command];
 if(cmdKind&&args.length===2&&args[1]===WRITE_CONFIRM){
  const bytes=input??readLimitedStdin(ADAPTERS[cmdKind].max);
  return {scope:SCOPE,...await writeLabArtifact(cmdKind,bytes,{check})};
 }
 fail('Usage: mhc-full write-gate plan|status|init '+CONFIRM+'|canary-write '+CONFIRM+'|preview-write|upload-fixture|job-receipt '+WRITE_CONFIRM+' (stdin, isolated LAB fixtures ONLY)');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error('WRITE_GATE_LAB_DENIED:',e.message);process.exitCode=1});
