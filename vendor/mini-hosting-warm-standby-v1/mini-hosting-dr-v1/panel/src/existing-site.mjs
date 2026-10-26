// Android Mini Hosting Panel v1.2: writable scoped File Manager and safe build-only releases
// for the existing Tho Phuong Pro instance. Intentionally never modifies Nginx,
// Cloudflare, .env, database or persistent sheet storage.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {HOME,TERMUX,SERVICE_DIR,LOG_DIR} from './config.mjs';
import {inside,HttpError} from './security.mjs';
import {extractZip} from './zip.mjs';
import {cmd} from './system.mjs';

export const EXISTING_SLUG='thophuongpro';
const ROOT=path.join(HOME,'apps',EXISTING_SLUG);
const DIST=path.join(ROOT,'dist');
const RELEASES=path.join(ROOT,'.amh-releases');
const SERVICE=path.join(SERVICE_DIR,'mini-web');
const SV=path.join(TERMUX,'bin','sv');
const BACKUP_RE=/^dist-\d{4}-\d{2}-\d{2}T[0-9-]+Z-[a-f0-9]{8}$/;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const regular=p=>{try{return fs.lstatSync(p).isFile();}catch{return false;}};
const directory=p=>{try{return fs.lstatSync(p).isDirectory();}catch{return false;}};

export function existingSite(){
 // Detect an already-running, deliberately deployed service without registering
 // a new Nginx vhost or replacing runit definitions.
 if(!directory(ROOT)||!directory(DIST)||!regular(path.join(DIST,'server.cjs'))||!regular(path.join(DIST,'index.html'))||!regular(path.join(ROOT,'.env'))||!regular(path.join(SERVICE,'run')))return null;
 const script=fs.readFileSync(path.join(SERVICE,'run'),'utf8');
 if(!script.includes(ROOT)||!script.includes('dist/server.cjs'))return null;
 return {slug:EXISTING_SLUG,hostname:'pro.thophuong.com',type:'node',entry:'dist/server.cjs',port:3000,service:'mini-web',external:true,managed:'existing-build-only',root:ROOT};
}
function requireExisting(){if(!existingSite())throw new HttpError(409,'Thờ Phượng Pro chưa được nhận diện: kiểm tra mini-web, thư mục dist và .env');}
export function statusExisting(){requireExisting();return {site:existingSite(),releases:listReleases(),scope:'Chỉ cập nhật dist; giữ nguyên .env, package.json, node_modules, MariaDB và sheet'};}

