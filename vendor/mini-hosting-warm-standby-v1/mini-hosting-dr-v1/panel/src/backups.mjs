import fs from 'node:fs';
import path from 'node:path';
import {BACKUPS,SITES} from './config.mjs';
import {slugOK,HttpError} from './security.mjs';
import {cmd} from './system.mjs';
const validFile=n=>/^(?:site-[a-z][a-z0-9-]{1,30}|db-[a-z][a-z0-9_]{2,29})-\d{4}-\d{2}-\d{2}T[\d-]+Z\.(?:tgz|sql)$/.test(n);
export function listBackups(){return fs.readdirSync(BACKUPS).filter(validFile).map(name=>({name,size:fs.statSync(path.join(BACKUPS,name)).size,createdAt:fs.statSync(path.join(BACKUPS,name)).mtime.toISOString()})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function backupSiteArchive(slug){if(!slugOK(slug)||!fs.existsSync(path.join(SITES,slug)))throw new HttpError(404,'Site not found');
 const name=`site-${slug}-${new Date().toISOString().replace(/[:.]/g,'-')}.tgz`;
 const r=await cmd('tar',['-czf',path.join(BACKUPS,name),'-C',SITES,slug],60000);
 if(!r.ok)throw Error('Backup failed: '+r.err);
 return {file:name,bytes:fs.statSync(path.join(BACKUPS,name)).size};
}
export function backupFile(name){if(!validFile(name))throw new HttpError(400,'Invalid backup');const file=path.join(BACKUPS,name);if(!fs.existsSync(file))throw new HttpError(404,'Backup not found');return file;}
