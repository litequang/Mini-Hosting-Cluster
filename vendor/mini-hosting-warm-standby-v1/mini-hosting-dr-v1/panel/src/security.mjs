import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ADMIN,readJson,atomicJson} from './config.mjs';
export function makePassword(){return crypto.randomBytes(24).toString('base64url');}
export function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
  return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')};
}
export function setPassword(password){if(password.length<16)throw Error('Password must be at least 16 characters');atomicJson(ADMIN,hashPassword(password));}
export function checkPassword(password){const v=readJson(ADMIN,null);if(!v)return false;try{return crypto.timingSafeEqual(Buffer.from(v.hash,'hex'),crypto.scryptSync(password,v.salt,64));}catch{return false;}}
export function configured(){return fs.existsSync(ADMIN);}
export function slugOK(v){return typeof v==='string'&&/^[a-z][a-z0-9-]{1,30}$/.test(v)&&!['panel','admin','api','default','pro'].includes(v);}
export function hostOK(v){return typeof v==='string'&&v.length<=253&&v.length>=4&&/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)&&!v.includes('..');}
export function databaseOK(v){return typeof v==='string'&&/^[a-z][a-z0-9_]{2,29}$/.test(v);}
export function serviceOK(v){return ['nginx','mysqld','mini-web','named-tunnel','mini-tunnel','amh-panel'].includes(v)||/^amh-site-[a-z][a-z0-9-]{1,30}$/.test(v);}
export function cleanRel(input=''){
 if(typeof input!=='string'||input.length>512||input.includes('\0')||input.includes('\\'))throw Error('Invalid path');
 const parts=input.split('/');if(parts.some(p=>p==='..'||p==='.'||p==='')){
  if(input!==''&&input!=='.')throw Error('Invalid path');
 }
 if(path.posix.isAbsolute(input)||/^[a-zA-Z]:/.test(input))throw Error('Invalid path');
 return input=='.'?'':input;
}
export function inside(root,rel=''){
 const n=cleanRel(rel),base=path.resolve(root),full=path.resolve(base,n);
 if(full!==base&&!full.startsWith(base+path.sep))throw Error('Path outside site');
 // No symlink traversal in files managed from the panel.
 let current=base;
 for(const part of (n?n.split('/'):[])){
  current=path.join(current,part);
  try{if(fs.lstatSync(current).isSymbolicLink())throw Error('Symlinks are not accessible');}
  catch(e){if(e.code==='ENOENT')break;throw e;}
 }
 return full;
}
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export function safeText(v,max=256){return typeof v==='string'?v.slice(0,max):'';}
