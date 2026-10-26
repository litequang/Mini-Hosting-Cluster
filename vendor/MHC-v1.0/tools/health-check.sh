#!/data/data/com.termux/files/usr/bin/bash
# Read-only inspection of old/current agent and staging. NEVER prints credentials.
set -u
printf '\n=== MHC NONDESTRUCTIVE HEALTH ===\n'
printf 'Node: ';getprop ro.product.model 2>/dev/null || uname -n
printf 'Date: ';date '+%Y-%m-%d %H:%M:%S %Z'
for svc in mysqld nginx mini-web named-tunnel standby-sync mhc-v1-agent mhc-v1-gateway;do
 printf '%-16s' "$svc";sv status "$svc" 2>&1 || true
done
printf '\nPorts: \n'
for port in 3000 3070 8080 9090;do
 curl --noproxy '*' -s -o /dev/null -w "localhost:${port} HTTP %{http_code}\n" --connect-timeout 1 --max-time 2 "http://127.0.0.1:$port/" || true
done
printf 'Staged config present: '; [[ -s "$HOME/mhc-v1/config.json" ]] && echo YES || echo NO
printf 'Lease granted: '
if [[ -s "$HOME/mhc-v1/lease.json" ]];then
 node -e 'try{const l=require(process.env.HOME+"/mhc-v1/lease.json");console.log(l.role+" term="+l.term)}catch{console.log("unknown")}'
else echo 'not yet';fi
printf 'Existing MHC CLI: ';[[ -e "$HOME/mhc" ]] && echo YES || echo NO
printf 'Database: ';mariadb --no-defaults -u root -N -e 'SELECT VERSION()' 2>/dev/null || echo UNAVAILABLE
printf '=== END HEALTH ===\n'
