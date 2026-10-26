# MHC Full Installer TEST 0.3.2 — Deploy / acceptance runbook

**TEST-ONLY.** M51 and X7b contain actual data: do **not** run `--install` or `--upgrade` there. Build uses the complete TEST 0.3.1 source with an added local management panel. No public WordPress, GTID, pairing/clone, HA switchover or auto failover.

## 1. Clean NEW aarch64 Termux lab phone

Transfer `MHC-Full-Installer-TEST-0.3.2.zip` into the new phone Termux **home**. Use a non-production phone with at least 3 GiB free and standard Termux PREFIX.

```bash
pkg update -y
pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.2.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
~/mhc-full doctor
~/mhc-full system status
```

Installer asks for literal `TEST_NEW_DEVICE_INSTALL`. It may install packages, create local runit services and alter only the empty lab phone. If install stops partly, **inspect** the `install-incomplete` marker; do not bypass it or blindly rerun. No Panel is started automatically.

## 2. Upgrade an existing **TEST 0.3/0.3.1 lab** phone

Take and verify a separate backup first; keep this ZIP and the previous ZIP. Transfer/extract the full 0.3.2 ZIP and use:

```bash
cd MHC-Full-Installer
bash install.sh --plan
bash install.sh --upgrade
~/mhc-full doctor
```

A completed TEST install marker is required. Confirm `TEST_SOURCE_ONLY_UPGRADE`. This replaces only managed MHC scripts + launcher and saves the previous code under `~/.local/share/mhc-full-installer/rollback/`; it does **not** change existing runtime or production databases. M51/X7b must never use this test upgrade path. Automatically restarting services, automatic rollback and upgrades from unknown base versions are not supported.

## 3. Create a website and start the **local** Panel

```bash
~/mhc-full sites create-static demo
~/mhc-full serve configure-static demo demo.test
~/mhc-full serve check
~/mhc-full serve start              # first time only
~/mhc-full serve probe-static demo demo.test
~/mhc-full panel start
~/mhc-full panel status
~/mhc-full panel token              # SECRET: read privately, don't paste into chat
```

If the Nginx/PHP managed runtime has **already** been provisioned, use `~/mhc-full serve reload` instead of `serve start`. Panel port `19090` is loopback only; website vhost port `18080` is also loopback only. Do not create any Cloudflare/public tunnel to those ports.

On your PC, open an **SSH tunnel** into the new test phone, substituting only that phone's host/IP and Termux SSH login:

```powershell
ssh -p 8022 -N -L 19090:127.0.0.1:19090 TERMUX_USER@TEST_PHONE_IP
```

Then browse `http://127.0.0.1:19090/login` **on the PC** and enter the token from `~/mhc-full panel token`. Keep the SSH tunnel open during use. Do not paste this token into ChatGPT, public logs, code repositories or screenshots. The service's HTTP traffic is plain HTTP **inside the SSH tunnel**; this is not a recommended remotely exposed web admin interface.

Panel allows creating static sites, file listing/upload/download, editing text, ZIP release deploy and rollback. It shows WordPress names only; DB, `.env`, SSH keys, HA, and production config are intentionally excluded. To view a new static site created through Panel, also configure its local vhost from Termux with `serve configure-static SITE SITE.test`, then `serve check` and `serve reload` if runtime is running.

## 4. Backup, restore safety and shutdown

```bash
~/mhc-full backup run
~/mhc-full backup verify
~/mhc-full restore plan "$(cat ~/hosting-backups/mhc-full/latest-success-path)"
~/mhc-full restore extract "$(cat ~/hosting-backups/mhc-full/latest-success-path)" ~/empty-test-restore --confirm=EXTRACT_ONLY
~/mhc-full panel stop
```

Daily snapshot/schedule/peer features are **unchanged** from 0.3.1. Panel file edits serialize with snapshot operations. This does **not** fence cron, external DB clients, WordPress jobs or other writers; backup is not a cross-site point-in-time atomic snapshot, not MariaDB GTID replication and not a guarantee of RPO=0. Peer backup archives can carry secrets in cleartext; use encrypted storage and verified SSH keys.

## 5. Minimal on-device acceptance (not yet completed)

1. Confirm `~/mhc-full doctor` and `serve check` with actual Termux `nginx` + `php-fpm` and check `sv status mhc-full-panel`.
2. Verify panel login through SSH tunnel, bad password lockout, session logout, uploading `index.html`, ZIP deploy + rollback; confirm no interface listens on `0.0.0.0:19090`.
3. Install WordPress through separately verified WP-CLI; test local PHP probe, real admin login, permalink and media upload. Do not declare WordPress production on a PHP version/plugin combination that has not passed acceptance.
4. Verify daily snapshots with SQL and static files, test lab SQL restore, test peer SSH delivery, repeat after Android Doze/reboot, check battery permissions/Termux:Boot.
5. Perform a dry-run export to encrypted **off-node** storage and restore to an **empty** separate test phone. Do not restore onto M51/X7b.

**Required before production:** an authenticated/authorized controller, multi-node enrollment, canonical GTID + file delta sync, edge write ingress gate, fencing, partition tests and DB/asset recovery runbooks.
