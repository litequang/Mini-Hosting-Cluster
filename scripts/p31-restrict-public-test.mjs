#!/usr/bin/env node
// Remove only unused MariaDB default test-schema PUBLIC privileges on the two LAB nodes.
// Does not remove databases, users, passwords, application grants or other PUBLIC scopes.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const home=os.homedir(),prefix=process.env.PREFIX||'',fail=c=>{throw Error(c);};
function sql(query){const r=spawnSync('mariadb',['--no-defaults','-u','root','-N','-B','--raw'],{input:query+'\n',encoding:'utf8',timeout:10000,maxBuffer:32768});if(r.status!==0)fail('P31_PUBLIC_SQL_FAILED');return r.stdout.trim();}
try{
 const {LAB_NODES,supportedRuntime}=await import(pathToFileURL(path.join(home,'.local/share/mhc-full-installer/bin/source-upgrade.mjs')));
 if(!supportedRuntime(process.platform,prefix))fail('P31_TERMUX_ONLY');
 const root=path.join(home,'.config/mhc-full-installer'),id=JSON.parse(fs.readFileSync(path.join(root,'node-identity.json'))).nodeId;
 if(!LAB_NODES.includes(id)||fs.readFileSync(path.join(root,'installed'),'utf8').trim()!=='TEST 0.5.0C-REMOTE-PANEL installed on clean Termux'||['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'].some(p=>fs.existsSync(path.join(home,p))))fail('P31_NOT_APPROVED_LAB');
 if(sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='test' OR LEFT(table_schema,5)='test_'")!=='0'||sql("SELECT COUNT(*) FROM mysql.db WHERE (Db='test' OR LEFT(Db,4)='test') AND User<>'PUBLIC'")!=='0')fail('P31_DEFAULT_TEST_DATABASE_IN_USE');
 const raw=sql('SHOW GRANTS FOR PUBLIC'),lines=raw?raw.split('\n'):[],targets=[];
 for(const line of lines){if(/^GRANT USAGE ON \*\.\* TO /.test(line))continue;const m=/^GRANT [A-Z ,]+ ON (.+) TO `?PUBLIC`?$/.exec(line);if(!m||!['`test`.*','`test\\_%`.*'].includes(m[1]))fail('P31_UNREVIEWED_PUBLIC_GRANT');targets.push(m[1]);}
 if(process.argv[2]==='--plan'){console.log(JSON.stringify({nodeId:id,unusedDefaultTestScopes:targets.length,changesApplicationGrants:false,changesPasswords:false}));}
 else if(process.argv[2]==='--apply'){
  if(!targets.length){console.log('P31_PUBLIC_DEFAULT_TEST_ALREADY_RESTRICTED');}
  else{
   const base=path.join(home,'.local/state/mhc-p31-lab');if(fs.lstatSync(base).isSymbolicLink())fail('P31_UNSAFE_BACKUP_DIRECTORY');
   const backup=path.join(base,'public-test-grants-'+crypto.randomUUID()+'.sql');fs.writeFileSync(backup,lines.map(s=>s+';').join('\n')+'\n',{flag:'wx',mode:0o600});
   try{for(const scope of targets)sql('REVOKE ALL PRIVILEGES ON '+scope+' FROM PUBLIC;');const after=sql('SHOW GRANTS FOR PUBLIC');if(after&&!/^GRANT USAGE ON \*\.\* TO `?PUBLIC`?$/.test(after))fail('P31_PUBLIC_REVOKE_VERIFY_FAILED');}
   catch(e){sql(lines.map(s=>s+';').join('\n'));throw e;}
   console.log(JSON.stringify({status:'P31_PUBLIC_DEFAULT_TEST_RESTRICTED',nodeId:id,backup,applicationGrantsUnchanged:true,passwordsUnchanged:true}));
  }
 }else fail('P31_USE_PLAN_OR_APPLY');
}catch(e){console.error(/^P31_[A-Z_]+$/.test(e.message)?e.message:'P31_PUBLIC_RESTRICTION_FAILED');process.exitCode=1;}
