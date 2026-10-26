# MHC WordPress + Daily Snapshot add-on (staging)

This is a **non-destructive staging add-on**, not a production-ready HA release and not a replacement for MHC v0.2. It does not modify existing MHC services, database, nginx, Cloudflare or roles.

## Install (Termux on X7B and M51)
Copy archive to home and extract. Then:

```bash
mkdir -p ~/bin
cp ~/mhc-addon/bin/*.sh ~/bin/
chmod 700 ~/bin/mhc-*.sh
~/bin/mhc-wordpress.sh doctor
```

## PHP / WordPress
`~/bin/mhc-wordpress.sh install-runtime` installs PHP/PHP-FPM and other Termux packages; **review on each device first**, as Termux package availability and PHP-FPM service setup vary. `create-site example.com` only creates a directory and example nginx config; it does **not** install WordPress, create databases or activate the site. Configure PHP-FPM, WordPress, Nginx and Cloudflare separately and validate before moving live traffic. Do not run install-runtime on a live host without maintenance/rollback planning.

## Daily backup (manual first)
On the verified Primary only, list databases (one name per line) in `~/.mhc-backup-db-list`. Configure mariadb-dump credentials securely using a protected option file. Create `~/.mhc-backup-primary-approved` after manually confirming role and no split brain. Run `~/bin/mhc-daily-snapshot.sh`. It backs up selected databases and sites under `~/mhc-wordpress/sites`; existing Tho Phuong Pro assets and MHC data are NOT included by default. It does not schedule daily jobs or send backup to M51 yet. Never set the approval marker on Standby.

## Critical pending integration
1. Obtain and inspect exact MHC v0.2 source / current X7B and M51 configurations.
2. Implement safe daily scheduling and transfer from whichever node holds Primary, with SSH host verification, remote checksums, retention and verified restore.
3. Add role/fencing checks to backup job; current approval marker is manual and can become stale after role switch.
4. Add complete website backup coverage, WordPress installation, Nginx integration and tested recovery.
5. Do not enable automatic failover with daily backups without independent fencing and explicit potential data-loss policy.
