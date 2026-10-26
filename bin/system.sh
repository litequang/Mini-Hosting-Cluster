#!/data/data/com.termux/files/usr/bin/bash
# READ-ONLY local inventory; no secret-file reads or privileged service writes.
set -Eeuo pipefail
case "${1:-}" in
 status)
   printf 'MHC Full TEST 0.3.3 — local state only (NOT proof of HA lease)\n'
   printf 'Device: ';getprop ro.product.model 2>/dev/null || echo 'unknown'
   printf 'Kernel/arch: ';uname -m
   printf 'Free home space: ';df -h "$HOME" | tail -1
   printf 'Managed sites:\n'
   "$HOME/.local/share/mhc-full-installer/bin/sites.sh" list
   echo 'Only allowlisted MHC-local runtime service names:'
   for name in mhc-full-wp-php mhc-full-wp-nginx mhc-full-daily-backup mhc-full-panel mhc-full-heartbeat;do
     if command -v sv >/dev/null;then sv status "$name" 2>/dev/null || echo "$name: unavailable";else echo "$name: not verifiable (sv missing)";fi
   done
   if [[ -f "$HOME/hosting-backups/mhc-full/latest-success-path" ]];then
     # Avoid printing arbitrary file data to status output.
     echo 'Latest snapshot marker: present (use backup verify to validate)'
   else echo 'Latest snapshot marker: absent';fi
   if [[ -e "$HOME/.config/mini-hosting-cluster/ha.json" ]];then
     echo 'WARNING: HA config exists. This local status does not establish lease or primary rights.'
   fi
   ;;
 *) echo 'Usage: ~/mhc-full system status (read-only local inventory)'; exit 2;;
esac
