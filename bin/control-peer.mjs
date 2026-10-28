// Existing forced-command SSH channel, with operator-pinned N-node membership and host keys.
import path from 'node:path';import os from 'node:os';import fs from 'node:fs';import {execFile} from 'node:child_process';
import {ControlNode,controlConfig,controlConfigured} from './control-node.mjs';
export {controlConfigured};
export async function controlPeerEnvelope(nodeId,request){
 const home=process.env.HOME||os.homedir(),c=controlConfig(home);if(c.transport==='authority')throw Error('CONTROL_SITE_PEER_UNAVAILABLE');const p=c.peers.find(n=>n.nodeId===nodeId);if(!p||request.nodeId!==nodeId)throw Error('CONTROL_PEER_NOT_APPROVED');
 const management=request.action==='control-ready';if(management?p.kind!=='control-only':p.kind!=='site'||!['p33-ready','p33-fence','p33-activate','p33-active'].includes(request.action))throw Error('CONTROL_PEER_ACTION_DENIED');
 if(nodeId===c.nodeId){const envelope=management?await new ControlNode().proof(request.nonce):await new(await import('./p33-node.mjs')).ManagedNode().accept(request);return {envelope,publicKey:p.publicKey,clusterId:c.clusterId};}
 const dir=path.join(home,'.config/mhc-full-installer'),key=path.join(dir,c.keyFlavor==='N1'?'../../.ssh/id_ed25519_mhc_node':'p31/ssh-key'),hosts=path.join(dir,'control-known-hosts');
 for(const f of [key,hosts]){let at=home;for(const part of path.relative(home,f).split(path.sep)){at=path.join(at,part);if(fs.lstatSync(at,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('CONTROL_PEER_KEY_OR_HOSTS_UNSAFE');}const st=fs.lstatSync(f);if(!st.isFile()||st.isSymbolicLink()||st.mode&0o077)throw Error('CONTROL_PEER_KEY_OR_HOSTS_UNSAFE');}
 const envelope=await new Promise((resolve,reject)=>{const proc=execFile('ssh',['-F','/dev/null','-T','-p',String(p.port),'-i',key,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','UserKnownHostsFile='+hosts,'-o','ConnectTimeout=4',p.user+'@'+p.host,management?'mhc-control':'mhc-p31'],{timeout:25000,maxBuffer:32768,encoding:'utf8'},(error,out,stderr)=>{if(error)return reject(Error(/^(?:CONTROL|P31|P33)_[A-Z0-9_]{1,90}$/.test(String(stderr).trim())?String(stderr).trim():'CONTROL_PEER_UNAVAILABLE'));try{resolve(JSON.parse(out));}catch{reject(Error('CONTROL_PEER_REPLY_INVALID'));}});proc.stdin.end(JSON.stringify(request)+'\n');});
 return {envelope,publicKey:p.publicKey,clusterId:c.clusterId};
}
