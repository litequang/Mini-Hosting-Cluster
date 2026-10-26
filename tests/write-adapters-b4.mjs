// MHC 0.5.0B4: offline fixtures only. Fake witness; NO network/Android mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mhc-b4-write-fixture-'));
const before=process.env.HOME;process.env.HOME=tmp;
let tests=0;
const yes=(x,msg)=>{assert.ok(x,msg);tests++;};
const equal=(a,b,msg)=>{assert.deepEqual(a,b,msg);tests++;};
const denied=async(p,rx)=>{await assert.rejects(p,rx);tests++;};
try{
 const cli=await import(pathToFileURL(path.join(process.argv[2],'bin/write-path-gate-lab.mjs')).href);
 const {main,coverage,writeLabArtifact}=cli;
 const cfg=path.join(tmp,'.config/mhc-witness-lab');fs.mkdirSync(cfg,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(cfg,'client.json'),JSON.stringify({clusterId:'lab-fixture-b4',nodeId:'node-a',url:'https://lab.example.org/'}),{mode:0o600});
 fs.writeFileSync(path.join(cfg,'node-token'),'b'.repeat(48)+'\n',{mode:0o600});
 let allow=true,up=true,epoch=3,checks=0;
 const stub=async(url)=>{
  checks++;
  if(!up)throw new Error('network down');
  const nonce=new URL(url).searchParams.get('nonce');
  return {ok:allow,status:allow?200:403,text:async()=>JSON.stringify({scope:'MHC_LAB_WITNESS_ONLY_NO_HA',productionReady:false,haEligible:false,action:'verify',nonce,phase:allow?'LEASED':'FROZEN',epoch,serverNowMs:20000,expiresAtMs:27000,callerOwnsLease:allow,allowedForLabGate:allow})};
 };
 const root=path.join(tmp,'mhc-writegate-lab');
 const fixtures=[
  ['preview-write','preview','static-preview',Buffer.from('<!doctype html><h1>LAB ONLY</h1>'),'.html'],
  ['upload-fixture','upload','upload-fixtures',Buffer.from('FAKE UPLOAD, NOT SHEET DATA'),'.bin'],
  ['job-receipt','job','job-receipts',Buffer.from('{"job":"lab","result":"pass"}'),'.json'],
 ];
 const plan=await main(['plan']);equal(plan.writePaths.length,14,'14 total paths');
 equal(coverage.filter(x=>x.gate==='ENFORCED_LAB_ONLY').length,5,'four fixture types plus HTTP gateway');
 equal(coverage.filter(x=>x.gate==='NOT_ENFORCED').length,9,'nine real hosting paths remain unguarded');
 yes(!plan.haEligible&&!plan.productionProtected,'no HA claims');
 await denied(main(['preview-write','--confirm=ISOLATED_LAB_WRITE_ONLY'],{check:stub,input:Buffer.from('x')}),/ENOENT/);
 await denied(main(['preview-write','--confirm=ISOLATED_CANARY_WRITE_ONLY'],{check:stub,input:Buffer.from('x')}),/Usage/);
 equal((await main(['init','--confirm=ISOLATED_CANARY_WRITE_ONLY'])).status,'CANARY_LAB_INITIALIZED','explicit lab init');
 for(const [cmd,kind,dir,data,ext] of fixtures){
  let start=checks;
  const result=await main([cmd,'--confirm=ISOLATED_LAB_WRITE_ONLY'],{check:stub,input:data});
  equal(checks-start,2,'two independent witness checks');
  equal(result.kind,kind,'correct category');
  yes(result.id.endsWith(ext),'extension');
  equal(fs.readFileSync(path.join(root,dir,result.id)),data,'accurate bytes');
  yes(!result.haEligible&&!result.productionProtected,'never promotes actual writer');
  yes(!result.id.includes('/')&&!result.id.includes('..'),'random basename');
 }
 const [cmd,kind,dir,data]=fixtures[0];
 const files=()=>fs.readdirSync(path.join(root,dir));
 const count=files().length;
 up=false;await denied(writeLabArtifact(kind,data,{check:stub}),/FAIL_CLOSED/);up=true;equal(files().length,count,'witness down means no new artifact');
 allow=false;await denied(writeLabArtifact(kind,data,{check:stub}),/FAIL_CLOSED/);allow=true;equal(files().length,count,'denied lease means no new artifact');
 let attempts=0;const changeEpoch=async(...a)=>{const r=await stub(...a);if(++attempts===2)epoch++;return r;};
 await denied(writeLabArtifact(kind,data,{check:changeEpoch}),/EPOCH_CHANGED_FAIL_CLOSED/);
 equal(files().length,count,'epoch change cleaned staging');epoch=3;
 const dirs=fixtures.map(x=>path.join(root,x[2]));
 fs.chmodSync(dirs[1],0o755);await denied(writeLabArtifact('upload',data,{check:stub}),/UNSAFE_CANARY_DIRECTORY/);fs.chmodSync(dirs[1],0o700);
 fs.symlinkSync(tmp,path.join(dirs[1],'bad'));await denied(writeLabArtifact('upload',data,{check:stub}),/UNEXPECTED_LAB_ARTIFACT/);fs.unlinkSync(path.join(dirs[1],'bad'));
 const existing=files()[0];fs.chmodSync(path.join(dirs[0],existing),0o644);await denied(writeLabArtifact(kind,data,{check:stub}),/UNSAFE_LAB_ARTIFACT/);fs.chmodSync(path.join(dirs[0],existing),0o600);
 await denied(writeLabArtifact('unknown',data,{check:stub}),/UNKNOWN_LAB_WRITE_ADAPTER/);
 await denied(writeLabArtifact('job',Buffer.alloc(8193),{check:stub}),/LAB_DATA_SIZE_INVALID/);
 await denied(writeLabArtifact('upload',Buffer.alloc(262145),{check:stub}),/LAB_DATA_SIZE_INVALID/);
 await denied(writeLabArtifact('preview',Buffer.alloc(65537),{check:stub}),/LAB_DATA_SIZE_INVALID/);
 await denied(writeLabArtifact('preview',Buffer.alloc(0),{check:stub}),/LAB_DATA_SIZE_INVALID/);
 await denied(main(['upload-fixture','--confirm=ISOLATED_CANARY_WRITE_ONLY'],{check:stub,input:data}),/Usage/);
 // Quota: each adapter bounded to 24 files, without touching any real website.
 for(let i=files().length;i<24;i++)fs.writeFileSync(path.join(dirs[0],'lab-'+(i+100).toString(16).padStart(24,'0')+'.html'),'fixture',{mode:0o600});
 equal(files().length,24,'quota fixture seeded');
 await denied(writeLabArtifact('preview',data,{check:stub}),/LAB_ARTIFACT_QUOTA_REACHED/);
 const prod=path.join(tmp,'.config/mhc-full-installer/static');fs.mkdirSync(prod,{recursive:true});
 await denied(writeLabArtifact('job',data,{check:stub}),/HOSTED_SITE_BLOCKED/);fs.rmSync(prod,{recursive:true});
 const prodEnv=path.join(tmp,'apps/thophuongpro');fs.mkdirSync(prodEnv,{recursive:true});fs.writeFileSync(path.join(prodEnv,'.env'),'FAKE');
 await denied(writeLabArtifact('job',data,{check:stub}),/PRODUCTION_OR_HA_BLOCKED/);fs.rmSync(prodEnv,{recursive:true});
 const status=await main(['status']);yes(status.initialized,'lab only initialized');yes(status.localAuditLines>=3,'audit only metadata');
 // Explicitly no SQL/WordPress/HTTP write, no arbitrary target path or failover CLI.
 for(const unknown of ['site-deploy','sql-write','upload-to-site','promote','cloudflare-route'])await denied(main([unknown,'--confirm=ISOLATED_LAB_WRITE_ONLY']),/Usage/);
 console.log('PASS: B4 multi-adapter isolated write gates — '+tests+' assertions; all real hosting writes remain UNGUARDED');
}finally{process.env.HOME=before;fs.rmSync(tmp,{recursive:true,force:true});}
