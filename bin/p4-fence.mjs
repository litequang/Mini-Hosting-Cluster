// P4 managed LAB SQL admission gate. Never a whole-phone/root fencing guarantee.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
const fail=c=>{throw Error(c);},hash=s=>crypto.createHash('sha256').update(s).digest('hex');
export const P4_FENCE_PROTOCOL=1,SQL_IDLE_SECONDS=8,SQL_FRESH_MS=5000;
const ident=s=>{if(!/^[a-zA-Z0-9_]{1,64}$/.test(s))fail('P4_SQL_IDENTIFIER_INVALID');return '`'+s+'`';};
export function sqlFenceBody(lockName,appUser){
 if(!/^mhc_p4_[a-f0-9]{64}$/.test(lockName)||!/^[a-zA-Z0-9_]{1,32}$/.test(appUser))fail('P4_SQL_GATE_CONFIG_INVALID');
 return `BEGIN DECLARE mhc_owner BIGINT UNSIGNED; DECLARE mhc_alive INT DEFAULT 0;
 IF SUBSTRING_INDEX(USER(),'@',1)='${appUser}' THEN
  IF @@autocommit<>1 OR @@in_transaction<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='MHC_P4_EXPLICIT_TRANSACTION_DENIED'; END IF;
  SET mhc_owner=IS_USED_LOCK('${lockName}');
  IF mhc_owner IS NOT NULL AND mhc_owner<>CONNECTION_ID() THEN SELECT COUNT(*) INTO mhc_alive FROM information_schema.PROCESSLIST WHERE ID=mhc_owner AND USER='root' AND COMMAND IN ('Sleep','Query') AND TIME_MS>=0 AND TIME_MS<${SQL_FRESH_MS}; END IF;
  IF mhc_alive<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='MHC_P4_LEASE_REQUIRED'; END IF;
 END IF; END`;
}
export function sqlFenceStatements(schema,tables,lockName,appUser){
 ident(schema);if(!Array.isArray(tables)||!tables.length||tables.length>32||new Set(tables).size!==tables.length)fail('P4_SQL_TABLES_INVALID');
 const body=sqlFenceBody(lockName,appUser),entries=[];
 for(const table of [...tables].sort())for(const when of ['BEFORE','AFTER'])for(const event of ['INSERT','UPDATE','DELETE']){
  ident(table);const name='mhc_p4_'+hash(table).slice(0,16)+'_'+when[0].toLowerCase()+event[0].toLowerCase();
  entries.push({table,name,when,event,body,sql:`CREATE DEFINER='root'@'localhost' TRIGGER ${ident(schema)}.${ident(name)} ${when} ${event} ON ${ident(schema)}.${ident(table)} FOR EACH ROW ${body}`});
 }
 return entries;
}
// Use system uptime (Linux boot time), not a rewound Android wall clock, for local lease expiry.
export class LeaseDeadline{
 constructor(clock=()=>os.uptime()*1000){this.clock=clock;this.deadline=0;this.identity=null;}
 observe(status,nodeId,startedAt){
  const r=status?.p33,l=r?.lease,now=this.clock(),remaining=l?.expiresAt-status?.serverNow;
  if(!Number.isFinite(startedAt)||now<startedAt||now-startedAt>10000||!Number.isSafeInteger(status?.serverNow)||!l||l.nodeId!==nodeId||l.epoch!==r.epoch||l.operationId!==r.operationId||!Number.isFinite(remaining)||remaining<=10000||remaining>92000)fail('P4_LEASE_TIME_NOT_PROVEN');
  const identity=JSON.stringify([nodeId,l.epoch,l.operationId,l.expiresAt]),deadline=startedAt+remaining-1000;
  this.deadline=identity===this.identity?Math.min(this.deadline,deadline):deadline;this.identity=identity;
  if(now>=this.deadline-8000)fail('P4_LEASE_BUDGET_EXHAUSTED');return this.deadline;
 }
 valid(){return this.clock()<this.deadline-8000;}
 clear(){this.deadline=0;this.identity=null;}
}
export class SqlFenceSession{
 constructor(lockName,{spawnProcess=spawn,clock=()=>os.uptime()*1000}={}){
  if(!/^mhc_p4_[a-f0-9]{64}$/.test(lockName))fail('P4_SQL_GATE_CONFIG_INVALID');this.lockName=lockName;this.spawn=spawnProcess;this.clock=clock;this.pending=null;this.child=null;this.deadline=0;this.failed=false;this.buffer='';
 }
 async start(deadline){
  if(this.child)fail('P4_SQL_GATE_ALREADY_OPEN');this.deadline=deadline;
  const p=this.spawn('mariadb',['--no-defaults','-u','root','--batch','--skip-column-names','--unbuffered','--skip-reconnect'],{stdio:['pipe','pipe','pipe']});this.child=p;
  const broken=()=>{this.failed=true;this.pending?.reject(Error('P4_SQL_GATE_CONNECTION_LOST'));this.pending=null;};
  p.on('error',broken);p.on('exit',broken);p.stdin.on('error',broken);p.stderr.on('data',()=>{});
  p.stdout.on('data',b=>{this.buffer+=b.toString();if(this.buffer.length>4096){broken();void this.close();return;}let i;while((i=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,i).trim();this.buffer=this.buffer.slice(i+1);const pending=this.pending;if(pending){this.pending=null;line===pending.expected?pending.resolve():pending.reject(Error('P4_SQL_GATE_REPLY_INVALID'));}}});
  this.timer=setInterval(()=>{if(this.clock()>=this.deadline-8000)void this.close();},250);this.timer.unref?.();
  try{await this.query(`SET SESSION wait_timeout=${SQL_IDLE_SECONDS}; SELECT IF(GET_LOCK('${this.lockName}',0)=1,'MHC_GATE_READY','MHC_GATE_DENIED');`,'MHC_GATE_READY');}catch(e){await this.close();throw e;}
 }
 async query(sql,expected){
  if(!this.child||this.failed||this.pending||this.clock()>=this.deadline-8000)fail('P4_SQL_GATE_NOT_AUTHORIZED');
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(this.pending){this.pending=null;reject(Error('P4_SQL_GATE_TIMEOUT'));void this.close();}},1500);this.pending={expected,resolve:()=>{clearTimeout(timer);resolve();},reject:e=>{clearTimeout(timer);reject(e);}};this.child.stdin.write(sql+'\n');});
 }
 async heartbeat(deadline){this.deadline=deadline;await this.query(`SELECT IF(IS_USED_LOCK('${this.lockName}')=CONNECTION_ID(),'MHC_GATE_ALIVE','MHC_GATE_LOST');`,'MHC_GATE_ALIVE');}
 async close(){clearInterval(this.timer);const p=this.child;this.child=null;this.failed=true;this.deadline=0;if(this.pending){this.pending.reject(Error('P4_SQL_GATE_CLOSED'));this.pending=null;}if(p){p.stdin.destroy();try{p.kill('SIGKILL');}catch{}}}
}
export const fenceConfigPath=home=>path.join(home,'.config/mhc-full-installer/p4-fence.json');
export function readFenceConfig(home){
 const p=fenceConfigPath(home);if(!fs.existsSync(p))return null;const st=fs.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||st.mode&0o077)fail('P4_FENCE_CONFIG_UNSAFE');const c=JSON.parse(fs.readFileSync(p));
 if(c.schema!==1||c.protocol!==P4_FENCE_PROTOCOL||c.siteId!=='mhc-p33-wordpress-v1'||c.database!=='mhc_p33_lab'||c.user!=='mhc_p33_web'||!/^mhc_p4_[a-f0-9]{64}$/.test(c.lockName))fail('P4_FENCE_CONFIG_INVALID');return c;
}
export function inspectSqlFence(node,config=readFenceConfig(node.home)){
 if(!config)return {protocol:0,verified:false,reason:'P4_SQL_GUARD_NOT_INSTALLED'};
 const raw=node.sql("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='mhc_p33_lab' ORDER BY TABLE_NAME",true).split('\n').filter(Boolean).map(r=>r.split('\t'));
 if(raw.length<12||raw.length>32||raw.some(([t,e])=>!/^wp_[a-z_]+$/.test(t)&&t!=='mhc_p33_probe'||e!=='InnoDB'))fail('P4_MANAGED_TABLE_SCOPE_INVALID');
 const expected=sqlFenceStatements(config.database,raw.map(v=>v[0]),config.lockName,config.user);
 const actual=node.sql("SELECT TRIGGER_NAME,EVENT_OBJECT_TABLE,ACTION_TIMING,EVENT_MANIPULATION,DEFINER,SHA2(LOWER(REGEXP_REPLACE(ACTION_STATEMENT,'[[:space:]]','')),256) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='mhc_p33_lab' ORDER BY TRIGGER_NAME",true).split('\n').filter(Boolean).map(line=>{const [name,table,when,event,definer,body]=line.split('\t');return {name,table,when,event,definer,bodySha256:body};});
 const normalize=s=>s.replace(/\s+/g,'').toLowerCase();
 if(actual.length!==expected.length||expected.some(e=>!actual.some(a=>a.name===e.name&&a.table===e.table&&a.when===e.when&&a.event===e.event&&a.definer==='root@localhost'&&a.bodySha256===hash(normalize(e.body)))))fail('P4_SQL_GUARD_CHANGED');
 return {protocol:1,verified:true,tableCount:raw.length,triggerCount:actual.length,sqlFreshMs:SQL_FRESH_MS,rootIdleSeconds:SQL_IDLE_SECONDS,autocommitOnly:true,beforeAndAfter:true,guardSha256:hash(actual.map(v=>v.name+v.bodySha256).sort().join('\n'))};
}

export function sqlFenceOpen(node,config=readFenceConfig(node.home)){if(!config)return false;const owner=node.sql("SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID=IS_USED_LOCK('"+config.lockName+"') AND ID<>CONNECTION_ID() AND USER='root' AND TIME_MS>=0 AND TIME_MS<"+SQL_FRESH_MS,true);return owner==='1';}
export function closeSqlFence(node,config=readFenceConfig(node.home)){if(!config)return;const id=node.sql("SELECT COALESCE(MAX(ID),0) FROM information_schema.PROCESSLIST WHERE ID=IS_USED_LOCK('"+config.lockName+"') AND ID<>CONNECTION_ID() AND USER IN ('root','mhc_p33_web')",true);if(!/^\d+$/.test(id))fail('P4_SQL_OWNER_INVALID');if(id!=='0'){try{node.sql('KILL CONNECTION '+id,true);}catch{if(sqlFenceOpen(node,config))fail('P4_SQL_GATE_CLOSE_FAILED');}}}
