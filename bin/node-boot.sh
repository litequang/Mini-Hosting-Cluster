#!/data/data/com.termux/files/usr/bin/bash
# TermuxBoot recovery only: management services, not website writers.
set -Eeuo pipefail
umask 077
[[ "$PREFIX" == /data/data/com.termux/files/usr ]] || { echo 'Termux required';exit 2; }
export SVDIR="$PREFIX/var/service"
mode="${1:---status}"
[[ "$mode" == --once || "$mode" == --status ]] || { echo 'Usage: node-boot.sh --once|--status';exit 2; }
state="$HOME/.local/state/mhc-node-setup"
log="$state/boot-last.log"
if [[ "$mode" == --status ]];then
 [[ -f "$log" ]] && tail -n 15 "$log" || echo 'NO_BOOT_LOG'
 exit 0
fi
mkdir -p "$state";chmod 700 "$state"
failed=0
{
 echo "MHC_BOOT_ATTEMPT $(date -Iseconds)"
 if command -v termux-wake-lock >/dev/null;then
  termux-wake-lock >/dev/null 2>&1 && echo 'WAKE_LOCK_REQUESTED' || echo 'WAKE_LOCK_NOT_GRANTED'
 fi
 if [[ -f "$PREFIX/etc/profile.d/start-services.sh" ]];then
  . "$PREFIX/etc/profile.d/start-services.sh" || echo 'SUPERVISOR_START_ERROR'
 fi
 for i in 1 2 3 4 5 6 7 8 9 10;do
  if pgrep -f '[r]unsvdir' >/dev/null 2>&1;then break;fi
  sleep 1
 done
 if pgrep -f '[r]unsvdir' >/dev/null 2>&1;then echo 'RUNSVDIR_RUNNING';else echo 'RUNSVDIR_MISSING';failed=1;fi
 for svc in sshd amh-panel;do
  if [[ -f "$SVDIR/$svc/run" && ! -L "$SVDIR/$svc/run" ]];then
   sv-enable "$svc" 2>/dev/null || true
   sv -w 10 up "$SVDIR/$svc" 2>/dev/null || failed=1
   if ! sv status "$SVDIR/$svc" 2>/dev/null | grep '^run:';then echo "SERVICE_NOT_RUNNING $svc";failed=1;fi
  else echo "SERVICE_MISSING $svc";failed=1;fi
 done
 if [[ -f "$HOME/.config/mhc-full-installer/authority.json" &&
       -f "$SVDIR/mhc-authority-agent/run" && ! -L "$SVDIR/mhc-authority-agent/run" ]];then
  sv-enable mhc-authority-agent 2>/dev/null || true
  sv -w 10 up "$SVDIR/mhc-authority-agent" 2>/dev/null || failed=1
  if ! sv status "$SVDIR/mhc-authority-agent" 2>/dev/null | grep '^run:';then echo 'SERVICE_NOT_RUNNING mhc-authority-agent';failed=1;fi
 elif [[ -f "$HOME/.config/mhc-full-installer/authority.json" ]];then
  echo 'SERVICE_MISSING mhc-authority-agent';failed=1
 fi
 panel="$(curl --max-time 4 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9090/ 2>/dev/null||true)"
 echo "PANEL_HTTP=$panel"
 if [[ "$panel" != 200 ]];then failed=1;fi
 if [[ "$failed" == 0 ]];then echo 'MHC_BOOT_FINISHED';else echo 'MHC_BOOT_NEEDS_ACTION';fi
} > "$log" 2>&1
tail -n 14 "$log"
exit "$failed"
