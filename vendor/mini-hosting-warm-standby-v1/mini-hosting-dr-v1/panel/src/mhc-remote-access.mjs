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
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||st.size>2048) return null;
  const c=JSON.parse(fs.readFileSync(CONF,'utf8'));
  if(c.schema!==1||!HOST.test(c.hostname)||!TEAM.test(c.teamDomain)||!AUD.test(c.audience)||c.hostname===c.teamDomain)return null;
  return {hostname:c.hostname,teamDomain:c.teamDomain,audience:c.audience};
 }catch{return null;}
}
export function publicStatus(){const c=config();return {configured:!!c,remoteHostname:c?.hostname||null,accessJwtRequired:true,usesOriginalPanel:true,port:9090,cloudflareAccessDeploymentVerified:false,controllerRoleVerified:false,notice:c?'Remote HTTPS requires a valid Cloudflare Access JWT AND Panel password. This configuration does not create a Tunnel, Access policy or controller.':'Remote panel is disabled. Localhost/SSH forwarding remains available.'};}
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
export async function verifyAccess(token,c,fetcher=fetch){
 if(typeof token!=='string'||token.length>12000||!TOKEN.test(token))return false;
 try{
  const parts=token.split('.');const header=JSON.parse(decode64(parts[0]).toString('utf8'));
  const claims=JSON.parse(decode64(parts[1]).toString('utf8'));
  if(header.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string'||header.kid.length>256)return false;
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!==`https://${c.teamDomain}`||!(Array.isArray(claims.aud)?claims.aud.includes(c.audience):claims.aud===c.audience)||
    !Number.isSafeInteger(claims.exp)||claims.exp<=now||claims.exp>now+86400||
    (claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now+30))||
    (claims.iat!==undefined&&(!Number.isSafeInteger(claims.iat)||claims.iat>now+30)))return false;
  const keys=await keysFor(c.teamDomain,fetcher);
  const jwk=keys.find(k=>k.kid===header.kid);if(!jwk)return false;
  return crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key:jwk,format:'jwk'}),decode64(parts[2]));
 }catch{return false;}
}
export async function authorizeRequest(req,port,fetcher=fetch){
 const host=String(req.headers.host||'').toLowerCase();
 if(host===`127.0.0.1:${port}`||host===`localhost:${port}`)return {remote:false,host};
 const c=config();if(!c||host!==c.hostname)return null;
 if(!(await verifyAccess(req.headers['cf-access-jwt-assertion'],c,fetcher)))return null;
 return {remote:true,host};
}
