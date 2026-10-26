THO PHUONG PRO — AUTOMATIC BACKUP v1, for Samsung M51 / Termux

WHAT IT DOES
* Daily at/after 03:00 (device local time), best-effort while Termux/runit is running.
* Runs once on any day after 03:00, including after later startup; retries failed backup no more often than hourly.
* Creates a MariaDB logical SQL backup, persistent storage (sheets and any other storage files), and current app release/.env.
* Checks compression and SHA256 checksums before marking backup successful.
* Keeps last 7 *successful* snapshots under ~/hosting-backups/thophuongpro; failures do not delete previous backups.
* No changes to website deployment, Panel, Nginx, Cloudflare or SQL data.
* M51 local-only protection. NOT a disaster recovery backup until copied elsewhere.

INSTALL (run in Termux on M51 after uploading and extracting the ZIP)
  bash ~/tpp-backup-v1/install.sh

MAKE FIRST BACKUP NOW
  ~/.local/share/tpp-backup/backup-now.sh

VERIFY LATEST BACKUP
  ~/.local/share/tpp-backup/verify-latest.sh

STATUS & LOGS
  sv status "$PREFIX/var/service/tpp-backup"
  tail -n 30 ~/.local/state/tpp-backup/log/current
  du -sh ~/hosting-backups/thophuongpro
  ls -lah ~/hosting-backups/thophuongpro

PAUSE AUTOMATIC BACKUPS
  sv down "$PREFIX/var/service/tpp-backup"
RESUME
  sv up "$PREFIX/var/service/tpp-backup"

SECURITY & LIMITATIONS
* Archives include passwords and secrets (.env). Directory is chmod 700. Do not publish these archives via web, cPanel File Manager public_html, or a public cloud link.
* Cloudflare token and the Mini Panel's own private data are NOT included. Back them up separately using secure encrypted procedures.
* Filesystem snapshot can differ slightly in time from live MariaDB dump if users upload files during backup. For full consistency, schedule a quiet maintenance window.
* Daily run depends on Termux:Boot / runsvdir being alive and Android not terminating Termux. It is not guaranteed while the phone is asleep/killed.
* Verifying SHA256 checks archive integrity, NOT that SQL can be restored. Periodically practice restore to a DIFFERENT database on a test system.
* External storage roots for assets other than SHEET_STORAGE_ROOT are not auto-detected. Audit other upload paths before treating this as a full disaster recovery solution.
* SQL exporter assumes Termux local socket root login `mariadb --no-defaults -u root` as verified previously.
* --single-transaction gives consistent snapshot for InnoDB; other storage engines may require additional procedures.
