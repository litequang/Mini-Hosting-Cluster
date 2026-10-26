# Operations and rollback

## Panel unreachable

Termux SSH: `sv status amh-panel`, `tail -n 80 "$PREFIX/var/log/sv/amh-panel/current"`; service `sv restart amh-panel`. If SSH tunnel is not open on PC, use `ssh -N -L 9090:127.0.0.1:9090 -p 8022 USER@M51_IP`.

## Revert Nginx integration

Open `$HOME/.nginx/nginx.conf`, locate the line containing `/android-hosting-panel/data/nginx/sites/*.conf` and remove only that line, then `nginx -t -p "$HOME/.nginx" -c "$HOME/.nginx/nginx.conf"` and `nginx -s reload -p "$HOME/.nginx" -c "$HOME/.nginx/nginx.conf"`. Installer does not modify Nginx at all; only pressing "Tích hợp Nginx" does. Copies exist as `.amh-backup-<timestamp>`. If needed, copy a verified backup back and reload. Existing pro.thophuong.com settings preserved.

## Emergency restore

- Website content prior to ZIP/git deploy kept at `data/sites/<slug>/app-previous-<timestamp>` or `public-previous-...`. Stop site service, move current aside, rename desired previous to `/app` or `/public`, restart service.
- Deleted site is moved to `data/trash/<timestamp>-<slug>`, not erased. To restore, you must recreate site record and nginx block or restore from backup; no one-click undo currently.
- Database backup `.sql` to be downloaded from UI. Avoid restoring over live production DB without a maintenance window.

## Security

Never route `127.0.0.1:9090` through Cloudflare as an unprotected Published Application. SSH private key and IP allow-list recommended. All Node apps share one Android UID with the panel, thus not suitable for untrusted code/users.
