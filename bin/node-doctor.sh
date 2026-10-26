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
 if command -v termux-wake-lock >/dev/null;then
  termux-wake-lock >/dev/null 2>&1 || echo 'WARN wake lock rejected by Android'
 fi
 if [[ -f "$PREFIX/etc/profile.d/start-services.sh" ]];then
  . "$PREFIX/etc/profile.d/start-services.sh"
 fi
 for name in sshd amh-panel mhc-authority-agent;do
  if [[ -f "$PREFIX/var/service/$name/run" ]];then
   sv-enable "$name" || true
   sv up "$PREFIX/var/service/$name" || true
  fi
 done
fi
say 'Android device' "$(getprop ro.product.model 2>/dev/null|head -c 64||true)"
say 'Android version' "$(getprop ro.build.version.release 2>/dev/null|head -c 20||true)"
for name in sshd amh-panel nginx mysqld mhc-authority-agent named-tunnel mhc-panel-tunnel;do
 if [[ -f "$PREFIX/var/service/$name/run" ]];then
  line="$(timeout 4 sv status "$PREFIX/var/service/$name" 2>/dev/null||true)"
  [[ "$line" == run:* ]] && status=RUNNING || status=STOPPED
 else status=NOT_INSTALLED;fi
 say "Service $name" "$status"
done
http="$(curl --max-time 4 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/ 2>/dev/null||true)"
say 'Panel localhost:9090' "${http:-UNAVAILABLE}"
[[ "$http" == 200 ]] || warn=1
if [[ -f "$HOME/.termux/boot/10-start-hosting" ]];then
 if grep -q 'termux-wake-lock' "$HOME/.termux/boot/10-start-hosting"&&grep -q 'start-services.sh' "$HOME/.termux/boot/10-start-hosting";then
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
if [[ -f "$HOME/.config/mhc-full-installer/authority.json" ]];then say 'Shared cluster enrollment' 'CONFIGURED (no keys displayed)'
else say 'Shared cluster enrollment' 'NOT JOINED (use mhc-full join <CODE>)';fi
if [[ "$warn" != 0 ]];then
 echo 'MHC_NODE_DOCTOR_NEEDS_ACTION: finish manual Android permissions/reboot check, then rerun'
 exit 1
fi
echo 'MHC_NODE_DOCTOR_LOCAL_PASS: does not prove successful reboot/screen-off or shared cluster health'
