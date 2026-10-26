#!/usr/bin/env node
// Read-only suitability report; never changes Android services or database.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {readConfig,health} from './cli.mjs';
function run(name,args){try{return execFileSync(name,args,{encoding:'utf8',timeout:7000,stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}}
const SQL='SELECT @@global.log_bin, @@global.gtid_strict_mode, @@global.server_id, @@global.read_only, @@global.gtid_current_pos';
const mysql=run('mariadb',['--no-defaults','-u','root','-N','-B','-e',SQL]);
const fields=mysql?.split('\t')||[];
const slave=run('mariadb',['--no-defaults','-u','root','-e','SHOW SLAVE STATUS\\G'])||'';
const c=readConfig(),h=health();
const configRoot=path.join(os.homedir(),'.config/mini-hosting-cluster');
const seal=(()=>{try{return JSON.parse(fs.readFileSync(path.join(configRoot,'file-seal.json'),'utf8'));}catch{return null;}})();
const armed=(()=>{try{return JSON.parse(fs.readFileSync(path.join(configRoot,'control.json'),'utf8')).armed===true;}catch{return false;}})();
const result={version:'0.3',identity:{clusterId:c?.clusterId||null,nodeId:c?.nodeId||null,declaredRole:c?.role||null},
 cloudEnrolled:fs.existsSync(path.join(configRoot,'online.json')),armed,
 services:h.services,mariaDb:{reachable:!!mysql,logBin:fields[0]==='1',gtidStrict:fields[1]==='1',serverId:fields[2]||null,readOnly:fields[3]==='1',gtid:fields[4]||null,
 replicaIo:/Slave_IO_Running:\s+Yes/.test(slave),replicaSql:/Slave_SQL_Running:\s+Yes/.test(slave),lagZero:/Seconds_Behind_Master:\s+0\b/.test(slave)},
 sheetSeal:seal?{digest:seal.digest,count:seal.fileCount,createdAt:seal.createdAt}:null,
 safety:{automaticUnplannedFailoverSupported:false,remoteFencingVerified:false,realTimeSheetSyncVerified:false,advice:'Do not arm until MariaDB GTID replication, file sync, and external routing/fencing are verified.'}};
console.log(JSON.stringify(result,null,2));
