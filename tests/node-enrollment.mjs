// End-to-end SSH-RPC enrollment under disposable HOME directories; no real network or Termux services touched.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]||'.');
const js=path.join(root,'bin/node-enroll.mjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-node-test-'));
const coordinator=path.join(temp,'controller'),candidate=path.join(temp,'candidate'),candidate2=path.join(temp,'candidate2'),bin=path.join(temp,'bin');
let checks=0;function check(x,message){assert.ok(x,message);checks++;}
function file(h,name){return path.join(h,'.config/mhc-full-installer',name);}
function mkdir(h){fs.mkdirSync(path.dirname(file(h,'installed')),{recursive:true,mode:0o700});fs.writeFileSync(file(h,'installed'),'TEST 0.3.3 installed on clean Termux\n',{mode:0o600});}
function run(h,...args){const opts={input:'',...((typeof args.at(-1)==='object'&&!Array.isArray(args.at(-1)))?args.pop():{})};const result=spawnSync('node',[js,...args],{env:{...process.env,HOME:h,PATH:`${bin}:${process.env.PATH}`,MHC_CONTROLLER_HOME:coordinator,MHC_ENROLL_JS:js,MHC_SSH_ARGS:path.join(temp,'ssh-args')},encoding:'utf8',input:opts.input,timeout:15000});return {status:result.status,stdout:result.stdout||'',stderr:result.stderr||''};}
try{
  mkdir(coordinator);mkdir(candidate);mkdir(candidate2);fs.mkdirSync(bin,{recursive:true});
  const fake=path.join(bin,'ssh');fs.writeFileSync(fake,`#!/bin/sh\nprintf '%s\\n' "$@" > "$MHC_SSH_ARGS"\ncase "$*" in *heartbeat-accept*) action=heartbeat-accept;; *) action=accept;; esac\nexec env HOME="$MHC_CONTROLLER_HOME" node "$MHC_ENROLL_JS" "$action"\n`,{mode:0o700});
  let r=run(coordinator,'init','Lab Manager');check(r.status===0,'controller identity created');
  const identity=JSON.parse(fs.readFileSync(file(coordinator,'node-identity.json')));check(Boolean(identity.nodeId),'controller id present');
  check((fs.statSync(file(coordinator,'node-identity.json')).mode&0o077)===0,'identity private');
  r=run(coordinator,'cluster-init');check(r.status===0,'controller inventory cluster created');
  r=run(coordinator,'cluster-init');check(r.status!==0,'cannot replace controller cluster silently');
  r=run(coordinator,'invite','10');check(r.status===0,'invite created');
  const invite=r.stdout.split('\n').find(x=>/^[A-Za-z0-9_-]{32}$/.test(x));check(Boolean(invite),'one-use invite displayed once');
  const disk=fs.readFileSync(file(coordinator,'pending-invite.json'),'utf8');check(!disk.includes(invite),'invite plaintext not stored');
  r=run(coordinator,'invite','10');check(r.status!==0,'second active invite refused');
  r=run(candidate,'init','Lab Candidate');check(r.status===0,'candidate identity created');
  r=run(candidate,'join','192.168.1.10','u0_a123','8022',{input:'bad-token\n'});check(r.status!==0,'bad invite format rejected');
  r=run(candidate,'join','192.168.1.10','u0_a123','8022',{input:'A'.repeat(32)+'\n'});check(r.status!==0,'wrong invite refused by coordinator');
  check(fs.existsSync(file(coordinator,'pending-invite.json')),'wrong invite does not consume real invite');
  r=run(candidate,'join','192.168.1.10','u0_a123','8022',{input:invite+'\n'});
  check(r.status===0,`candidate paired: ${r.stderr}`);
  check(!fs.existsSync(file(coordinator,'pending-invite.json')),'used invitation consumed');
  const joined=JSON.parse(fs.readFileSync(file(candidate,'joined.json')));
  check(joined.mode==='inventory-only'&&joined.state==='enrolled-unverified','not a replica or HA authority');
  check((fs.statSync(file(candidate,'joined.json')).mode&0o077)===0,'membership private');
  const flags=fs.readFileSync(path.join(temp,'ssh-args'),'utf8');
  check(flags.includes('StrictHostKeyChecking=yes')&&flags.includes('BatchMode=yes'),'pinned SSH + key-based authentication enforced');
  check(!flags.includes(invite),'secret never included in SSH command arguments');
  r=run(candidate,'join','192.168.1.10','u0_a123','8022',{input:invite+'\n'});check(r.status!==0,'candidate refuses duplicate join');
  r=run(coordinator,'list');const result=JSON.parse(r.stdout);check(result.nodes.length===2&&result.nodes[1].verification==='ssh-authenticated-pairing-only','controller records paired node');
  check(result.nodes[1].replicaReady===false&&result.nodes[1].haEligible===false,'no ready/HA assertions');
  check(!r.stdout.includes('heartbeatTokenHash'),'node list never reveals heartbeat credential hash');
  r=run(candidate,'status');check(r.status===0&&!r.stdout.includes('token'),'candidate status never discloses credentials');
  r=run(candidate,'heartbeat');check(r.status===0,`authenticated heartbeat accepted: ${r.stderr}`);
  r=run(coordinator,'list');const withHeartbeat=JSON.parse(r.stdout);
  check(withHeartbeat.nodes[1].observation==='recent-authenticated-heartbeat','recent heartbeat distinguished from readiness');
  check(withHeartbeat.nodes[1].replicaReady===false&&withHeartbeat.nodes[1].haEligible===false,'heartbeat not proof of HA');
  const secret=JSON.parse(fs.readFileSync(file(candidate,'node-auth.json'))).token;
  check(!r.stdout.includes(secret),'heartbeat auth secret not revealed in node list');
  check((fs.statSync(file(candidate,'node-auth.json')).mode&0o077)===0,'node heartbeat auth private');
  r=run(candidate,'heartbeat');check(r.status===0,'monotonic second heartbeat accepted');
  const stale=JSON.parse(fs.readFileSync(file(candidate,'node-auth.json')));
  stale.seq=0;fs.writeFileSync(file(candidate,'node-auth.json'),JSON.stringify(stale));
  r=run(candidate,'heartbeat');check(r.status!==0,'old sequence replay refused');

  // Third node uses same generic codebase and its own one-use invite (not hard-coded to M51/X7b).
  r=run(coordinator,'invite','10');check(r.status===0,'third-node invitation issued');
  const invite2=r.stdout.split('\n').find(x=>/^[A-Za-z0-9_-]{32}$/.test(x));
  r=run(candidate2,'init','Lab Third');check(r.status===0,'third phone identity initialized');
  r=run(candidate2,'join','192.168.1.10','u0_a123','8022',{input:invite2+'\n'});check(r.status===0,'third phone joined');
  r=run(coordinator,'list');check(JSON.parse(r.stdout).nodes.length===3,'registry supports more than two phones');
  const target=result.nodes[1].nodeId;
  r=run(coordinator,'remove',target);check(r.status!==0,'removal requires confirmation');
  r=run(coordinator,'remove',target,'--confirm=REMOVE_FROM_INVENTORY');check(r.status===0,'explicit inventory removal');
  r=run(coordinator,'list');check(JSON.parse(r.stdout).nodes.length===2,'removed only selected node from inventory');
  r=run(coordinator,'invite','1');check(r.status===0,'new invitation can be issued');
  let inv=JSON.parse(fs.readFileSync(file(coordinator,'pending-invite.json'),'utf8'));inv.expiresAt=Date.now()-1;
  fs.writeFileSync(file(coordinator,'pending-invite.json'),JSON.stringify(inv),{mode:0o600});
  r=run(coordinator,'accept',{input:JSON.stringify({protocol:'mhc-full-enroll-v1',nodeId:target,label:'TEST',nonce:'a'.repeat(32),token:'B'.repeat(32),capability:{}})});
  check(r.status!==0,'expired invitation refused');
  r=run(coordinator,'revoke-invite');check(r.status===0&&!fs.existsSync(file(coordinator,'pending-invite.json')),'revoke works');
  const restricted=spawnSync('node',[js,'rpc'],{env:{...process.env,HOME:coordinator,SSH_ORIGINAL_COMMAND:'rm -rf /'},encoding:'utf8',input:'{}'});
  check(restricted.status!==0&&restricted.stderr.includes('rejects this operation'),'restricted SSH command cannot execute arbitrary command');
  // Reject destructive/production-looking state for all mutation commands.
  fs.mkdirSync(path.join(coordinator,'apps/thophuongpro'),{recursive:true});fs.writeFileSync(path.join(coordinator,'apps/thophuongpro/.env'),'secret');
  r=run(coordinator,'invite','10');check(r.status!==0,'production .env safety guard');
  console.log(`PASS: v0.3B SSH inventory enrollment — ${checks} assertions (multi-node, one-use token, expiry, replay, pinned SSH, forced command, inventory, prod guard)`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
