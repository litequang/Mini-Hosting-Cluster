// Background traffic policy only. Writer/lease/fencing requests never consult these budgets.
export function classifyAuthorityError(error){
 const code=error?.message||'',status=error?.status;
 if(/QUOTA/.test(code))return 'quota';
 if(status===429||/RATE_LIMIT/.test(code))return 'rateLimit';
 if([401,403].includes(status)||/UNAUTHORIZED|ROLE_DENIED|TOKEN_INVALID/.test(code))return 'auth';
 if(/TIMEOUT/.test(code)||['TimeoutError','AbortError'].includes(error?.name))return 'timeout';
 if(/UNREACHABLE/.test(code))return 'network';
 if(status>=500||/UNAVAILABLE/.test(code))return 'server';
 return 'rejected';
}
export class BackgroundBackoff{
 constructor({base=3000,max=300000,random=Math.random,now=Date.now}={}){this.base=base;this.max=max;this.random=random;this.now=now;this.failures=0;this.nextAt=0;}
 ready(){return this.now()>=this.nextAt;}
 success(){this.failures=0;this.nextAt=0;}
 failure(error){const kind=classifyAuthorityError(error),floor=['quota','auth'].includes(kind)?60000:kind==='rateLimit'?30000:this.base,delay=Math.min(this.max,Math.max(floor,this.base*2**Math.min(this.failures++,8)));this.nextAt=this.now()+Math.min(this.max,Math.round(delay*(1+this.random()*.2)));return {kind,nextAt:this.nextAt};}
}
// One initial read; after an ambiguous reply or replay, read the sequence again before publishing.
export class HeartbeatSequence{
 constructor(){this.sequence=null;this.identity=null;}
 async send(identity,status,publish){
  if(this.identity!==identity){this.sequence=null;this.identity=identity;}
  try{if(this.sequence===null)this.sequence=(await status()).callerSequence;
   if(!Number.isSafeInteger(this.sequence)||this.sequence<0)throw Error('AUTHORITY_HEARTBEAT_SEQUENCE_INVALID');
   const sent=this.sequence+1,result=await publish(sent);
   if(result.callerSequence!==sent)throw Error('AUTHORITY_HEARTBEAT_SEQUENCE_MISMATCH');
   this.sequence=sent;return result;
  }catch(error){this.sequence=null;throw error;}
 }
}
