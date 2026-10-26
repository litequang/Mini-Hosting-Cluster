# TEST 0.3 — Safe lab deployment and dry-run

## Do not run on existing phones

M51 (`192.168.1.43`, SSH `u0_a288`) and X7b (`192.168.1.35`, `u0_a210`) contain valuable state; TEST 0.3 installer is *not* an upgrade for them. No change to production routing `pro.thophuong.com` or Cloudflare Access. No `ha arm`, `bootstrap-new`, `join-standby`, `promote-standby`, restoring production snapshots, Tunnel starting, or Cloudflare Worker deploy from this kit.

## 1. New disposable Android Termux (never an existing server)

Install fresh supported Termux (e.g. F-Droid) and optional Termux:Boot. Allow persistent foreground/Doze exemptions only on this test device. Require 64-bit aarch64, internet, >=3 GiB free (WordPress content requires additional space). Copy the TEST 0.3 ZIP to Termux `$HOME` with `scp -P 8022` or local Files access.

```bash
pkg update -y && pkg install -y nodejs unzip
unzip MHC-Full-Installer-TEST-0.3.zip
cd MHC-Full-Installer
bash install.sh --plan          # READ ONLY; review STOP flags
bash bin/self-test.sh         # local fake snapshot + script syntax
bash install.sh --install     # type TEST_NEW_DEVICE_INSTALL
~/mhc-full doctor
```

If an `install-incomplete` marker appears, **do not delete the marker and blindly rerun**. Upstream baseline might have installed partial services/DB. Inspect/backup and rebuild a disposable test Termux installation if necessary. `termux-services` may require a new Termux session before runit services work.

## 2. WordPress *local-only* setup (one site example)

WP-CLI is deliberately **not downloaded blindly**. Independently follow verified WP-CLI official installation and signature/release checking; ensure the `wp` command is on PATH. `~/mhc-full doctor` must show `php-fpm`, `mysqli`, `curl`, `mbstring`, `dom`, `zip`, `gd` and local MariaDB. Do not expose :18080/9090/9091 to WAN.

```bash
~/mhc-full wordpress install demo
~/mhc-full serve configure demo localhost
~/mhc-full serve check
~/mhc-full serve start
~/mhc-full serve status
~/mhc-full serve probe demo localhost   # expects nginx -> PHP-FPM -> PHP response
```

On PC tunnel only this loopback port (replace `NEW_PHONE_USER`, IP):

```powershell
ssh -p 8022 -N -L 18080:127.0.0.1:18080 NEW_PHONE_USER@NEW_PHONE_LAN_IP
```

Then visit `http://localhost:18080/` on PC and complete WordPress installer through the site UI. Validate `/wp-admin`, add/edit a post, upload media, change permalink, open PHP logs and retry after Android sleep. For more sites, `serve configure OTHER_SLUG other.test` then use hostname-based requests/SSH tunnel; no public domain is routed automatically. Do not put admin password or `.env` into chat.

## 3. Backup every local calendar day, no other live writers

```bash
~/mhc-full backup run
~/mhc-full backup verify
~/mhc-full restore plan "$(cat ~/hosting-backups/mhc-full/latest-success-path)"
~/mhc-full restore extract "$(cat ~/hosting-backups/mhc-full/latest-success-path)" ~/lab-restore-20261024 --confirm=EXTRACT_ONLY
~/mhc-full restore sql-lab "$(cat ~/hosting-backups/mhc-full/latest-success-path)" demo mhc_restore_demo --confirm=EMPTY_LAB_ONLY
~/mhc-full schedule
```

The snapshot pauses managed WP nginx/php-fpm while exporting SQL and website files, then resumes them. It does **not** fence WordPress CLI, cron, external writers, MariaDB access by another service, or mixed SQL/file cross-transaction writes. To improve consistency, disable cron and every other writer during a maintenance window; The `sql-lab` command can IMPORT the verified SQL dump only into a NEW `mhc_restore_*` database on a machine with the TEST installer marker; it refuses overwrite. It does not recreate credentials, site configuration or complete WordPress recovery. Test end-to-end recovery of users/application separately. Ensure Android doesn't kill Termux; scheduled script checks hourly, runs one backup per calendar day, and retains up to seven. `schedule` is opt-in and refuses to overwrite an existing service definition.

`MHC_FULL_INCLUDE_TPP=1 ~/mhc-full backup run` is solely for a **fresh isolated lab** where `mini-web` is already safely stopped, canonical `thophuong_pro` data configured and all writers quiesced; it is not a safe production M51 backup or a GTID replica. Default is 0.

## 4. Optional backup to independently secured peer/off-device host

On source lab phone, verify passwordless SSH keys, `known_hosts` fingerprint from trusted channel and receiver encrypted storage + restricted permissions first. Receiver should accept SSH, provide `sha256sum`, `gzip`, `rsync`, writable home. Do not reuse secrets/node identities across devices.

```bash
~/mhc-full peer configure PEER_USER PEER_HOST 8022
~/mhc-full peer status
~/mhc-full peer push
```

Receiver target: `~/hosting-backups/mhc-full/incoming/<random-local-source-ID>/snapshot-YYYYMMDD`. Sender transfers to a pending path, verifies SHA256/gzip there, then publishes. No `mariadb` import or peer primary role change. Once configured, the daily schedule tries push after verified local backup, retrying failures hourly. Repeating a push to an already verified snapshot is safe. Beware **archives are not encrypted by this kit**. Do not use a cloud/off-device destination without an approved encryption layer and recovery test.

## 5. What needs real device acceptance to graduate from TEST

Capture sanitized `~/mhc-full doctor`, `serve check`, `serve probe demo localhost`, WP-admin/login/media, SQL snapshot verification and **restore into a separate blank DB/device**. Verify service restart after reboot/Termux:Boot, package availability for PHP, runit lifetime on Android, php-fpm pool permission and Nginx config, snapshots encrypted off-device, and hourly schedule under Doze. Never send production DB dumps, app `.env`, token files or SSH keys in this chat.
