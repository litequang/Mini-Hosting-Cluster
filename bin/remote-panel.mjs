#!/usr/bin/env node
// Local configuration only; no Cloudflare API calls and no public port listener.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
const home=process.env.HOME||os.homedir();
const dest=path.join(home,'android-hosting-panel','data','remote-access.json');
const HOST=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const TEAM=/^[a-z0-9-]{1,63}\.cloudflareaccess\.com$/;
const AUD=/^[A-Za-z0-9_-]{32,128}$/;
function stop(s){throw Error('STOP: '+s)}
function safeParent(){const d=path.dirname(dest);const st=fs.lstatSync(d);if(!st.isDirectory()||st.isSymbolicLink())stop('Original Panel data folder missing or symlink');}
function read(){try{const st=fs.lstatSync(dest);if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||st.size>4096)stop('Unsafe configuration');return JSON.parse(fs.readFileSync(dest,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const [cmd,...args]=process.argv.slice(2);
try{
 if(cmd==='plan')console.log(JSON.stringify({mode:'CONFIGURE_ONLY',panel:'original localhost:9090 on each node',requires:['Cloudflare Access self-hosted application with identity policy','Node Tunnel published HTTPS hostname -> http://127.0.0.1:9090; shared management failover requires a separate routing plan','Account Team Domain + application Audience Tag','Valid Access JWT at origin AND Panel password'],changesCloudflare:false,opensTcpPort:false,changesPrimary:false},null,2));
 else if(cmd==='status') {const c=read();console.log(JSON.stringify({configured:!!c,hostname:c?.hostname||null,accessJwtRequired:!!c,cloudflareDeployedVerified:false,controllerRoleVerified:false},null,2));}
 else if(cmd==='configure'){
  const [host,team,aud,confirm]=args;
  if(args.length!==4||confirm!=='--confirm=ENABLE_CLOUDFLARE_ACCESS_JWT'||!HOST.test(host||'')||!TEAM.test(team||'')||!AUD.test(aud||''))stop('Usage: remote-panel configure HOSTNAME TEAM.cloudflareaccess.com AUDIENCE_TAG --confirm=ENABLE_CLOUDFLARE_ACCESS_JWT');
  safeParent();if(read())stop('Remote configuration already exists; disable explicitly before changing');
  const cfg={schema:1,hostname:host,teamDomain:team,audience:aud};
  fs.writeFileSync(dest,JSON.stringify(cfg)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({configured:true,hostname:host,next:'Restart only amh-panel after confirming Cloudflare Access and Tunnel are configured. Never expose port 9090 publicly.'}));
 }
 else if(cmd==='add-lab'){
  const [host,team,aud,confirm]=args;
  if(args.length!==4||host!=='panel-lab.giaouoc.com'||!TEAM.test(team||'')||!AUD.test(aud||'')||confirm!=='--confirm=ADD_LAB_ACCESS_APPLICATION')stop('Usage: remote-panel add-lab panel-lab.giaouoc.com TEAM.cloudflareaccess.com AUD --confirm=ADD_LAB_ACCESS_APPLICATION');
  safeParent();const lock=dest+'.lock';fs.mkdirSync(lock,{mode:0o700});
  try{
   const old=read();if(!old||old.schema!==1||!HOST.test(old.hostname)||!TEAM.test(old.teamDomain)||!AUD.test(old.audience))stop('Valid existing origin configuration required');
   const apps=old.applications??[];if(!Array.isArray(apps)||apps.length>3)stop('Invalid existing applications');
   const existing=[old,...apps].find(a=>a.hostname===host);
   if(existing){if(existing.teamDomain!==team||existing.audience!==aud)stop('Existing LAB application differs; inspect without overwrite');console.log(JSON.stringify({configured:true,hostname:host,result:'ALREADY_CONFIGURED'}));}
   else{
    if(apps.length>=3||apps.some(a=>!HOST.test(a?.hostname)||!TEAM.test(a?.teamDomain)||!AUD.test(a?.audience))||new Set([old.hostname,...apps.map(a=>a.hostname)]).size!==apps.length+1)stop('Invalid or full application list');
    const backup=dest+'.p32-before-'+crypto.randomUUID();fs.writeFileSync(backup,fs.readFileSync(dest),{mode:0o600,flag:'wx'});
    const tmp=dest+'.'+crypto.randomUUID()+'.tmp',fd=fs.openSync(tmp,'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify({...old,applications:[...apps,{hostname:host,teamDomain:team,audience:aud}]})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(tmp,dest);console.log(JSON.stringify({configured:true,hostname:host,baseHostname:old.hostname,result:'LAB_APPLICATION_ADDED',backupFile:backup,next:'Restart only amh-panel; verify original and LAB hosts, JWT audience, localhost recovery and CSRF.'}));
   }
  }finally{fs.rmdirSync(lock);}
 }
 else if(cmd==='disable'){
  if(args.length!==1||args[0]!=='--confirm=DISABLE_REMOTE_PANEL')stop('Explicit disable confirmation required');
  safeParent();const present=read();if(present)fs.rmSync(dest);
  console.log(JSON.stringify({configured:false,next:'Restart amh-panel; local SSH access still works.'}));
 }
 else stop('Usage: remote-panel plan|status|configure HOST TEAM AUD --confirm=ENABLE_CLOUDFLARE_ACCESS_JWT|add-lab HOST TEAM AUD --confirm=ADD_LAB_ACCESS_APPLICATION|disable --confirm=DISABLE_REMOTE_PANEL');
}catch(e){console.error(String(e.message));process.exitCode=1;}
