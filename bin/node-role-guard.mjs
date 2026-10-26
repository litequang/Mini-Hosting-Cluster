#!/usr/bin/env node
// MHC TEST 0.5C: opt-in node-side LAB service demotion guard.
// NEVER interpreted as atomic database fencing, proof of routing, or production HA lease.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const HOME=process.env.HOME||os.homedir();
const ROOT=path.join(HOME,'.config/mhc-full-installer');
const DIR=path.join(ROOT,'node-role-guard');
const CFG=path.join(DIR,'armed.json');
const OBS=path.join(DIR,'last-check.json');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST=/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const USER=/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const SERVICE=/^(?:mhc-lab-[a-z0-9-]{1,40}|nginx|php-fpm|mariadb|mysqld|mhc-full-wp-nginx|mhc-full-wp-php|mini-web)$/;
// A shared tunnel can carry Panel/agent traffic. Never demote management ingress.
export function guardedServices(services){
 if(!Array.isArray(services)||services.length<1||services.length>6||new Set(services).size!==services.length||services.some(s=>s!=='named-tunnel'&&!SERVICE.test(s)))fail('Invalid guarded service list');
 return services.filter(s=>s!=='named-tunnel');
}
const fail=m=>{throw Error(m);};
function read(p,optional=false){
 try{const st=fs.lstatSync(p);if(st.isSymbolicLink()||!st.isFile()||(st.mode&0o077)||st.size>65536)fail('Unsafe private role metadata');return JSON.parse(fs.readFileSync(p,'utf8'));}
 catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}
}
function write(p,v){const tmp=p+'.'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});try{fs.renameSync(tmp,p)}catch(e){fs.rmSync(tmp,{force:true});throw e;}}
function base(){const st=fs.lstatSync(ROOT);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))fail('Unsafe node config');const i=read(path.join(ROOT,'node-identity.json')),j=read(path.join(ROOT,'joined.json')),a=read(path.join(ROOT,'node-auth.json'));
 if(!UUID.test(i?.nodeId||'')||!UUID.test(j?.clusterId||'')||!UUID.test(j?.controllerNodeId||'')||a?.nodeId!==i.nodeId||!TOKEN.test(a?.token||''))fail('Node must be enrolled with valid SSH credentials');
 const {host,user,port}=j.controllerSSH||{};
 if(!HOST.test(host||'')||!USER.test(user||'')||!Number.isInteger(port)||port<1||port>65535)fail('Invalid controller SSH endpoint');
 return {nodeId:i.nodeId,clusterId:j.clusterId,controllerNodeId:j.controllerNodeId,host,user,port,token:a.token};
}
function safety(){
 for(const p of ['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'])if(fs.existsSync(path.join(HOME,p)))fail('Production/HA footprint blocks LAB node guard');
 const marker=fs.readFileSync(path.join(ROOT,'installed'),'utf8').trim();
 if(!/^TEST 0\.5\.0C-(?:AUTO-PRIMARY-LAB|ROUTE-RECOVERY|REMOTE-PANEL) installed on clean Termux$/.test(marker))fail('Node guard requires known TEST source version');
}
function guardDir(){fs.mkdirSync(DIR,{recursive:true,mode:0o700});const st=fs.lstatSync(DIR);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))fail('Unsafe guard directory');}
export function allowWriteReply(response,expected){return response?.ok===true&&response.protocol==='mhc-full-enroll-v1'&&response.nodeId===expected.nodeId&&response.clusterId===expected.clusterId&&response.controllerNodeId===expected.controllerNodeId&&response.nonce===expected.nonce&&response.role==='PRIMARY_RECORDED_ONLY';}
function inquire(b){const nonce=crypto.randomBytes(16).toString('hex');const req={protocol:'mhc-full-enroll-v1',nodeId:b.nodeId,token:b.token,nonce};
 const args=['-T','-p',String(b.port),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','ConnectTimeout=5','-o','ServerAliveInterval=3','-o','ServerAliveCountMax=1',`${b.user}@${b.host}`,'~/mhc-full node role-accept'];
 const result=spawnSync('ssh',args,{input:JSON.stringify(req)+'\n',encoding:'utf8',timeout:11000,maxBuffer:8192});
 if(result.error||result.status!==0)fail('Authenticated controller role inquiry unavailable');
 let reply;try{reply=JSON.parse(result.stdout.trim());}catch{fail('Invalid controller role reply');}
 if(reply?.nodeId!==b.nodeId||reply?.nonce!==nonce||reply?.controllerNodeId!==b.controllerNodeId||reply?.clusterId!==b.clusterId||reply?.protocol!=='mhc-full-enroll-v1'||reply.ok!==true)fail('Controller identity/nonce mismatch');
 return {reply,nonce};
}
export function stopServices(services,runner=spawnSync){const failed=[];
 for(const name of guardedServices(services)){
  try{const r=runner('sv',['down',name],{encoding:'utf8',timeout:6000,maxBuffer:2048});if(r.error||r.status!==0)failed.push(name);}catch{failed.push(name);}
 }
 if(failed.length)fail('Could not stop guarded LAB services: '+failed.join(', '));
}
export function decide(allowed,services){return {role:allowed?'RECORDED_PRIMARY_OBSERVED':'STANDBY_OR_UNREACHABLE',
 serviceAction:allowed?'NO_AUTO_START':'STOP_DECLARED_SERVICES',servicesStopped:allowed?[]:services,writerFencingProven:false};}
function check(){safety();const cfg=read(CFG);if(cfg?.schema!==1||cfg.armed!==true)fail('Guard not safely armed');
 const services=guardedServices(cfg.services);
 let allowed=false,reason='CONTROLLER_UNREACHABLE_OR_INVALID';
 let nodeId=null;
 try{
  if(fs.lstatSync(path.join(ROOT,'authority.json'),{throwIfNoEntry:false}))reason='SHARED_AUTHORITY_NO_WRITER_ACTIVATION';
  else{const b=base();nodeId=b.nodeId;const {reply,nonce}=inquire(b);allowed=allowWriteReply(reply,{...b,nonce});reason=reply.role==='PRIMARY_RECORDED_ONLY'?'CONTROLLER_PRIMARY_RECORDED':'CONTROLLER_STANDBY_OR_UNVERIFIED';}
 }
 catch{} // communication failure is fail-closed, never permission to start.
 // A node previously demoted is NEVER automatically restarted after a role changes.
 const verdict=decide(allowed,services);let stopError;
 if(!allowed&&services.length)try{stopServices(services);}catch(e){stopError=e;}
 guardDir();write(OBS,{schema:1,at:new Date().toISOString(),nodeId,reason:stopError?'SERVICE_STOP_FAILED':reason,allowed,servicesStopped:stopError?[]:verdict.servicesStopped,
  note:'Best-effort stop of configured services only. Not independent fencing of privileged/direct writers.'});if(stopError)throw stopError;return verdict;
}
function arm(args){const [list,confirm]=args;if(confirm!=='--confirm=ARM_LAB_SERVICE_GUARD' || !list)fail('Explicit opt-in and comma-separated services required');
 safety();base();if(fs.existsSync(path.join(ROOT,'sites'))&&fs.readdirSync(path.join(ROOT,'sites')).length||fs.existsSync(path.join(ROOT,'static'))&&fs.readdirSync(path.join(ROOT,'static')).length)fail('Registered site exists. Do not arm on an actively serving phone');
 const services=list.split(',');if(services.length<1||services.length>6||new Set(services).size!==services.length||services.some(s=>!SERVICE.test(s)))fail('Invalid or duplicated service name');
 guardDir();if(fs.existsSync(CFG))fail('Already armed; manually disarm after reviewing service state');write(CFG,{schema:1,armed:true,services,at:new Date().toISOString()});
 return {armed:true,services,notice:'Run check immediately. Any unavailable controller causes service shutdown; this does not manage other writers.'};}
function status(){const cfg=read(CFG,true),ob=read(OBS,true);return {armed:cfg?.armed===true,services:cfg?.services||[],lastCheck:ob?{at:ob.at,reason:ob.reason,allowed:ob.allowed,servicesStopped:ob.servicesStopped}:null,
 guarantee:'ONLY explicitly declared runit services can be stopped. No independent fencing or MariaDB privileged write lock.'};}
export async function main(args){const [cmd,...rest]=args;
 switch(cmd){case 'plan':return {scope:'ANDROID_TEST_STANDBY_DEMOTION',configuration:'Enrolled node + pinned SSH host key + armed runit services',
 behavior:'Every check asks controller for its signed-over-SSH recorded role; if standby/unreachable, sv down each opted-in service. Never sv up automatically.',
 WARNING:'Controller recorded role is not a lease. Process crash, disabled watchdog, privileged DB writers and direct IP remain unprotected.'};
 case 'status':return status();case 'arm':return arm(rest);case 'check':return check();
 case 'service-install':{if(rest.length!==1||rest[0]!=='--confirm=INSTALL_LAB_ROLE_GUARD')fail('Explicit service installation confirmation required');safety();base();if(read(CFG)?.armed!==true)fail('Arm first');
  const prefix=process.env.PREFIX||'/data/data/com.termux/files/usr';if(prefix!=='/data/data/com.termux/files/usr')fail('Termux-only runit service');
  const dir=path.join(prefix,'var/service/mhc-node-role-guard');if(fs.existsSync(dir))fail('Existing runit guard; inspect it manually');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});const script='#!/data/data/com.termux/files/usr/bin/sh\n# MHC_NODE_ROLE_GUARD_v1\nexec '+prefix+'/bin/node '+path.join(HOME,'.local/share/mhc-full-installer/bin/node-role-guard.mjs')+' watch --confirm=WATCH_LAB_GUARD\n';
  fs.writeFileSync(path.join(dir,'run'),script,{mode:0o700,flag:'wx'});return {installed:true,path:dir,autoStartsWhenRunitScans:true,note:'No service auto-restart or HA authority. Watchdog must run before serving traffic.'};}

 case 'watch':if(rest.length!==1||rest[0]!=='--confirm=WATCH_LAB_GUARD')fail('Explicit watch confirmation required');safety();
  while(true){try{const r=check();console.log(JSON.stringify({at:new Date().toISOString(),...r}));}catch(e){console.error('GUARD CHECK FAILED:',e.message);}await new Promise(resolve=>setTimeout(resolve,10000));}
 default:fail('Usage: node-guard plan|status|arm SERVICES --confirm=ARM_LAB_SERVICE_GUARD|check|watch --confirm=WATCH_LAB_GUARD|service-install --confirm=INSTALL_LAB_ROLE_GUARD');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error('STOP:',e.message);process.exitCode=1;});