// File Manager: writable only within published build and persistent sheet files.
// Never permit editing secrets, executable backend, runtime dependencies, or deploy backups.
const EDITABLE_ROOTS=['dist','storage/sheets'];
const TEXT_EXT=new Set(['.html','.htm','.js','.mjs','.cjs','.css','.json','.txt','.svg','.md','.xml','.musicxml','.yml','.yaml','.csv','.webmanifest','.map']);
const hidden=n=>n.startsWith('.')||['node_modules','secrets','private','backups','tmp','cache'].includes(n.toLowerCase())||/\.(key|pem|p12|pfx|sqlite|db)$/i.test(n);
function safeExistingRel(rel='',mode='read'){
 requireExisting();
 if(typeof rel!=='string'||rel.length>512||rel.includes('\\')||rel.includes('\0')||rel.startsWith('/')||/^[a-z]:/i.test(rel))throw new HttpError(400,'Invalid path');
 if(rel===''){
  if(mode==='list')return ROOT;
  throw new HttpError(403,'Cannot modify website root');
 }
 const segs=rel.split('/');
 if(segs.some(s=>!s||s==='.'||s==='..'||hidden(s)))throw new HttpError(403,'Protected or invalid path');
 const isManifest=rel==='package.json'||rel==='package-lock.json';
 const inBuild=rel==='dist'||rel.startsWith('dist/');
 const inStorage=rel==='storage'||rel==='storage/sheets'||rel.startsWith('storage/sheets/');
 if(!(isManifest||inBuild||inStorage))throw new HttpError(403,'Path outside allowed File Manager areas');
 if(mode==='write'||mode==='rename'||mode==='delete'||mode==='mkdir'){
  if(isManifest||rel==='dist'||rel==='storage'||rel==='storage/sheets'||rel==='dist/server.cjs'||rel==='dist/index.html'&&mode==='delete')
   throw new HttpError(403,'Protected application entry or root; use Deploy for backend releases');
  // Never directly modify executable backend or its sourcemap.
  if(rel==='dist/server.cjs.map'||rel.endsWith('/server.cjs'))throw new HttpError(403,'Use Deploy ZIP to update Node.js backend');
 }
 try{return inside(ROOT,rel);}catch(e){throw new HttpError(403,e.message);}
}
function storageChildren(dir,rel){
 if(rel==='')return ['dist','storage','package.json','package-lock.json'].filter(n=>fs.existsSync(path.join(ROOT,n)));
 if(rel==='storage')return ['sheets'].filter(n=>fs.existsSync(path.join(ROOT,'storage',n)));
 return fs.readdirSync(dir);
}
export function listExistingFiles(rel=''){
 const dir=safeExistingRel(rel,'list');
 if(!directory(dir))throw new HttpError(404,'Directory not found');
 const names=storageChildren(dir,rel);
 const result=[];
 for(const name of names){
  if(hidden(name))continue;
  const child=path.join(dir,name);let stat;try{stat=fs.lstatSync(child);}catch{continue;}
  if(!stat.isFile()&&!stat.isDirectory())continue;
  result.push({name,dir:stat.isDirectory(),size:stat.size,mtime:stat.mtime.toISOString(),protected:['package.json','package-lock.json','dist/server.cjs'].includes([rel,name].filter(Boolean).join('/'))});
  if(result.length>=1000)break;
 }
 return result.sort((a,b)=>Number(b.dir)-Number(a.dir)||a.name.localeCompare(b.name));
}
export function readExistingFile(rel){
 const file=safeExistingRel(rel);
 const ext=path.extname(file).toLowerCase();
 if(!TEXT_EXT.has(ext))throw new HttpError(415,'Binary file: use Download');
 if(!regular(file))throw new HttpError(404,'File not found');
 if(fs.statSync(file).size>2*1024*1024)throw new HttpError(413,'Text preview limited to 2 MiB; use Download');
 return fs.readFileSync(file,'utf8');
}
function trashPrevious(full,rel){
 if(!fs.existsSync(full))return null;
 const trash=path.join(ROOT,'.amh-file-trash');
 fs.mkdirSync(trash,{recursive:true,mode:0o700});
 const ident=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(6).toString('hex');
 const target=path.join(trash,ident+'-'+path.basename(rel));
 fs.renameSync(full,target);
 return target;
}
function restoreOnError(target,backup){if(backup&&fs.existsSync(backup)&&!fs.existsSync(target))fs.renameSync(backup,target);}
export function writeExistingFile(rel,buf){
 if(!Buffer.isBuffer(buf)||buf.length>20*1024*1024)throw new HttpError(413,'Each file limited to 20 MiB');
 const file=safeExistingRel(rel,'write'),parent=path.dirname(file);
 if(!directory(parent))throw new HttpError(404,'Parent folder not found');
 if(fs.existsSync(file)&&!regular(file))throw new HttpError(409,'Cannot overwrite a directory');
 const temp=path.join(parent,'.amh-temp-'+crypto.randomUUID());
 fs.writeFileSync(temp,buf,{mode:0o600,flag:'wx'});
 let old=null;
 try{old=trashPrevious(file,rel);fs.renameSync(temp,file);return {ok:true,path:rel,size:buf.length,backup:!!old};}
 catch(e){fs.rmSync(temp,{force:true});restoreOnError(file,old);throw e;}
}
export function mkdirExisting(rel){
 const dir=safeExistingRel(rel,'mkdir'),parent=path.dirname(dir);
 if(!directory(parent))throw new HttpError(404,'Parent folder not found');
 fs.mkdirSync(dir,{recursive:false,mode:0o700});return {ok:true,path:rel};
}
export function deleteExisting(rel){
 const target=safeExistingRel(rel,'delete');
 if(!fs.existsSync(target))throw new HttpError(404,'File or folder not found');
 const b=trashPrevious(target,rel);return {ok:true,path:rel,movedToTrash:!!b};
}
export function renameExisting(srcRel,destRel){
 if(srcRel===destRel)throw new HttpError(400,'Choose a different path');
 const src=safeExistingRel(srcRel,'rename'),dst=safeExistingRel(destRel,'rename');
 if(!fs.existsSync(src))throw new HttpError(404,'Source not found');
 if(fs.existsSync(dst))throw new HttpError(409,'Destination already exists');
 if(!directory(path.dirname(dst)))throw new HttpError(404,'Target parent folder not found');
 if(dst.startsWith(src+path.sep))throw new HttpError(400,'Cannot move folder into itself');
 fs.renameSync(src,dst);return {ok:true,from:srcRel,to:destRel};
}
export function downloadExistingFile(rel){
 const file=safeExistingRel(rel);
 if(!regular(file))throw new HttpError(404,'File not found');
 const stat=fs.statSync(file);
 if(stat.size>50*1024*1024)throw new HttpError(413,'Download limit 50 MiB per file');
 return {file,name:path.basename(file),size:stat.size};
}
function backupId(){return `dist-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(4).toString('hex')}`;}
export function listReleases(){
 if(!directory(RELEASES))return [];
 return fs.readdirSync(RELEASES,{withFileTypes:true}).filter(e=>e.isDirectory()&&BACKUP_RE.test(e.name)&&regular(path.join(RELEASES,e.name,'server.cjs'))&&regular(path.join(RELEASES,e.name,'index.html'))).map(e=>({id:e.name,time:fs.statSync(path.join(RELEASES,e.name)).mtime.toISOString()})).sort((a,b)=>b.time.localeCompare(a.time));
}
function findDist(staged){
 const choices=[path.join(staged,'dist'),staged];
 for(const x of fs.readdirSync(staged,{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.name.startsWith('.')).slice(0,5))choices.push(path.join(staged,x.name,'dist'));
 const good=choices.filter(dir=>directory(dir)&&regular(path.join(dir,'index.html'))&&regular(path.join(dir,'server.cjs')));
 if(good.length!==1)throw new HttpError(400,'ZIP phải chứa một thư mục dist với dist/index.html và dist/server.cjs');
 return good[0];
}
function portOpen(port=3000){return new Promise(resolve=>{
 const sock=net.connect({host:'127.0.0.1',port});let ended=false;
 const done=v=>{if(!ended){ended=true;sock.destroy();resolve(v);}};
 sock.once('connect',()=>done(true));sock.once('error',()=>done(false));sock.setTimeout(1300,()=>done(false));
});}
async function serviceIsDown(){
 const status=await cmd(SV,['status',SERVICE],5000);
 if(/^down:\s/.test(status.out))return true;
 if(/^run:\s/.test(status.out))return false;
 throw Error('Không đọc được trạng thái mini-web: '+(status.err||status.out||'unknown'));
}
async function waitFullyStopped(rounds){
 for(let i=0;i<rounds;i++){
  if(await serviceIsDown()&&!await portOpen())return true;
  await delay(500);
 }
 return false;
}
async function requireStopped(){
 // Stop the runit-supervised app. Never kill all Node processes: Panel/monitor
 // also run on Node, and an unrelated PID must be handled deliberately.
 const down=await cmd(SV,['down',SERVICE],15000);
 if(!down.ok){
  const state=await cmd(SV,['status',SERVICE],5000);
  if(!/^run:\s|^down:\s/.test(state.out))throw Error('Không điều khiển được mini-web: '+(down.err||down.out));
 }
 // Waiting for the process to disappear is more reliable than checking only
 // whether the TCP listener is closed while graceful shutdown is in progress.
 if(await waitFullyStopped(24))return;
 if(!await serviceIsDown()){
  // Scope force-stop to mini-web only; sv sends SIGKILL only if its managed
  // process refuses to exit after the runit timeout.
  const forced=await cmd(SV,['force-stop',SERVICE],16000);
  if(!forced.ok)throw Error('Không force-stop được mini-web: '+(forced.err||forced.out));
 }
 if(await waitFullyStopped(16))return;
 throw Error('Cổng 3000 còn bận sau khi mini-web đã dừng. Deploy chưa thay dist. Có thể có Node.js chạy ngoài runit; kiểm tra: ps -ef | grep [n]ode. Không dùng pkill node.');
}
async function startAndCheck(){
 const up=await cmd(SV,['up',SERVICE],15000);
 if(!up.ok)throw Error('Không bật được mini-web: '+up.err);
 for(let i=0;i<20;i++){
  if(await httpHealthy())return;
  await delay(700);
 }
 throw Error('Thờ Phượng Pro chưa trả trang HTML hợp lệ trên 127.0.0.1:3000');
}
async function httpHealthy(){return await new Promise(resolve=>{
 const req=http.get({hostname:'127.0.0.1',port:3000,path:'/',timeout:1600},res=>{
  let found='';res.on('data',c=>{if(found.length<4096)found+=c.toString('utf8').slice(0,4096-found.length);});
  res.on('end',()=>resolve(res.statusCode===200&&/<html\b/i.test(found)&&!found.includes('Android Mini Hosting')));
  res.on('error',()=>resolve(false));
 });req.on('error',()=>resolve(false));req.on('timeout',()=>{req.destroy();resolve(false);});
});}

function verifyBundleZip(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<100||buffer.length>64*1024*1024)throw new HttpError(413,'ZIP phải nhỏ hơn 64 MiB');
 fs.mkdirSync(RELEASES,{recursive:true,mode:0o700});
 const staging=path.join(RELEASES,'.incoming-'+crypto.randomUUID());
 try{
  const info=extractZip(buffer,staging,{maxFiles:3000,maxTotal:320*1024*1024});
  const source=findDist(staging);
  const html=fs.readFileSync(path.join(source,'index.html'),'utf8');
  if(!/<html\b/i.test(html)||html.includes('Android Mini Hosting'))throw new HttpError(400,'dist/index.html không hợp lệ');
  const syntax=spawnSync(process.execPath,['--check',path.join(source,'server.cjs')],{encoding:'utf8',timeout:15000});
  if(syntax.status!==0)throw new HttpError(400,'dist/server.cjs bị lỗi cú pháp: '+String(syntax.stderr).slice(-300));
  for(const match of html.matchAll(/(?:src|href)=[\"']\/?assets\/([^\"'?#]+)[\"']/g)){
   if(!regular(inside(source,'assets/'+match[1])))throw new HttpError(400,'Thiếu file assets: '+match[1]);
  }
  return {source,staging,info};
 }catch(e){fs.rmSync(staging,{recursive:true,force:true});throw e;}
}

// Manage only compiled dist. A failed update restores the previous compiled dist
// automatically; this does not migrate or alter MariaDB.
export async function deployExisting(buffer){
 requireExisting();const {source,staging,info}=verifyBundleZip(buffer);
 let stopped=false,swapped=false,previous=null;
 try{
  stopped=true;await requireStopped();
  const id=backupId();previous=path.join(RELEASES,id);
  fs.renameSync(DIST,previous);
  try{fs.renameSync(source,DIST);swapped=true;}
  catch(e){fs.renameSync(previous,DIST);throw e;}
  await startAndCheck();
  return {ok:true,backup:id,info,version:'Build đã phục vụ qua pro.thophuong.com',notice:'Kiểm tra đăng nhập/API, dữ liệu và cache trên trình duyệt. Database chưa được migrate.'};
 }catch(e){
  if(swapped){
   try{await requireStopped();if(directory(DIST))fs.rmSync(DIST,{recursive:true,force:true});fs.renameSync(previous,DIST);await startAndCheck();}
   catch(re){throw new Error('Deploy lỗi và KHÔNG tự rollback được: '+e.message+'; rollback: '+re.message);}
   throw new Error('Deploy thất bại, đã phục hồi bản dist cũ: '+e.message);
  }
  if(stopped){try{await startAndCheck();}catch{}}
  throw e;
 }finally{fs.rmSync(staging,{recursive:true,force:true});}
}
export async function rollbackExisting(id){
 requireExisting();if(typeof id!=='string'||!BACKUP_RE.test(id)||!listReleases().some(r=>r.id===id))throw new HttpError(400,'Bản lưu không hợp lệ');
 await requireStopped();let moved=false,old=null;
 try{
  const source=path.join(RELEASES,id);
  old=path.join(RELEASES,backupId());fs.renameSync(DIST,old);
  try{fs.renameSync(source,DIST);moved=true;}catch(e){fs.renameSync(old,DIST);throw e;}
  await startAndCheck();return {ok:true,restored:id,backupCurrent:path.basename(old)};
 }catch(e){
  if(moved){try{await requireStopped();if(directory(DIST))fs.rmSync(DIST,{recursive:true,force:true});fs.renameSync(old,DIST);await startAndCheck();}catch(re){throw Error('Rollback lỗi, không tự phục hồi được: '+re.message);}}
  else{try{await startAndCheck();}catch{}}
  throw Error('Rollback không thành công: '+e.message);
 }
}
export function existingLog(){requireExisting();try{return fs.readFileSync(path.join(LOG_DIR,'mini-web','current'),'utf8').slice(-18000);}catch(e){return 'Không đọc được log mini-web: '+e.message;}}
