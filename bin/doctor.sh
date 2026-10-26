#!/data/data/com.termux/files/usr/bin/bash
set -u
printf 'MHC TEST 0.5.0C-WRITER-AUDIT doctor — READ ONLY\n'
printf 'Device: ';getprop ro.product.model 2>/dev/null || echo unknown
printf 'Arch: ';uname -m
for c in node nginx mariadb mariadb-dump php php-fpm python3 wp curl sha256sum rsync ssh sv;do
  command -v "$c" >/dev/null && echo "FOUND $c: $(command -v "$c")" || echo "MISSING $c"
done
php -v 2>/dev/null | head -2 || true
php -m 2>/dev/null | grep -Ei 'mysqli|curl|mbstring|dom|xml|zip|gd|intl|openssl|opcache' || true
for s in mysqld nginx amh-panel mini-web named-tunnel mhc-ha mhc-full-wp-php mhc-full-wp-nginx mhc-full-daily-backup mhc-full-panel mhc-full-heartbeat;do sv status "$s" 2>/dev/null || true;done
printf 'Free space: ';df -h "$HOME" | tail -1
[[ ! -e "$HOME/.config/mhc-full-installer/install-incomplete" ]] || echo 'WARNING: Partial install marker exists. Do NOT blindly reinstall.'
[[ ! -f "$HOME/.config/mini-hosting-cluster/ha.json" ]] || echo 'CAUTION: HA policy file exists; staging installer does not prove a lease.'
if [[ -f "$HOME/hosting-backups/mhc-full/latest-success-path" ]];then
  echo 'Latest local snapshot exists (verify separately):';cat "$HOME/hosting-backups/mhc-full/latest-success-path"
fi
"$HOME/mhc" status 2>/dev/null | head -8 || true

echo 'Managed websites (metadata only):'
"$HOME/.local/share/mhc-full-installer/bin/sites.sh" list 2>/dev/null || echo 'Site inventory unavailable'
