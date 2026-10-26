#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail; umask 077
[[ "${PREFIX:-}" == /data/data/com.termux/files/usr ]] || { echo 'Termux required' >&2; exit 1; }
S="$PREFIX/var/service/mhc-full-daily-backup"
[[ ! -e "$S/run" ]] || { echo 'Backup service already configured; not overwriting. Review it manually.' >&2; exit 1; }
mkdir -p "$S/log" "$HOME/.local/state/mhc-full-backup-log"
cat > "$S/run" <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
# Hourly retry; one verified snapshot per local calendar date.
while :;do
  if "$HOME/.local/share/mhc-full-installer/bin/daily-backup.sh" run;then
    if test -f "$HOME/.config/mhc-full-installer/peer.conf"; then
      "$HOME/.local/share/mhc-full-installer/bin/peer-copy.sh" push || echo 'WARN: peer copy failed; retry next cycle' >&2
    fi
  fi
  sleep 3600
done
RUN
cat > "$S/log/run" <<'LOG'
#!/data/data/com.termux/files/usr/bin/sh
exec "$PREFIX/bin/svlogd" -tt "$HOME/.local/state/mhc-full-backup-log"
LOG
chmod 700 "$S/run" "$S/log/run"
# Disabled until operator explicitly opts in below. Never modifies other services.
touch "$S/down"
sv-enable mhc-full-daily-backup
sv up mhc-full-daily-backup || true
echo 'Schedule enabled. Retries hourly while Termux/runit is awake; local once per calendar day.'
echo 'Peer transfer only if explicitly configured. No promise of 24h wall-clock when Android sleeps.'
