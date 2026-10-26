// Local origin access gate. Only a current, locally valid DO lease can pass traffic.
import http from 'node:http';import net from 'node:net';
import {loadConfig,currentlyLeased,closeLease} from './common.mjs';
const c=loadConfig();const port=Number(c.gatewayPort||3070);
// Fail closed on every gateway restart: no pre-reboot or stale on-disk lease survives.
closeLease();
function equal(a='',b=''){if(a.length!==b.length||!a)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
function permitted(req){return c.armed===true && currentlyLeased(c) && !!c.edgeSecret && equal(req.headers['x-mhc-edge-secret']||'',c.edgeSecret)}
function forwardHeaders(req){const h={...req.headers};delete h['x-mhc-edge-secret'];delete h['connection'];h['host']=req.headers['x-forwarded-host']||req.headers.host;return h;}
const server=http.createServer((req,res)=>{
 if(req.url==='/__mhc/healthz' && req.socket.remoteAddress==='127.0.0.1'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({leased:currentlyLeased(c)}));return}
 if(!permitted(req)){res.writeHead(503,{'content-type':'text/plain','cache-control':'no-store'});res.end('MHC: standby or lease not valid');return}
 const upstream=http.request({host:'127.0.0.1',port:Number(c.appPort||3000),method:req.method,path:req.url,headers:forwardHeaders(req)},up=>{
   res.writeHead(up.statusCode,up.headers);up.pipe(res);
 });upstream.setTimeout(120000,()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{
 if(!permitted(req)){socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');return}
 const to=net.connect(Number(c.appPort||3000),'127.0.0.1',()=>{
  const lines=[`${req.method} ${req.url} HTTP/${req.httpVersion}`];
  for(const [k,v] of Object.entries({...forwardHeaders(req),connection:'Upgrade'}))lines.push(`${k}: ${v}`);
  to.write(lines.join('\r\n')+'\r\n\r\n');if(head.length)to.write(head);
  socket.pipe(to).pipe(socket);
 });to.on('error',()=>socket.destroy());socket.on('error',()=>to.destroy());
});
server.listen(port,'127.0.0.1',()=>console.log('MHC gateway listening at 127.0.0.1:'+port));
