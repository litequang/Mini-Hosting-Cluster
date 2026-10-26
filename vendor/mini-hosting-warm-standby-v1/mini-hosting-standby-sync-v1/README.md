# Android Mini Hosting — Standby Sync v1.0

**Purpose:** Keep a restored SECOND Android phone up to date with the latest fully verified Thờ Phượng Pro snapshots generated on M51. **One-way transfer.** The spare remains private, with `mini-web` and `named-tunnel` disabled until a human decides to promote it.

## What it does, and does NOT do

- Every 10 minutes, the standby phone checks `latest-success-path` via private LAN SSH (no public SSH port or Cloudflare changes).
- When a newer completed snapshot exists, it copies the snapshot using `rsync`, verifies SHA-256, verifies SQL gzip/tar, prepares a **shadow MariaDB database** and an **immutable new application/storage directory**. It changes the local `~/apps/thophuongpro` symlink only when all staging steps are completed.
- It retains the previous database and releases, so a failed stage does not deliberately overwrite the previously prepared release.
- Does not modify any data on M51; does not connect either phone's Cloudflare Tunnel; does not serve the secondary app publicly; does not create extra daily backups.
- **It is NOT live replication**. The M51 backup scheduler presently creates ONE snapshot at 03:00 per day; thus sync polling every 10 minutes does **not** mean DB data freshness of 10 minutes. RPO can approach **24 hours**, plus downtime/connectivity. If this is unacceptable, install a properly tested MariaDB GTID replication + file synchronization pipeline separately.
- MariaDB logical restore to `thophuong_standby_a` / `thophuong_standby_b` relies on the current app being compatible with a variable MYSQL_DATABASE value. A custom SQL view, procedure, query, or user-defined code hardcoding the old DB name may prevent that; in that case the stage must fail rather than receive live traffic.
- MariaDB event scheduler is disabled during each stage import, and the Node app service remains off while standby. Do not enable external jobs on the standby.
- This is NOT automatic failover. Promotion still requires manual fencing of the M51 Tunnel and an explicit confirmation, to prevent split-brain writes. After promoting, this phone is the primary: do not resume old standby sync.

## Prerequisites

1. Use a different, modern **aarch64 Android phone**, with Termux + Termux:Boot installed and allowed to run in background. Have at least **5 GB** of free storage (more as library grows). Keep phone charging and on stable Wi-Fi.
2. Install and restore **Mini Hosting Disaster Recovery Kit v1.0** on the spare, including the encrypted `mini-hosting-recovery.enc` and a verified data snapshot. `restore-new-phone.sh` must finish with `LOCAL RECOVERY SUCCESS` and leave `~/recovery-input/RECOVERED.txt`.
3. The M51 production phone is running `sshd` on port 8022 and `tpp-backup`. Both phones should be on the **same trusted LAN**, with addresses that stay consistent, such as via DHCP reservations. M51 must have `rsync` installed: `pkg install rsync`. On the standby install `pkg install rsync openssh`.
4. Do not run these scripts on M51. The installer checks the secondary's `RECOVERED.txt` marker.

## Setup — SECONDARY PHONE only

Transfer the ZIP to `~/`, unzip it:

```bash
unzip -o ~/mini-hosting-standby-sync-v1.zip -d ~
pkg install -y rsync openssh
bash ~/mini-hosting-standby-sync-v1/bin/setup-standby.sh
```

Enter the LAN IP of M51, SSH username (e.g. `u0_a288`), and SSH port (default `8022`). It creates an SSH key on the spare, and `ssh-copy-id` asks the M51's SSH password once to authorize this key. **Verify the SSH host fingerprint before accepting it.** It does NOT ask for MariaDB/Cloudflare secret credentials in chat.

If M51 says `rsync: command not found`, on the **M51** run `pkg install rsync`, then retry on standby. After successful setup, a new runit service `standby-sync` polls every 10 minutes, automatically.

To trigger a sync immediately on standby:

```bash
~/standby-sync/sync-once.sh
```

To see status:

```bash
~/standby-sync/status.sh
tail -n 30 ~/.local/state/standby-sync/log/current
```

`STANDBY PREPARED (LOCAL ONLY; TUNNEL OFF): snapshot-...` means the latest snapshot was verified and prepared; it does **not** mean all website functions passed an end-to-end health test. Until that line appears for the first sync, the standby still has its earlier restored snapshot.

## Failover after PRIMARY M51 stops

**Safety rule:** Do not run this when M51 still accepts public writes. Ensure its named Tunnel connector is stopped, or revoke the old connector token if the phone is lost. If it has been lost/stolen, rotate other potentially exposed credentials as appropriate.

On the standby phone:

```bash
bash ~/mini-hosting-standby-sync-v1/bin/promote-standby.sh
```

Enter `PRIMARY_FENCED` after confirming the old M51 can no longer serve public writes. This stops periodic sync, starts Node, checks localhost Node & Nginx and confirms database tables. It **does not activate Tunnel**.

Inspect the app via localhost/SSH forwarding and verify that Panel login, Dashboard, Sheet/Sheet+ all work; then:

```bash
bash ~/mini-hosting-dr-v1/bin/activate-tunnel.sh
```

Cloudflare hostname routes and Cloudflare Access protection must be checked as in DR Kit v1.0. Do not attach the same tunnel to both devices while they can serve different databases.

## Source truth, failures, and security

- The transferred snapshot includes `.env`, authentication settings, database, and uploaded assets: the secondary Termux account therefore becomes another holder of private production data. Use screen lock, disk encryption, and only private LAN.
- If the M51 is offline, syncing fails without erasing the last completed standby state.
- If the staging DB import or archive validation fails, the already prepared standby remains unchanged. The app is not served publicly during sync.
- If a failed staging process exhausts disk, clean up only old `.pending` snapshot/release directories after inspecting `status.sh` and `df -h`; never delete the latest applied release or active MariaDB stage database.
- If code/npm dependencies changed, script may need Internet for `npm ci`. Failures preserve previously applied slot.
- Full end-to-end restore has not been tested on the user's actual second Android device. The package is a foundation that requires device validation, particularly app DB schema assumptions and Termux package compatibility.
- **Automatic failover is intentionally NOT included.** With Cloudflare replicas using one Tunnel UUID, incoming requests may be routed to different backends; for separate health-checked origins you need Cloudflare load balancing and correctly fenced single-writer data state.
- To achieve ~minute-level RPO, migrate from daily dump/pull to MariaDB GTID async replication and incremental file synchronization, with a recovery drill and continuous lag checks.
