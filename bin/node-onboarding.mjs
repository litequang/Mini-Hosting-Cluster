// Local observations only. This report cannot authorize a route or a writer lease.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const phases=['IN_PROGRESS','INTERRUPTED','INSTALLED'];
function read(file){try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>262144)return null;return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
export function onboardingObservation({home=process.env.HOME||os.homedir(),services={}}={}){
 const s=read(path.join(home,'.local/state/mhc-new-node-install/progress.json'));if(!s||s.schema!==1)return null;
 const joined=read(path.join(home,'.config/mhc-full-installer/authority.json'));
 const update=read(path.join(home,'.local/state/mhc-source-upgrade/current.json'));
 const installed=s.phase==='INSTALLED',configured=!!joined&&joined.nodeId===s.nodeId;
 const management=installed&&services['amh-panel']==='running'&&(!configured||services['mhc-authority-agent']==='running');
 const tunnel=services['mhc-panel-tunnel']==='running';
 // Dataset/route evidence must come from signed readiness, never a local boolean.
 return {v:1,installPhase:phases.includes(s.phase)?s.phase:'INTERRUPTED',
  sourceCommit:/^[a-f0-9]{40}$/.test(update?.commit||'')?update.commit:/^[a-f0-9]{40}$/.test(s.commit||'')?s.commit:null,
  stage:['packages','runtime','identity','panel-admin','services','verify'].includes(s.currentStage)?s.currentStage:null,
  completedStages:Array.isArray(s.completed)?Math.min(6,s.completed.length):0,
  authorityConfigured:configured,managementRunning:management,tunnelRunning:tunnel,
  routeVerified:false,siteVerified:false,eligiblePrimary:false,androidRebootVerified:false,
  blockers:[...(!installed?['INSTALL_INCOMPLETE']:[]),...(!configured?['PAIRING_REQUIRED']:[]),...(!management?['MANAGEMENT_NOT_RUNNING']:[]),...(!tunnel?['TUNNEL_NOT_RUNNING']:[]),'CONTROL_PROOF_REQUIRED','SITE_RESTORE_AND_GUARDS_REQUIRED'],
  errorCode:/^N1_[A-Z0-9_]{1,90}$/.test(s.errorCode||'')?s.errorCode:null};
}
