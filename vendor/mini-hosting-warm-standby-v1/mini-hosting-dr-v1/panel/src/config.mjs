import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
export const ROOT=path.resolve(path.join(import.meta.dirname,'..'));
export const DATA=path.join(ROOT,'data');
export const SITES=path.join(DATA,'sites');
export const TRASH=path.join(DATA,'trash');
export const BACKUPS=path.join(DATA,'backups');
export const NGINX=path.join(DATA,'nginx','sites');
export const REGISTRY=path.join(DATA,'sites.json');
export const ADMIN=path.join(DATA,'admin.json');
export const TERMUX=process.env.PREFIX || '/data/data/com.termux/files/usr';
export const HOME=process.env.HOME || os.homedir();
export const SERVICE_DIR=path.join(TERMUX,'var/service');
export const LOG_DIR=path.join(TERMUX,'var/log/sv');
export const NGINX_CONFIG=path.join(HOME,'.nginx/nginx.conf');
export const NODE=process.execPath;
export const PORT=Number(process.env.AMH_PORT||9090);
export function ensureDirs(){for(const p of [DATA,SITES,TRASH,BACKUPS,NGINX])fs.mkdirSync(p,{recursive:true,mode:0o700});}
export function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export function atomicJson(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);}
export function registry(){return readJson(REGISTRY,{sites:[],nginxIntegrated:false,createdAt:new Date().toISOString()});}
export function saveRegistry(data){atomicJson(REGISTRY,data);}
