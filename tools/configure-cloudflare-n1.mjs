// One initial grant; value travels through hidden stdin and Wrangler stdin only.
import {spawnSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
export const ACCOUNT='35b2468610cfa060d5d02865b7996a74';
export function wranglerAuthorization(root){
 const env={...process.env,CLOUDFLARE_ACCOUNT_ID:ACCOUNT};for(const key of ['CLOUDFLARE_API_TOKEN','CF_API_TOKEN','CLOUDFLARE_API_KEY','CF_API_KEY','CLOUDFLARE_EMAIL','CF_EMAIL'])delete env[key];
 const args=['exec','--yes','--package=wrangler@4.152.0','--','wrangler','auth','token','--json'],options={cwd:root,encoding:'utf8',timeout:90000,maxBuffer:65536,windowsHide:true,env,stdio:['ignore','pipe','pipe']};
 const r=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','npm.cmd '+args.join(' ')],options):spawnSync('npm',args,options);
 if(r.status!==0)throw Error('N1_WORKER_LOGIN_REQUIRED');let data;try{data=JSON.parse(r.stdout);}catch{throw Error('N1_WORKER_LOGIN_REQUIRED');}
 const authorization=data.token||data.access_token;if(typeof authorization!=='string'||authorization.length<25||authorization.length>8192||/\s/.test(authorization))throw Error('N1_WORKER_LOGIN_REQUIRED');return authorization;
}
export async function putTunnelSecret(token,{getAuthorization,fetcher=fetch}={}){
 const authorization=await getAuthorization(),base='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/mhc-cluster-authority-lab';
 async function request(method,suffix,body){let response;try{response=await fetcher(base+suffix,{method,headers:{authorization:'Bearer '+authorization,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw Error('N1_WORKER_API_UNREACHABLE');}
  if(response.status===401)throw Error('N1_WORKER_LOGIN_REQUIRED');if(response.status===403)throw Error('N1_WORKER_SECRET_WRITE_PERMISSION_REQUIRED');if(!response.ok)throw Error('N1_WORKER_API_HTTP_'+response.status);
  let raw='',size=0;for await(const b of response.body||[]){size+=b.length;if(size>262144)throw Error('N1_WORKER_REPLY_TOO_LARGE');raw+=new TextDecoder().decode(b);}let data;try{data=JSON.parse(raw);}catch{throw Error('N1_WORKER_REPLY_INVALID');}if(data.success!==true)throw Error('N1_WORKER_API_REJECTED');return data.result;
 }
 const settings=await request('GET','/settings');if(settings?.bindings?.find(b=>b.name==='MHC_AUTHORITY')?.namespace_id!=='c941ad9ddcaa4dfdbe474d429a37d8f8')throw Error('N1_WORKER_NAMESPACE_MISMATCH');
 const saved=await request('PUT','/secrets',{name:'MHC_N1_CF_TOKEN',text:token,type:'secret_text'});if(saved?.name!=='MHC_N1_CF_TOKEN'||saved.type!=='secret_text')throw Error('N1_WORKER_SECRET_REPLY_INVALID');
}
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
 return configureTunnelSecret(token,{putSecret:value=>putTunnelSecret(value,{getAuthorization:()=>wranglerAuthorization(root)})});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(/^N1_[A-Z0-9_]+$/.test(e.message)?e.message:'N1_SECRET_SETUP_FAILED');process.exitCode=1;});
