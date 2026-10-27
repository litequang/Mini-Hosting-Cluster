#!/data/data/com.termux/files/usr/bin/bash
# Non-destructive diagnostics + management-only repair for Android MHC nodes.
set -Eeuo pipefail
export SVDIR="${SVDIR:-${PREFIX:-/data/data/com.termux/files/usr}/var/service}"
mode="${1:---check}"
[[ "$mode" == --check || "$mode" == --repair ]] || { echo 'Usage: mhc-full node-doctor [--check|--repair]';exit 2; }
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'FAIL Termux prefix';exit 2; }
warn=0
say(){ printf '%-25s %s\n' "$1" "$2"; }
command -v termux-battery-status >/dev/null || { say 'Termux:API CLI' 'MISSING (pkg install termux-api)';warn=1; }
if [[ "$mode" == --repair ]];then
 boot="$HOME/.termux/boot/10-mhc-start"
 managed="$HOME/.local/share/mhc-full-installer/bin/node-boot.sh"
 if [[ ! -f "$managed" || -L "$managed" ]];then
  echo 'STOP: MHC managed node-boot.sh missing; update code first'
  exit 2
 fi
 mkdir -p "$HOME/.termux/boot" "$HOME/.local/state/mhc-node-setup"
 chmod 700 "$HOME/.termux/boot" "$HOME/.local/state/mhc-node-setup"
 if [[ -L "$boot" ]];then echo 'STOP: boot script is a symlink';exit 2;fi
 if [[ -e "$HOME/.termux/boot/10-start-hosting" ]];then
  echo 'STOP: legacy/duplicate boot entry; use the unified source package to migrate with rollback';exit 2
 fi
 if [[ -f "$boot" ]];then
  if ! grep -q 'mhc-node-boot-canonical-v1' "$boot";then
   echo 'STOP: unknown boot script; inspect before rewriting';exit 2
  fi
 fi
 cp "$HOME/.local/share/mhc-full-installer/bin/node-boot-entry.sh" "$boot"
 chmod 700 "$boot"
 bash "$managed" --once || echo 'WARN: boot recovery had a startup error'
fi
say 'Android device' "$(getprop ro.product.model 2>/dev/null|head -c 64||true)"
say 'Android version' "$(getprop ro.build.version.release 2>/dev/null|head -c 20||true)"
for name in sshd amh-panel nginx mysqld mhc-authority-agent named-tunnel mhc-panel-tunnel;do
 if [[ -f "$PREFIX/var/service/$name/run" ]];then
  line="$(timeout 4 sv status "$PREFIX/var/service/$name" 2>/dev/null||true)"
  [[ "$line" == run:* ]] && status=RUNNING || status=STOPPED
 else status=NOT_INSTALLED;fi
 say "Service $name" "$status"
 case "$name" in
  sshd|amh-panel) [[ "$status" == RUNNING ]] || warn=1;;
  mhc-authority-agent) if [[ -f "$HOME/.config/mhc-full-installer/authority.json" && "$status" != RUNNING ]];then warn=1;fi;;
  mhc-panel-tunnel) if [[ -f "$HOME/android-hosting-panel/data/remote-access.json" && "$status" != RUNNING ]];then warn=1;fi;;
 esac
done
http="$(curl --max-time 4 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/ 2>/dev/null||true)"
say 'Panel localhost:9090' "${http:-UNAVAILABLE}"
[[ "$http" == 200 ]] || warn=1
if [[ -f "$HOME/.termux/boot/10-mhc-start" ]];then
 if grep -q 'mhc-node-boot-canonical-v1' "$HOME/.termux/boot/10-mhc-start" && [[ ! -e "$HOME/.termux/boot/10-start-hosting" ]];then
  say 'Termux:Boot script' 'READY (open Android Termux:Boot app once)'
 else say 'Termux:Boot script' 'INCOMPLETE';warn=1;fi
