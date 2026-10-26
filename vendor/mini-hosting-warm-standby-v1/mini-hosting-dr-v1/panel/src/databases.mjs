import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {databaseOK,HttpError} from './security.mjs';
import {BACKUPS,TERMUX,atomicJson,readJson,DATA} from './config.mjs';
import {cmd} from './system.mjs';
const cli=path.join(TERMUX,'bin/mariadb');
const dump=path.join(TERMUX,'bin/mariadb-dump');
const DBMETA=path.join(DATA,'databases.json');
const id=s=>{if(!databaseOK(s))throw new HttpError(400,'Invalid database or username');return s;};
async function sql(query){const r=await cmd(cli,['--no-defaults','-u','root','-N','-B','-e',query],20000);if(!r.ok)throw new HttpError(500,'MariaDB: '+r.err.slice(0,1000));return r.out;}
export async function listDatabases(){const out=await sql('SHOW DATABASES;');const reserved=['mysql','information_schema','performance_schema','sys','test'];return out.split('\n').filter(n=>n&&!reserved.includes(n));}
export async function createDatabase(name){id(name);if(['mysql','sys','test'].includes(name))throw new HttpError(400,'Reserved database');const user=id('u_'+name).slice(0,30); // username length <= 32 on MariaDB
 const password=crypto.randomBytes(24).toString('hex');
 const exists=(await listDatabases()).includes(name);if(exists)throw new HttpError(409,'Database exists');
 await sql(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
 await sql(`CREATE USER IF NOT EXISTS '${user}'@'127.0.0.1' IDENTIFIED BY '${password}'`);
 await sql(`GRANT ALL PRIVILEGES ON \`${name}\`.* TO '${user}'@'127.0.0.1'`);
 const meta=readJson(DBMETA,{});meta[name]={user,createdAt:new Date().toISOString()};atomicJson(DBMETA,meta);
 return {database:name,user,password,host:'127.0.0.1',port:3306,warning:'Store this password now; it will not be shown again.'};
}
export async function listTables(name){id(name);if(!(await listDatabases()).includes(name))throw new HttpError(404,'Database not found');const out=await sql(`SHOW TABLES FROM \`${name}\``);return out?out.split('\n'):[];}
export async function backupDatabase(name){id(name);if(!(await listDatabases()).includes(name))throw new HttpError(404,'Database not found');
 const dest=path.join(BACKUPS,`db-${name}-${new Date().toISOString().replace(/[:.]/g,'-')}.sql`);
 await new Promise((resolve,reject)=>{const stream=fs.createWriteStream(dest,{mode:0o600});const child=spawn(dump,['--no-defaults','-u','root','--single-transaction','--quick','--',name],{stdio:['ignore','pipe','pipe']});let err='';child.stderr.on('data',d=>err+=String(d).slice(0,2000));child.stdout.pipe(stream);child.on('error',reject);child.on('close',code=>{stream.end(()=>code===0?resolve():reject(Error('MariaDB dump failed: '+err)));});});
 return {file:path.basename(dest),bytes:fs.statSync(dest).size};
}
export async function restoreDatabase(name,filepath){id(name);if(!(await listDatabases()).includes(name))throw new HttpError(404,'Database not found');
 const max=10*1024*1024;const stat=fs.statSync(filepath);if(stat.size>max)throw new HttpError(413,'SQL restore max 10MB');
 return await new Promise((resolve,reject)=>{const child=spawn(cli,['--no-defaults','-u','root',name],{stdio:['pipe','ignore','pipe']});let err='';child.stderr.on('data',d=>err+=String(d).slice(0,3000));fs.createReadStream(filepath).pipe(child.stdin);child.on('error',reject);child.on('close',code=>code===0?resolve({restored:name}):reject(Error('SQL restore failed: '+err)));});
}
