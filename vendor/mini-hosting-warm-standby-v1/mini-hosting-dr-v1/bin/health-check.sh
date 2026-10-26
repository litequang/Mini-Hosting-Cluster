#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Termux only';exit 1; }
echo '=== Runtime ===';uname -m;node --version;mariadb --version || true
echo '=== Services ==='
for n in sshd mysqld nginx mini-web amh-panel named-tunnel tpp-backup;do
 [[ -e "$PREFIX/var/service/$n/run" ]] && sv status "$PREFIX/var/service/$n" || true
done
echo '=== Local HTTP ==='
for port in 3000 8080 9090;do printf '%s: ' "$port";curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: pro.thophuong.com' "http://127.0.0.1:$port/" || true;done
echo '=== DB and storage ==='
mariadb --no-defaults -u root -N -s -e "SELECT count(*) FROM information_schema.tables WHERE table_schema='thophuong_pro'" || true
if [[ -d "$HOME/apps/thophuongpro/storage/sheets" ]];then find "$HOME/apps/thophuongpro/storage/sheets" -type f ! -path '*/.staging/*' | wc -l;fi
