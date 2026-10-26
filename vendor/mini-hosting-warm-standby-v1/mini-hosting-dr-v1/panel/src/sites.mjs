import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {registry,saveRegistry,SITES,TRASH,DATA,readJson,atomicJson} from './config.mjs';
import {slugOK,hostOK,inside,HttpError} from './security.mjs';
import {createService,removeService,regenerateNginx,cmd} from './system.mjs';
import {extractZip} from './zip.mjs';
function requireSite(slug){const site=registry().sites.find(s=>s.slug===slug);if(!site)throw new HttpError(404,'Website not found');return site;}
export function listSites(){return registry().sites;}
export function siteRoot(site){return path.join(SITES,site.slug,site.type==='static'?'public':'app');}
export async function addSite({slug,hostname,type='static',entry='server.js'}){
 if(!slugOK(slug)||!hostOK(hostname)||!['static','node'].includes(type))throw new HttpError(400,'Invalid site config');
 if(['pro.thophuong.com','panel.thophuong.com'].includes(hostname))throw new HttpError(400,'Hostname reserved for existing services');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.m?js$/.test(entry))throw new HttpError(400,'Invalid Node entrypoint');
 const r=registry();if(r.sites.some(s=>s.slug===slug||s.hostname===hostname))throw new HttpError(409,'Site slug or hostname already exists');
 const used=new Set(r.sites.map(s=>s.port));let port=null;
 if(type==='node'){port=3200;while(used.has(port)&&port<3399)port++;if(port>=3399)throw new HttpError(409,'No ports available');}
 const site={slug,hostname,type,entry:type==='node'?entry:null,port,createdAt:new Date().toISOString()};
 const root=siteRoot(site);fs.mkdirSync(root,{recursive:true,mode:0o700});
 if(type==='static')fs.writeFileSync(path.join(root,'index.html'),`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${slug}</title><body style="font-family:sans-serif;padding:3rem"><h1>${hostname}</h1><p>Website đang hoạt động trên Samsung M51.</p></body></html>`);
 else fs.writeFileSync(path.join(root,entry),`import http from 'node:http';\nhttp.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<h1>${hostname}</h1><p>Node website đang chạy trên M51</p>')}).listen(Number(process.env.PORT), '127.0.0.1');\n`);
 try{await regenerateNginx([...r.sites,site]);r.sites.push(site);saveRegistry(r);if(type==='node')await createService(site);return site;}
 catch(e){fs.rmSync(path.join(SITES,slug),{recursive:true,force:true});throw e;}
}
export async function deleteSite(slug){const r=registry(),site=requireSite(slug);const remaining=r.sites.filter(s=>s.slug!==slug);
 await regenerateNginx(remaining);await removeService(site);
 const source=path.join(SITES,slug),dest=path.join(TRASH,`${Date.now()}-${slug}`);fs.mkdirSync(TRASH,{recursive:true});if(fs.existsSync(source))fs.renameSync(source,dest);
 r.sites=remaining;saveRegistry(r);return {trash:dest};
}
export function listFiles(slug,rel=''){const site=requireSite(slug),root=siteRoot(site),dir=inside(root,rel);if(!fs.existsSync(dir))throw new HttpError(404,'Directory not found');if(!fs.statSync(dir).isDirectory())throw new HttpError(400,'Not a directory');return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!e.isSymbolicLink()).map(e=>{const s=fs.statSync(path.join(dir,e.name));return {name:e.name,dir:e.isDirectory(),size:s.size,mtime:s.mtime.toISOString()};}).sort((a,b)=>Number(b.dir)-Number(a.dir)||a.name.localeCompare(b.name));}
export function readFileForSite(slug,rel){const root=siteRoot(requireSite(slug));const file=inside(root,rel);if(!fs.statSync(file).isFile())throw new HttpError(400,'Not a file');const st=fs.statSync(file);if(st.size>2*1024*1024)throw new HttpError(413,'File too large for editor');return fs.readFileSync(file,'utf8');}
export function writeSiteFile(slug,rel,bytes){if(!rel||bytes.length>20*1024*1024)throw new HttpError(400,'Invalid file or size');const root=siteRoot(requireSite(slug)),dest=inside(root,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});if(fs.existsSync(dest)&&!fs.statSync(dest).isFile())throw new HttpError(400,'Not a regular file');fs.writeFileSync(dest,bytes,{mode:0o600});return {path:rel,bytes:bytes.length};}
export function mkdirSite(slug,rel){if(!rel)throw new HttpError(400,'Directory required');fs.mkdirSync(inside(siteRoot(requireSite(slug)),rel),{recursive:true});return {created:rel};}
export function deleteSiteFile(slug,rel){if(!rel)throw new HttpError(400,'Path required');const file=inside(siteRoot(requireSite(slug)),rel);const stat=fs.lstatSync(file);if(stat.isDirectory()){if(fs.readdirSync(file).length)throw new HttpError(409,'Directory not empty');fs.rmdirSync(file);}else if(stat.isFile())fs.unlinkSync(file);else throw new HttpError(400,'Unsupported file');return {deleted:rel};}
function unnest(folder,site){const f=fs.readdirSync(folder);if(f.length===1&&fs.statSync(path.join(folder,f[0])).isDirectory()){
 const candidate=path.join(folder,f[0]),expected=site.type==='static'?'index.html':site.entry;
 if(fs.existsSync(path.join(candidate,expected)))return candidate;
 }return folder;}
export async function deployZip(slug,buf){const site=requireSite(slug);const dir=path.join(DATA,'staging-'+crypto.randomUUID());const target=siteRoot(site),previous=target+'-previous-'+Date.now();
 try{const stats=extractZip(buf,dir);const effective=unnest(dir,site);
 if(!fs.existsSync(path.join(effective,site.type==='static'?'index.html':site.entry)))throw Error('ZIP missing index.html or Node entrypoint '+site.entry);
 if(site.type==='node')await cmd('sv',['down','amh-site-'+slug]);
 fs.renameSync(target,previous);try{fs.renameSync(effective,target);}catch(e){fs.renameSync(previous,target);throw e;}
 if(site.type==='node')await cmd('sv',['up','amh-site-'+slug]);
 // Keep previous version for rollback; not automatically deleted.
 return {stats,previous};
 }finally{fs.rmSync(dir,{force:true,recursive:true});}}
export async function deployGit(slug,url){const site=requireSite(slug);if(typeof url!=='string'||url.length>400||!/^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(?:\.git)?$/.test(url))throw new HttpError(400,'Use trusted HTTPS GitHub/GitLab/Bitbucket repository URL');
 const dir=path.join(DATA,'staging-'+crypto.randomUUID()),target=siteRoot(site),previous=target+'-previous-'+Date.now();
 const r=await cmd('git',['clone','--depth','1','--',url,dir],120000,512*1024);
 if(!r.ok){fs.rmSync(dir,{recursive:true,force:true});throw Error('Git clone failed: '+r.err);}
 try{if(!fs.existsSync(path.join(dir,site.type==='static'?'index.html':site.entry)))throw Error('Repository must contain index.html or '+site.entry+' at root');
 // Deploy repo without executing npm lifecycle scripts: install dependencies on-device manually for trusted apps.
 if(site.type==='node')await cmd('sv',['down','amh-site-'+slug]);fs.renameSync(target,previous);
 try{fs.renameSync(dir,target);}catch(e){fs.renameSync(previous,target);throw e;}
 if(site.type==='node')await cmd('sv',['up','amh-site-'+slug]);return {previous};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}}
export function backupSite(slug){const site=requireSite(slug);return {site,dir:path.join(SITES,slug)};}