else say 'Termux:Boot script' 'MISSING';warn=1;fi
if command -v termux-battery-status >/dev/null;then
 battery="$(timeout 8 termux-battery-status 2>/dev/null||true)"
 if [[ -n "$battery" ]]&&printf '%s' "$battery" | node -e 'let x="";process.stdin.on("data",v=>x+=v);process.stdin.on("end",()=>{try{const j=JSON.parse(x);if(typeof j.percentage!=="number")process.exit(1);console.log(j.percentage+"% / "+(typeof j.temperature==="number"?j.temperature+" C":"unknown"))}catch{process.exit(1)}})' >/dev/null 2>&1;then
  summary="$(printf '%s' "$battery" | node -e 'let x="";process.stdin.on("data",v=>x+=v);process.stdin.on("end",()=>{const j=JSON.parse(x);console.log(j.percentage+"%, "+(typeof j.temperature==="number"?j.temperature+" C":"temperature unknown"))})')"
  say 'Android battery API' "OK $summary"
 else
  say 'Android battery API' 'NO_DATA/TIMEOUT: check signed add-on, launch it once, battery unrestricted'
  warn=1
 fi
fi
if command -v termux-wake-lock >/dev/null;then say 'Wake Lock command' 'AVAILABLE (Android may still restrict app)'
else say 'Wake Lock command' 'MISSING';warn=1;fi
say 'Android permission check' 'Manual: Termux+Termux:API unrestricted battery; Termux:Boot opened once; Sony STAMINA OFF'
collector="$HOME/.local/share/mhc-full-installer/bin/node-monitor.mjs"
if [[ -f "$collector" && ! -L "$collector" ]];then
 metrics="$(timeout 12 node --input-type=module -e '
import {pathToFileURL} from "node:url";
try{
 const m=await import(pathToFileURL(process.argv[1]));
 const raw=await m.collectNodeMetrics();
 const v=m.compactTelemetry(raw);
 if(!v||v.v!==1||!v.memory||!v.battery||!v.services)throw Error("BAD_SCHEMA");
 const pct=v.battery.percentage===null?"unknown":v.battery.percentage+"%";
 const ram=v.memory.freeMiB===null?"unknown":v.memory.freeMiB+" MiB free";
 console.log("MONITOR_V2_OK / battery "+pct+" / RAM "+ram+" / "+Object.keys(v.services).length+" services");
}catch(e){
 const type=String(e?.code||e?.name||"COLLECTOR_ERROR").replace(/[^A-Z0-9_]/gi,"").slice(0,45);
 console.log("MONITOR_V2_COLLECT_FAILED / "+type);
 process.exitCode=3;
}
' "$collector" 2>/dev/null)" || true
 say 'Local Monitor v2' "${metrics:-COLLECTOR_TIMEOUT_OR_CRASH}"
 if [[ "$metrics" != MONITOR_V2_OK* ]];then warn=1;fi
else
 say 'Local Monitor v2' 'COLLECTOR_NOT_INSTALLED'
 warn=1
fi
if [[ -f "$HOME/.config/mhc-full-installer/authority.json" ]];then say 'Shared cluster enrollment' 'CONFIGURED (no keys displayed)'
else say 'Shared cluster enrollment' 'NOT JOINED (use mhc-full join <CODE>)';fi
if [[ -f "$HOME/.config/mhc-full-installer/authority.json" ]];then
 client="$HOME/.local/share/mhc-full-installer/bin/cluster-authority.mjs"
 if [[ -f "$client" ]];then
  status="$(timeout 12 node "$client" status 2>/dev/null || true)"
  if [[ -n "$status" ]];then
   summary="$(printf '%s' "$status" | node -e '
let data="";process.stdin.on("data",v=>data+=v);process.stdin.on("end",()=>{
 try{const c=JSON.parse(data),nodes=Array.isArray(c.nodes)?c.nodes:[];
 const supports=nodes.some(n=>Object.hasOwn(n,"telemetry"));
 const recent=nodes.filter(n=>n.heartbeatRecent===true).length;
 console.log((supports?"MONITOR_SCHEMA_V2":"WORKER_NEEDS_MONITOR_DEPLOY")+
  " / "+recent+"/"+nodes.length+" heartbeat / " +
  nodes.filter(n=>n.telemetryRecent===true).length+" metric senders");
 }catch{process.exit(2)}
})' 2>/dev/null || true)"
   say 'Cloudflare shared Monitor' "${summary:-INVALID_RESPONSE}"
  else
   say 'Cloudflare shared Monitor' 'UNREACHABLE / token or Internet or Worker'
   warn=1
  fi
 fi
fi
if [[ "$warn" != 0 ]];then
 echo 'MHC_NODE_DOCTOR_NEEDS_ACTION: finish manual Android permissions/reboot check, then rerun'
 exit 1
fi
echo 'MHC_NODE_DOCTOR_LOCAL_PASS: does not prove successful reboot/screen-off or shared cluster health'
