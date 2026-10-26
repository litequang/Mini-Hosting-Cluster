#!/data/data/com.termux/files/usr/bin/bash
ROOT="$HOME/standby-sync"
echo '=== Standby sync status ==='
[[ -f "$ROOT/config" ]] || { echo 'Not installed';exit 1; }
[[ -f "$ROOT/latest-applied" ]] && { echo -n 'Snapshot ready: ';cat "$ROOT/latest-applied"; } || echo 'No snapshot applied yet'
[[ -f "$ROOT/last-applied-at" ]] && { echo -n 'Last prepared: ';cat "$ROOT/last-applied-at"; }
[[ -f "$ROOT/current-db" ]] && { echo -n 'Prepared database: ';cat "$ROOT/current-db"; }
for n in standby-sync mini-web named-tunnel tpp-backup;do
 echo -n "$n: "; sv status "$PREFIX/var/service/$n" 2>&1 || true
done
[[ -L "$HOME/apps/thophuongpro" ]] && echo "App release: $(readlink -f "$HOME/apps/thophuongpro")"
[[ -f "$HOME/.local/state/standby-sync/log/current" ]] && tail -n 8 "$HOME/.local/state/standby-sync/log/current"
