// P3 LAB recovery: select an administrative Panel only, NEVER a website writer.
// Pure decision function: no DNS mutation, no Cloudflare calls, no node activation.
// Scheduling is opt-in via a Worker secret and authenticated panel route configuration.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function p3RecoveryPlan(state,members,env,now=Date.now()){
 if(env.MHC_P3_PANEL_RECOVERY_ENABLED!=='LAB_PANEL_ONLY')return {kind:'skip',reason:'DISABLED'};
 if(state.pending)return {kind:'skip',reason:'PRIMARY_TRANSITION_PENDING'};
 const r=state.panelRecovery;
 if(r?.status==='DNS_SWITCHED_RECOVERY')return {kind:'skip',reason:'RECOVERY_ACTIVE'};
 if(r?.status==='DNS_REQUESTED'){
  if(!UUID.test(r.fromNodeId||'')||!UUID.test(r.targetNodeId||'')||r.fromNodeId===r.targetNodeId)
   return {kind:'skip',reason:'INVALID_RECOVERY_JOURNAL'};
  if(now-(r.lastRouteTryAt||0)<90000)return {kind:'skip',reason:'RETRY_COOLDOWN'};
  const hb=state.heartbeats?.[r.targetNodeId];
  if(!hb||now-hb.receivedAt<0||now-hb.receivedAt>90000||
      now-(hb.metricsAt||0)>90000||hb.telemetry?.services?.['amh-panel']!=='running'||
      hb.telemetry?.services?.['mhc-panel-tunnel']!=='running')
   return {kind:'skip',reason:'RECOVERY_TARGET_UNAVAILABLE'};
  return {kind:'resume',fromNodeId:r.fromNodeId,targetNodeId:r.targetNodeId};
 }
 const incumbent=state.declaredPrimary?.nodeId||env.MHC_P3_INITIAL_PRIMARY_NODE_ID;
 if(!UUID.test(incumbent||''))return {kind:'skip',reason:'NO_INCUMBENT'};
 const former=state.heartbeats?.[incumbent];
 // Never move an admin endpoint based on unknown/stale configuration without observing the
 // incumbent first. Require 5 continuous minutes without heartbeat.
 if(!former||now-former.receivedAt<300000)return {kind:'skip',reason:'INCUMBENT_NOT_PROVEN_OFFLINE'};
 if(now-former.receivedAt>2592000000)return {kind:'skip',reason:'INCUMBENT_LAST_SEEN_TOO_OLD'};
 const candidates=members.filter(n=>n.nodeId!==incumbent).filter(n=>{
  const h=state.heartbeats?.[n.nodeId];
  return h&&now-h.receivedAt>=0&&now-h.receivedAt<=90000&&
   now-(h.metricsAt||0)>=0&&now-(h.metricsAt||0)<=90000&&
   h.telemetry?.services?.['amh-panel']==='running'&&
   h.telemetry?.services?.['mhc-panel-tunnel']==='running';
 });
 candidates.sort((a,b)=>state.heartbeats[b.nodeId].receivedAt-state.heartbeats[a.nodeId].receivedAt||a.nodeId.localeCompare(b.nodeId));
 if(!candidates.length)return {kind:'skip',reason:'NO_HEALTHY_RECOVERY_PANEL'};
 return {kind:'start',fromNodeId:incumbent,targetNodeId:candidates[0].nodeId};
}
