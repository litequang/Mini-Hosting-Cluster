// Fresh LAB node only, before cluster join. Destructive process tests need explicit node ID.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2);if(process.env.PREFIX!=='/data/data/com.termux/files/usr'||args[0]!=='--restart-management-services'||args[1]!=='--node-id'||!(/^[a-f0-9-]{36}$/.test(args[2]||''))||args.length!==3)throw Error('N1_EXPLICIT_FRESH_ANDROID_SERVICE_DRILL_REQUIRED');
const home=os.homedir(),prefix=process.env.PREFIX,base=home+'/.local/state/mhc-new-node-install',progress=JSON.parse(fs.readFileSync(base+'/progress.json'));
const must=(v,c)=>{if(!v)throw Error(c);},wait=ms=>new Promise(r=>setTimeout(r,ms));let cookie='',csrf='';
async function call(route,body,auth=true,withCsrf=true){const r=await fetch('http://127.0.0.1:9090'+route,{method:body?'POST':'GET',headers:{...(auth&&cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin:'http://127.0.0.1:9090',...(withCsrf&&csrf?{'x-csrf-token':csrf}:{})}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
const status=name=>execFileSync('sv',['status',prefix+'/var/service/'+name],{encoding:'utf8'}),pid=name=>Number(status(name).match(/pid (\d+)/)?.[1]);
async function restartProof(name,comm){const before=pid(name);must(before>1,'N1_SERVICE_NOT_RUNNING');const d='/proc/'+before;must(fs.statSync(d).uid===process.getuid()&&fs.readFileSync(d+'/comm','utf8').trim()===comm,'N1_SERVICE_PID_NOT_VERIFIED');process.kill(before,name==='mysqld'?'SIGTERM':'SIGKILL');let after=0;for(let i=0;i<50;i++){await wait(300);try{after=pid(name);if(after>1&&after!==before){await wait(800);if(pid(name)===after)return {before,after,automaticRestart:true};}}catch{}}if(name==='sshd')execFileSync(prefix+'/bin/sshd',[],{stdio:'ignore'});throw Error('N1_AUTOMATIC_RESTART_FAILED');}
try{
 must(progress.phase==='INSTALLED'&&/^[a-f0-9]{40}$/.test(progress.commit),'N1_INSTALL_NOT_COMPLETE');must(progress.nodeId===args[2],'N1_UNEXPECTED_NODE');
 for(const f of ['authority.json','authority-enrollment.json'])must(!fs.existsSync(home+'/.config/mhc-full-installer/'+f),'N1_UNEXPECTED_CLUSTER_ENROLLMENT');
 must((await call('/api/sites',null,false)).status===401,'N1_PANEL_AUTH_NOT_ENFORCED');
 const passwordFile=home+'/.config/mhc-full-installer/panel-login-once';must((fs.statSync(passwordFile).mode&0o077)===0,'N1_PASSWORD_MODE_UNSAFE');
 async function login(){const r=await call('/api/login',{username:'admin',password:fs.readFileSync(passwordFile,'utf8').trim()},false);must(r.status===200&&r.cookie&&r.data.csrf,'N1_PANEL_LOGIN_FAILED');cookie=r.cookie.split(';')[0];csrf=r.data.csrf;}
 await login();must((await call('/api/mhc/pairing/invite',{},true,false)).status===403,'N1_CSRF_NOT_ENFORCED');
 const sites=await call('/api/sites');must(sites.status===200&&sites.data.sites.length===0,'N1_UNEXPECTED_WEBSITES');
 const oldReceipts=crypto.createHash('sha256').update(JSON.stringify(progress.receipts)).digest('hex');
 // Current Node uses MainThread as comm; verify the executable as well before killing it.
 const panelPid=pid('amh-panel');must(fs.readlinkSync('/proc/'+panelPid+'/exe')===prefix+'/bin/node','N1_PANEL_EXECUTABLE_UNEXPECTED');
 const panel=await restartProof('amh-panel',fs.readFileSync('/proc/'+panelPid+'/comm','utf8').trim());await login();console.log(JSON.stringify({phase:'PANEL_AUTO_RESTART_PASS',...panel}));
 const sql=await restartProof('mysqld','mariadbd');
 let sqlOk=false;for(let i=0;i<20;i++){try{sqlOk=execFileSync('mariadb',['--no-defaults','--connect-timeout=3','-u','root','-N','-B','-e','SELECT 1,@@skip_networking'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim()==='1'+String.fromCharCode(9)+'1';if(sqlOk)break;}catch{}await wait(300);}must(sqlOk,'N1_SQL_RECOVERY_FAILED');console.log(JSON.stringify({phase:'SQL_AUTO_RESTART_PASS',...sql}));
 const ssh=await restartProof('sshd','sshd');console.log(JSON.stringify({phase:'SSH_AUTO_RESTART_PASS',...ssh}));
 try{execFileSync('bash',[home+'/.local/share/mhc-full-installer/bin/node-boot.sh','--once'],{stdio:'ignore',timeout:30000});}catch{throw Error('N1_BOOT_ENTRY_NEEDS_ACTION');}
 const current=JSON.parse(fs.readFileSync(base+'/progress.json'));must(crypto.createHash('sha256').update(JSON.stringify(current.receipts)).digest('hex')===oldReceipts,'N1_IDENTITY_OR_OUTPUT_RECEIPT_CHANGED');
 const result={result:'PASS',nodeId:progress.nodeId,sourceCommit:progress.commit,panelHttp:200,existingPasswordLogin:true,unauthorized401:true,csrf403:true,websites:0,sqlSelect1:true,sqlSocketOnly:true,panel,sql,ssh,bootEntryExecuted:true,androidRebootVerified:false,joined:false,writerGranted:false};fs.writeFileSync(base+'/acceptance-metadata.json',JSON.stringify(result),{mode:0o600});console.log(JSON.stringify(result));
}catch(e){console.error(/^N1_[A-Z0-9_]+$/.test(e.message)?e.message:'N1_ACCEPTANCE_FAILED');process.exitCode=1;}
