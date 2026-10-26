// MHC TEST 0.5.0B5 - REAL loopback HTTP request path, ISOLATED LAB fixtures ONLY.
// This does NOT guard Nginx, PHP, SQL, real uploads, backups, shell or HA.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {assertIsolatedLab, writeLabArtifact} from './write-path-gate-lab.mjs';
import {writeLabDb} from './lab-app-database-gate.mjs';

const HOME=process.env.HOME||os.homedir();
const CONFIG_DIR=path.join(HOME,'.config/mhc-lab-http-write-gate');
const SECRET=path.join(CONFIG_DIR,'http-token');
const CONFIRM='--confirm=ISOLATED_HTTP_WRITE_GATE_LAB_ONLY';
const SCOPE='ISOLATED_LOOPBACK_HTTP_WRITE_GATE_LAB_ONLY';
const PORT=19096;
const MAX=Object.freeze({canary:65536,preview:65536,upload:262144,job:8192});
const ROUTES=Object.freeze({'/v1/lab/canary':'canary','/v1/lab/preview':'preview',
 '/v1/lab/upload-fixture':'upload','/v1/lab/job-receipt':'job'});
const fail=(message)=>{throw new Error(message)};
function checkPrivateDirectory(dir){
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077) || (process.getuid&&st.uid!==process.getuid()))fail('UNSAFE_HTTP_GATE_CONFIG_DIRECTORY');
}
function tokenFromDisk(){
 checkPrivateDirectory(CONFIG_DIR);
 const st=fs.lstatSync(SECRET);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)||st.size<48||st.size>128||(process.getuid&&st.uid!==process.getuid()))fail('UNSAFE_HTTP_GATE_AUTH_TOKEN');
 const token=fs.readFileSync(SECRET,'utf8').trim();
 if(!/^[a-f0-9]{64}$/.test(token))fail('INVALID_HTTP_GATE_AUTH_TOKEN');
 return token;
}
function setup(){
 assertIsolatedLab();
 if(fs.existsSync(CONFIG_DIR))fail('HTTP_GATE_ALREADY_INITIALIZED');
 fs.mkdirSync(CONFIG_DIR,{recursive:false,mode:0o700});
 try{
  const fd=fs.openSync(SECRET,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
  try{fs.writeSync(fd,crypto.randomBytes(32).toString('hex')+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  tokenFromDisk();
 }catch(e){fs.rmSync(CONFIG_DIR,{force:true,recursive:true});throw e}
 return {status:'HTTP_GATE_INITIALIZED_LAB_ONLY',address:'127.0.0.1',port:PORT,secretFile:SECRET,secretExposed:false,haEligible:false};
}
function constantTimeTokenEqual(received,expected){
 if(typeof received!=='string'||!received.startsWith('Bearer '))return false;
 const actual=received.slice(7);
 if(actual.length!==expected.length||!/^[a-f0-9]{64}$/.test(actual))return false;
 return crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
}
function respond(res,code,message,fields={}){
 res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'no-referrer','Connection':'close'});
 res.end(JSON.stringify({scope:SCOPE,status:message,haEligible:false,productionProtected:false,...fields}));
}
async function readPayload(req,limit){
 const chunks=[];let size=0;
 for await(const buf of req){
  size+=buf.length;
  if(size>limit)fail('REQUEST_TOO_LARGE');
  chunks.push(buf);
 }
 if(!req.complete||size<1)fail('INCOMPLETE_OR_EMPTY_REQUEST');
 return Buffer.concat(chunks,size);
}
export function createLabHttpServer({check=undefined,executeSql=undefined}={}){
 // Even unit tests must initialize the real isolated LAB directory and local auth token.
 assertIsolatedLab();tokenFromDisk();
 let inFlight=false;
 const server=http.createServer(async(req,res)=>{
  // No CORS, no public interface, no browser-origin access, no arbitrary paths.
  if(!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){
   respond(res,403,'LOOPBACK_REQUIRED');return;
  }
  try{assertIsolatedLab();}
  catch{respond(res,503,'LAB_SAFETY_PREFLIGHT_DENIED');return}
  let expected;
  try{expected=tokenFromDisk()}catch{respond(res,503,'AUTH_CONFIGURATION_UNAVAILABLE');return}
  if(!constantTimeTokenEqual(req.headers.authorization,expected)){
   respond(res,401,'UNAUTHORIZED');return;
  }
  if(req.headers.origin || req.headers['access-control-request-method']){
   respond(res,403,'BROWSER_ORIGIN_DENIED');return;
  }
  if(req.method==='GET' && req.url==='/v1/lab/health'){
   respond(res,200,'LAB_HTTP_ALIVE',{witnessVerifiedNow:false,realHostingProtected:false});return;
  }
  if(req.method!=='POST'){
   respond(res,405,'METHOD_NOT_ALLOWED');return;
  }
  const dbEndpoint=req.url==='/v1/lab/mariadb-event';
  const kind=dbEndpoint?'database':ROUTES[req.url];
  if(!kind){respond(res,404,'LAB_ROUTE_NOT_FOUND');return}
  if(inFlight){respond(res,409,'LAB_WRITER_BUSY');return}
  const type=req.headers['content-type'];
  const length=req.headers['content-length'];
  if(type!==(dbEndpoint?'application/json':'application/octet-stream')||req.headers['transfer-encoding']||!/^\d+$/.test(String(length||''))){
   respond(res,400,'INVALID_REQUEST_HEADERS');return;
  }
  const bytes=Number(length);
  if(!Number.isSafeInteger(bytes)||bytes<1||bytes>(dbEndpoint?2048:MAX[kind])){
   respond(res,413,'LAB_BODY_SIZE_INVALID');return;
  }
  inFlight=true;
  try{
   const body=await readPayload(req,dbEndpoint?2048:MAX[kind]);
   if(body.length!==bytes)fail('CONTENT_LENGTH_MISMATCH');
   // The real request path now calls the same witness-gated filesystem writer.
   if(dbEndpoint){
    const opts={check};if(executeSql!==undefined)opts.execute=executeSql;
    const r=await writeLabDb(body,opts);
    respond(res,201,'DEDICATED_MARIADB_LAB_EVENT_INSERTED',{kind,requestId:r.requestId,
     sha256:r.payloadSha256,epoch:r.epoch,witnessCheckedForThisWrite:true,
     atomicWitnessAndSql:false});
   }else{
    const result=await writeLabArtifact(kind,body,{check});
    respond(res,201,'ISOLATED_LAB_ARTIFACT_PUBLISHED',{kind,bytes:result.bytes,sha256:result.sha256,
     epoch:result.epoch,receiptId:result.id,witnessCheckedForThisWrite:true});
   }
  }catch(e){
   const badBody=/REQUEST_TOO_LARGE|INCOMPLETE_OR_EMPTY|CONTENT_LENGTH_MISMATCH/.test(e.message);
   respond(res,badBody?400:503,badBody?'INVALID_LAB_BODY':'WITNESS_OR_LAB_WRITE_DENIED');
  }finally{inFlight=false}
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
 server.maxHeadersCount=32;server.maxRequestsPerSocket=20;
 return server;
}
export async function main(args=process.argv.slice(2)){
 const command=args[0];
 if(command==='plan'&&args.length===1)return {scope:SCOPE,interface:'127.0.0.1',port:PORT,authorization:'Bearer token from private local file',
  paths:[...Object.keys(ROUTES),'/v1/lab/mariadb-event'],witnessChecksPerWrite:2,productionProtected:false,haEligible:false,
  notice:'Four fixture paths plus one isolated dedicated MariaDB LAB app endpoint. NO existing PHP/Nginx/production DB SQL session guarded. No daemon installed.'};
 if(command==='status'&&args.length===1)return {scope:SCOPE,configured:fs.existsSync(CONFIG_DIR)&&fs.existsSync(SECRET),
  runningVerifiedNow:false,leaseVerifiedNow:false,productionProtected:false,haEligible:false};
 if(command==='init'&&args.length===2&&args[1]===CONFIRM)return setup();
 if(command==='serve'&&args.length===2&&args[1]===CONFIRM){
  const server=createLabHttpServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,'127.0.0.1',resolve)});
  console.log(JSON.stringify({scope:SCOPE,status:'LAB_HTTP_LISTENING',address:'127.0.0.1',port:PORT,
   productionProtected:false,haEligible:false}));
  return {status:'LAB_HTTP_LISTENING',server};
 }
 fail('Usage: mhc-full http-gate plan|status|init '+CONFIRM+'|serve '+CONFIRM);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 main().then(r=>{if(r.status!=='LAB_HTTP_LISTENING')console.log(JSON.stringify(r,null,2));})
 .catch(e=>{console.error('LAB_HTTP_GATE_DENIED:',e.message);process.exitCode=1});
}
