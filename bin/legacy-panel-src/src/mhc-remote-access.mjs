// Explicit Cloudflare Access protection for the original localhost-only Panel 9090.
// Never trust X-Forwarded-Host or an unsigned Cf-Access-Jwt-Assertion.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ROOT} from './config.mjs';
const CONF=path.join(ROOT,'data','remote-access.json');
const HOST=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const TEAM=/^[a-z0-9-]{1,63}\.cloudflareaccess\.com$/;
const AUD=/^[A-Za-z0-9_-]{32,128}$/;
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
let cache={team:'',expires:0,keys:[]};
export function config(){
 try{
  const st=fs.lstatSync(CONF);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>4096) return null;
  const c=JSON.parse(fs.readFileSync(CONF,'utf8'));
  if(c.schema!==1||!HOST.test(c.hostname)||!TEAM.test(c.teamDomain)||!AUD.test(c.audience)||c.hostname===c.teamDomain)return null;
  const applications=c.applications??[];
  if(!Array.isArray(applications)||applications.length>3)return null;
  const seen=new Set([c.hostname]);
  for(const a of applications){if(!a||!HOST.test(a.hostname)||!TEAM.test(a.teamDomain)||!AUD.test(a.audience)||a.hostname===a.teamDomain||seen.has(a.hostname))return null;seen.add(a.hostname);}
  return {hostname:c.hostname,teamDomain:c.teamDomain,audience:c.audience,applications:applications.map(a=>({hostname:a.hostname,teamDomain:a.teamDomain,audience:a.audience}))};
 }catch{return null;}
}
export function publicStatus(){const c=config();return {configured:!!c,remoteHostname:c?.hostname||null,remoteHostnames:c?[c.hostname,...c.applications.map(a=>a.hostname)]:[],accessJwtRequired:true,usesOriginalPanel:true,port:9090,cloudflareAccessDeploymentVerified:false,controllerRoleVerified:false,notice:c?'Remote HTTPS requires a verified Cloudflare Access JWT for the exact hostname/application. Panel password remains available only on localhost/SSH forwarding.':'Remote panel is disabled. Localhost/SSH forwarding remains available.'};}
function decode64(s){if(s.length>16384||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid JWT encoding');return Buffer.from(s,'base64url');}
async function keysFor(team,fetcher){
 if(cache.team===team&&Date.now()<cache.expires&&cache.keys.length)return cache.keys;
 const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),4000);
 try{
  const response=await fetcher(`https://${team}/cdn-cgi/access/certs`,{signal:ac.signal,redirect:'error',cache:'no-store'});
  if(!response.ok)throw Error('No Access certs');
  const raw=await response.text();if(raw.length>65536)throw Error('Oversized Access certs');
  const json=JSON.parse(raw);
  const keys=(Array.isArray(json.keys)?json.keys:[]).filter(k=>k.kty==='RSA'&&k.alg==='RS256'&&typeof k.kid==='string'&&k.kid.length<256&&typeof k.n==='string'&&typeof k.e==='string');
  if(!keys.length||keys.length>16)throw Error('No acceptable Access key');
  cache={team,keys,expires:Date.now()+300000};return keys;
 }finally{clearTimeout(timer);}
}

// Internal-only, rate-limited rejection codes. Never log JWTs, cookies, claims or raw host values.
const deniedAt=new Map();
function deny(reason){
 const now=Date.now();
 if(now-(deniedAt.get(reason)||0)>30000){
  deniedAt.set(reason,now);
  console.warn('MHC_REMOTE_ACCESS_DENIED',reason);
 }
 return null;
}
export async function verifyAccess(token,c,fetcher=fetch,onReject=()=>{}){
 const reject=reason=>{onReject(reason);return false;};
 if(token===undefined||token===null||token==='')return reject('JWT_MISSING');
 if(typeof token!=='string'||token.length>12000||!TOKEN.test(token))return reject('JWT_FORMAT');
 try{
  const parts=token.split('.');
  const header=JSON.parse(decode64(parts[0]).toString('utf8'));
  const claims=JSON.parse(decode64(parts[1]).toString('utf8'));
  if(!header||typeof header!=='object'||Array.isArray(header))return reject('JWT_HEADER_INVALID');
  if(header.alg!=='RS256')return reject('JWT_ALG_UNSUPPORTED');
  // RFC 7519 §5.1 makes "typ" optional. If specified, it must identify a JWT.
  if(header.typ!==undefined&&(typeof header.typ!=='string'||header.typ.toUpperCase()!=='JWT'))return reject('JWT_TYP_UNSUPPORTED');
  if(typeof header.kid!=='string'||header.kid.length===0||header.kid.length>256)return reject('JWT_KID_INVALID');
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!==`https://${c.teamDomain}`)return reject('JWT_ISSUER_MISMATCH');
  if(!(Array.isArray(claims.aud)?claims.aud.includes(c.audience):claims.aud===c.audience))return reject('JWT_AUDIENCE_MISMATCH');
  if(!Number.isSafeInteger(claims.exp)||claims.exp<=now)return reject('JWT_EXPIRED_OR_INVALID');
  if(claims.exp>now+86400)return reject('JWT_EXPIRY_OVER_POLICY');
  if(claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now+30))return reject('JWT_NOT_YET_VALID');
  if(claims.iat!==undefined&&(!Number.isSafeInteger(claims.iat)||claims.iat>now+30))return reject('JWT_IAT_IN_FUTURE');
  let keys;
  try{keys=await keysFor(c.teamDomain,fetcher);}catch{return reject('JWKS_FETCH_FAILED');}
  const jwk=keys.find(k=>k.kid===header.kid);
  if(!jwk)return reject('JWKS_KID_UNKNOWN');
  if(!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key:jwk,format:'jwk'}),decode64(parts[2])))return reject('JWT_SIGNATURE_INVALID');
  return true;
 }catch{return reject('JWT_PARSE_OR_CRYPTO_ERROR');}
}
export async function authorizeRequest(req,port,fetcher=fetch){
 const host=String(req.headers.host||'').toLowerCase();
 if(host===`127.0.0.1:${port}`||host===`localhost:${port}`)return {remote:false,host};
 const base=config();
 if(!base)return deny('REMOTE_CONFIG_INVALID');
 const c=[base,...base.applications].find(a=>host===a.hostname||host===a.hostname+':443');
 // Some reverse proxies include the standard HTTPS port in Host.
 if(!c)return deny('HOST_MISMATCH');
 let reason='JWT_REJECTED';
 if(!(await verifyAccess(req.headers['cf-access-jwt-assertion'],c,fetcher,r=>{reason=r;})))return deny(reason);
 return {remote:true,host};
}
