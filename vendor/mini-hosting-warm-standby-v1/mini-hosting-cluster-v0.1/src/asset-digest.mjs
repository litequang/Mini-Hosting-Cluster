// Immutable content-based tree fingerprint; streaming, no staging DB changes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
const HOME=os.homedir(), ROOT=path.join(HOME,'apps/thophuongpro/storage');
const TARGET=path.join(HOME,'standby-sync/asset-checkpoint.json');
async function list(dir,base=''){const all=[];for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const rel=base?base+'/'+e.name:e.name,p=path.join(dir,e.name);
 if(e.isSymbolicLink())throw Error('Storage contains symlink, refusing: '+rel);
 if(e.isDirectory())all.push(...await list(p,rel));else if(e.isFile())all.push(rel);else throw Error('Unsupported entry: '+rel);
 }return all;}
export async function fingerprint(root=ROOT){if(!fs.existsSync(root))throw Error('Storage directory missing');const h=crypto.createHash('sha256');for(const rel of await list(root)){
 const file=path.join(root,rel);h.update('FILE\0'+rel+'\0');const sha=crypto.createHash('sha256');for await(const part of fs.createReadStream(file))sha.update(part);h.update(sha.digest('hex')+'\n');}
 return h.digest('hex');}
async function run(){const [cmd,x,at]=process.argv.slice(2);if(cmd==='digest')return console.log(await fingerprint());if(cmd==='stamp'){
 if(!/^[a-f0-9]{64}$/.test(x||'')||!Number.isFinite(Date.parse(at||'')))throw Error('Bad verification');
 if((await fingerprint())!==x)throw Error('Tree changed during asset verification');
 fs.mkdirSync(path.dirname(TARGET),{recursive:true,mode:0o700});const temp=TARGET+'.'+process.pid;
 const applied=(()=>{try{return fs.readFileSync(path.join(HOME,'standby-sync/latest-applied'),'utf8').trim();}catch{return null;}})();
 fs.writeFileSync(temp,JSON.stringify({verified:true,checkpoint:x,observedAt:at,snapshotApplied:applied},null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,TARGET);console.log('STORAGE VERIFIED '+x);
 }else throw Error('Usage: asset-digest.mjs digest|stamp <sha256> <iso-time>');}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))run().catch(e=>{console.error(e.message);process.exitCode=1;});
