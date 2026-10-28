// One initial grant; value travels through hidden stdin and Wrangler stdin only.
import {spawnSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
export const ACCOUNT='35b2468610cfa060d5d02865b7996a74';
export async function configureTunnelSecret(token,{fetcher=fetch,putSecret}={}){
 if(!/^[A-Za-z0-9._~-]{25,256}$/.test(token))throw Error('N1_API_TOKEN_FORMAT_INVALID');
 let response;try{response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/cfd_tunnel?is_deleted=false&per_page=1',{headers:{authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw Error('N1_CF_PERMISSION_CHECK_UNREACHABLE');}
 if(!response.ok)throw Error('N1_CF_TUNNEL_PERMISSION_REQUIRED');
 let raw='',size=0;for await(const b of response.body||[]){size+=b.length;if(size>262144)throw Error('N1_CF_REPLY_TOO_LARGE');raw+=new TextDecoder().decode(b);}
 let data;try{data=JSON.parse(raw);}catch{throw Error('N1_CF_REPLY_INVALID');}if(data.success!==true||!Array.isArray(data.result))throw Error('N1_CF_PERMISSION_CHECK_FAILED');
 await putSecret(token);return {secretInstalled:true,scope:'LAB_TUNNEL_PROVISIONING',account:ACCOUNT,changesDns:false,changesPrimary:false};
}
async function main(){let token='';for await(const b of process.stdin){token+=b;if(token.length>512)throw Error('N1_API_TOKEN_FORMAT_INVALID');}token=token.trim();
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 return configureTunnelSecret(token,{putSecret:async value=>{
  const config=path.join(root,'reference/cluster-authority/wrangler.toml');
  const args=['exec','--yes','--package=wrangler@4.152.0','--','wrangler','secret','put','MHC_N1_CF_TOKEN','--config',config];
  // This command is fixed; the credential is never a shell argument or environment variable.
  const options={cwd:root,input:value+'\n',encoding:'utf8',timeout:120000,maxBuffer:131072,windowsHide:true,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT}};
  const r=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','npm.cmd '+args.slice(0,-1).join(' ')+' "'+config+'"'],options):spawnSync('npm',args,options);
  if(r.status!==0)throw Error('N1_WORKER_SECRET_INSTALL_FAILED');
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(/^N1_[A-Z0-9_]+$/.test(e.message)?e.message:'N1_SECRET_SETUP_FAILED');process.exitCode=1;});
