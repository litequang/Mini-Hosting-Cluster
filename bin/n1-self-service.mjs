// Agent-owned, resumable management setup. Own Tunnel token only; never DNS/SQL/site data.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {sharedStatus,sharedN1Request} from './cluster-authority.mjs';import {ControlNode} from './control-node.mjs';
import {BackgroundBackoff,classifyAuthorityError} from './authority-traffic.mjs';
import {waitForSupervisor} from './new-node-install.mjs';
const home=()=>process.env.HOME||os.homedir(),fail=c=>{throw Error(c);};
function safe(root,file){let at=path.resolve(root);if(fs.lstatSync(at).isSymbolicLink())fail('N1_SETUP_SYMLINK_DENIED');const rel=path.relative(at,file);if(rel.startsWith('..')||path.isAbsolute(rel))fail('N1_SETUP_PATH_DENIED');for(const p of rel.split(path.sep)){at=path.join(at,p);if(fs.lstatSync(at,{throwIfNoEntry:false})?.isSymbolicLink())fail('N1_SETUP_SYMLINK_DENIED');}return file;}
function read(root,file,{fixture=false,json=true}={}){safe(root,file);const st=fs.lstatSync(file);if(!st.isFile()||st.size>65536||!fixture&&(st.mode&0o077))fail('N1_SETUP_PRIVATE_FILE_UNSAFE');const text=fs.readFileSync(file,'utf8');return json?JSON.parse(text):text;}
function atomic(root,file,bytes){safe(root,file);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+crypto.randomUUID()+'.tmp',fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
export function n1JoinProof({dir,clusterId,nodeId,joinSecret,fixture=false}){const root=path.dirname(path.dirname(dir)),key=read(root,path.join(dir,'node-proof-key.pem'),{json:false,fixture}),publicKey=crypto.createPublicKey(key).export({type:'spki',format:'pem'}),p={scope:'MHC_N1_ENROLLMENT',clusterId,nodeId,publicKey,joinSecret};return {publicKey,signature:crypto.sign(null,Buffer.from(JSON.stringify(p)),key).toString('base64url')};}
export function n1SelfServiceEligible(root=home()){try{const id=read(root,path.join(root,'.config/mhc-full-installer/node-identity.json'));return id.kind==='new-node-standby'&&fs.existsSync(path.join(root,'.config/mhc-full-installer/authority.json'));}catch{return false;}}
export class N1SelfService{
 constructor(o={}){this.home=o.home||home();this.prefix=o.prefix||process.env.PREFIX;this.fixture=o.fixture===true;this.now=o.now||Date.now;this.status=o.status||(()=>sharedStatus('agent'));this.request=o.request||sharedN1Request;this.execute=o.execute||((c,a)=>spawnSync(c,a,{encoding:'utf8',timeout:15000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}));this.proof=o.proof||((nonce)=>new ControlNode().proof(nonce));this.config=path.join(this.home,'.config/mhc-full-installer');this.stateFile=path.join(this.home,'.local/state/mhc-n1-self-service/state.json');}
 gate(){if(!this.fixture&&(this.prefix!=='/data/data/com.termux/files/usr'||!['android','linux'].includes(process.platform)))fail('N1_SETUP_TERMUX_REQUIRED');for(const p of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/node.json','.config/mini-hosting-cluster/ha.json'])if(fs.existsSync(path.join(this.home,p)))fail('N1_SETUP_PRODUCTION_DENIED');const id=read(this.home,path.join(this.config,'node-identity.json'),{fixture:this.fixture}),progress=read(this.home,path.join(this.home,'.local/state/mhc-new-node-install/progress.json'),{fixture:this.fixture});if(id.kind!=='new-node-standby'||progress.phase!=='INSTALLED'||progress.nodeId!==id.nodeId)fail('N1_SETUP_COMPLETED_INSTALL_REQUIRED');return id;}
 run(command,args){const r=this.execute(command,args);if(r.status!==0||r.error)fail('N1_SETUP_SERVICE_FAILED');return r.stdout||'';}
 async configure(value,state){
  const own=this.gate(),authority=read(this.home,path.join(this.config,'authority.json'),{fixture:this.fixture}),pub=read(this.home,path.join(this.config,'node-proof-key.pub'),{fixture:this.fixture,json:false});
  if(value.publicKey!==pub||value.origin?.schema!==1||value.origin.hostname!=='panel-lab.giaouoc.com'||!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(value.origin.teamDomain||'')||!/^[A-Za-z0-9_-]{32,128}$/.test(value.origin.audience||'')||!/^[a-f0-9-]{36}$/.test(value.tunnelId||'')||typeof value.tunnelToken!=='string'||!/^[A-Za-z0-9_=+\/-]{30,8192}$/.test(value.tunnelToken))fail('N1_SETUP_REPLY_INVALID');
  if(state.tunnelId&&state.tunnelId!==value.tunnelId)fail('N1_SETUP_TUNNEL_PIN_CHANGED');
  const token=path.join(this.config,'cloudflare-lab/tunnel-token'),remote=path.join(this.home,'android-hosting-panel/data/remote-access.json'),self=path.join(this.config,'control-self-service.json');
  for(const p of [token,remote,self]){safe(this.home,p);if(fs.existsSync(p))read(this.home,p,{fixture:this.fixture,json:p!==token});}
  // Refuse replacing manual/foreign configuration. An existing approved token must match byte-for-byte.
  if(fs.existsSync(token)){if(fs.readFileSync(token,'utf8').trim()!==value.tunnelToken)fail('N1_SETUP_EXISTING_TUNNEL_TOKEN_DIFFERS');}
  else atomic(this.home,token,value.tunnelToken+'\n');
  const existing=fs.existsSync(remote)?read(this.home,remote,{fixture:this.fixture}):null;
  if(existing&&!([existing,...existing.applications||[]].some(a=>a.hostname===value.origin.hostname&&a.teamDomain===value.origin.teamDomain&&a.audience===value.origin.audience)))fail('N1_SETUP_EXISTING_ACCESS_CONFIG_DIFFERS');
  if(!existing){state.restartPanel=true;this.save(state);atomic(this.home,remote,JSON.stringify(value.origin)+'\n');}
  const cfg={schema:1,enabled:true,transport:'authority',keyFlavor:'N1',nodeId:own.nodeId,clusterId:authority.clusterId,publicKey:pub};
  if(fs.existsSync(self)&&JSON.stringify(read(this.home,self,{fixture:this.fixture}))!==JSON.stringify(cfg))fail('N1_SETUP_EXISTING_CONTROL_PIN_DIFFERS');
  if(!fs.existsSync(self))atomic(this.home,self,JSON.stringify(cfg)+'\n');
  const service=path.join(this.prefix,'var/service/mhc-panel-tunnel');safe(this.prefix,service);
  const expectedRun='#!/data/data/com.termux/files/usr/bin/sh\nexec 2>&1\nexec /data/data/com.termux/files/usr/bin/cloudflared tunnel --no-autoupdate run --token-file "$HOME/.config/mhc-full-installer/cloudflare-lab/tunnel-token"\n';
  if(!fs.existsSync(service)){this.run(path.join(this.prefix,'bin/bash'),[path.join(this.home,'.local/share/mhc-full-installer/bin/panel-tunnel-service.sh'),'install','--confirm=INSTALL_LAB_PANEL_TUNNEL']);}
  else if(read(this.prefix,path.join(service,'run'),{fixture:true,json:false})!==expectedRun)fail('N1_SETUP_EXISTING_SERVICE_DIFFERS');
  if(!this.fixture)await waitForSupervisor([path.join(service,'supervise/ok')]);
  this.run(path.join(this.prefix,'bin/sv-enable'),['mhc-panel-tunnel']);this.run(path.join(this.prefix,'bin/sv'),['up',service]);
  if(state.restartPanel){this.run(path.join(this.prefix,'bin/sv'),['restart',path.join(this.prefix,'var/service/amh-panel')]);state.restartPanel=false;}
 }
 save(state){atomic(this.home,this.stateFile,JSON.stringify(state)+'\n');}
 async tick(observed=null){
  const own=this.gate();let state=fs.existsSync(this.stateFile)?read(this.home,this.stateFile,{fixture:this.fixture}):{schema:1,nodeId:own.nodeId,phase:'JOINED',lastProvisionAt:0,errorCode:null};
  if(state.schema!==1||state.nodeId!==own.nodeId)fail('N1_SETUP_STATE_INVALID');
  if(state.retryAfter&&state.retryAfter>this.now())return {phase:state.phase,errorCode:state.errorCode,writerGranted:false};
  try{
  const shared=observed||await this.status();if(shared.n1Enabled!==true)return {enabled:false};
  if(shared.trafficProtocol===1&&state.lastProvisionAt&&this.now()-state.lastProvisionAt<45000)return {phase:state.phase,tunnelId:state.tunnelId,writerGranted:false};
   if(!state.lastProvisionAt||this.now()-state.lastProvisionAt>=45000){
    const reply=await this.request('n1-provision'),v=reply.n1;if(!v)fail('N1_SETUP_REPLY_INVALID');
    await this.configure(v,state);state={...state,phase:v.phase,tunnelId:v.tunnelId,lastProvisionAt:this.now(),retryAfter:null,failures:0,errorCode:null};this.save(state);
   }
   if(state.phase==='CONTROL_REGISTERED'&&shared.trafficProtocol!==1){
    const envelope=await this.proof(crypto.randomBytes(32).toString('hex'));
    await this.request('n1-publish',{envelope});state.lastProofAt=this.now();state.errorCode=null;this.save(state);
   }
   return {phase:state.phase,tunnelId:state.tunnelId,writerGranted:false};
  }catch(e){const backoff=new BackgroundBackoff({base:5000,now:this.now});backoff.failures=Math.min(state.failures||0,8);backoff.failure(e);state.failures=backoff.failures;const code=/^((AUTHORITY_)?N1_|CONTROL_)[A-Z0-9_]+$/.test(e.message)?e.message:'N1_SETUP_AUTHORITY_'+classifyAuthorityError(e).toUpperCase();state.errorCode=code;state.retryAfter=Math.max(backoff.nextAt,this.now()+(/PERMISSION|SETUP_|PROVISION_IN_PROGRESS/.test(code)?45000:5000));this.save(state);throw Error(code);}
 }
}
let reconciler;export async function n1Reconcile(observed=null){reconciler ||=new N1SelfService();return reconciler.tick(observed);}
export async function n1ControlEnvelope(nodeId){
 const state=await sharedStatus();
 if(state.trafficProtocol===1){const {siteManualEnvelope}=await import('./site-standby.mjs');return siteManualEnvelope(nodeId,{action:'control-ready',nodeId,nonce:crypto.randomBytes(32).toString('hex'),requestId:crypto.randomUUID(),epoch:state.p33.epoch,revision:state.p33.revision,operationId:state.p33.operationId});}
for(let i=0;i<4;i++){try{const r=await sharedN1Request('n1-control-proof',{targetNodeId:nodeId});if(!r.n1?.envelope||!r.n1.publicKey)fail('N1_CONTROL_PROOF_PENDING');return r.n1;}catch(e){if(i===3||!/^AUTHORITY_(N1_CONTROL_PROOF_PENDING|CONTROL_PROOF_STALE_OR_MISMATCH)$/.test(e.message))throw e;await new Promise(r=>setTimeout(r,2000));}}}
