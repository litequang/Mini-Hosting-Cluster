// TEST 0.5.0C-WRITER-AUDIT — fail-closed manual switchover READINESS REVIEW (never promotes).
// No service control, SQL, Cloudflare, route changes or lease transfers.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const HOME=process.env.HOME||os.homedir();
const MARK=path.join(HOME,'.config/mhc-full-installer/installed');
const PROD=['apps/thophuongpro/.env','.config/mini-hosting-cluster/ha.json','.config/mini-hosting-cluster/node.json'];
function exists(p){try{return fs.existsSync(path.join(HOME,p))}catch{return true}}
export function evaluateReadiness({productionFootprint=false,registeredSites=false,gtidLabAccepted=false,
 fileLabAccepted=false,backupRestoreVerified=false,liveWitnessVerified=false,oldWriterIndependentlyFenced=false,
 allRealWritePathsGated=false,routeIsolated=false,physicalTwoNodeValidated=false}={}){
 const blockers=[];
 const add=(label,test)=>{if(!test)blockers.push(label)};
 add('NO_PRODUCTION_OR_HA_FOOTPRINT',!productionFootprint);
 add('DEDICATED_EMPTY_LAB_NODES_ONLY',!registeredSites);
 add('ANDROID_GTID_E2E_NOT_ATTESTED',gtidLabAccepted);
 add('ANDROID_FILE_DELTA_E2E_NOT_ATTESTED',fileLabAccepted);
 add('BACKUP_RESTORE_NOT_INDEPENDENTLY_VERIFIED',backupRestoreVerified);
 add('DURABLE_WITNESS_NOT_LIVE_ATTESTED',liveWitnessVerified);
 add('OLD_WRITER_NOT_INDEPENDENTLY_FENCED',oldWriterIndependentlyFenced);
 add('ALL_REAL_WRITERS_NOT_GATED',allRealWritePathsGated);
 add('ROUTING_NOT_ISOLATED',routeIsolated);
 add('TWO_ANDROID_NODES_NOT_ACCEPTED',physicalTwoNodeValidated);
 return {scope:'SWITCHOVER_V05C_LAB_REVIEW_ONLY',preconditionsSatisfied:!blockers.length,
  blockers,blockerCount:blockers.length,canSwitchPrimary:false,canModifyRouting:false,
  canArmHA:false,independentCryptographicAttestation:false,
  notice:'Readiness input flags cannot authorize switchover. Independent signed physical evidence and actual old-writer fencing are required for a future real executor.'};
}
export function localReadiness(){
 const productionFootprint=PROD.some(exists);
 const registeredSites=['static','sites'].some(dir=>{
  const d=path.join(HOME,'.config/mhc-full-installer',dir);
  try{return fs.readdirSync(d).some(x=>x.endsWith('.conf')||x.endsWith('.env'))}catch{return false}
 });
 const markerExists=fs.existsSync(MARK);
 const v=evaluateReadiness({productionFootprint,registeredSites});
 return {...v,markerExists,release:'TEST 0.5.0C-WRITER-AUDIT',mode:'PRECHECK_ONLY',
  nextStep:'Follow docs/MANUAL-SWITCHOVER-ACCEPTANCE-0.5C.md on TWO disposable Android LAB nodes; no production execution implemented.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 if(!['plan','status'].includes(process.argv[2])||process.argv.length!==3){console.error('Usage mhc-full switchover-readiness plan|status');process.exitCode=2}
 else console.log(JSON.stringify(localReadiness(),null,2));
}
