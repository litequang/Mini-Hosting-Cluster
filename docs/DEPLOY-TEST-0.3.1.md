# MHC Full Installer TEST 0.3.1 — Install & upgrade guide

**This is an experimental Android Termux server kit, not a production cluster release.** TEST 0.3.1 adds a server feature slice to the **original TEST 0.3 Full Installer**, not to Cluster feature milestone v0.3B. Installer packages the full source, not a standalone patch. On clean nodes, one ZIP is sufficient. **DO NOT run clean-install or code upgrade on M51 or X7b.**

## What is new and what is not

- **New source**: static website creation, unique loopback Nginx virtual hosts, ZIP upload by explicitly running CLI (not from a public Panel), guarded ZIP extractor (reject traversal, symlinks, unsafe server-source extensions, malformed archives, oversized archives), old static release preservation + manual rollback; `serve reload` and `probe-static`; read-only `system status`; static sites in daily snapshot, safe offline tar inspection, improved WordPress wp-config Nginx deny; source-only upgrade path from TEST 0.3 on an isolated test phone.
- **Kept from TEST 0.3**: localhost-only WordPress vhosts, isolated PHP-FPM, daily MariaDB + files archive with integrity checks, manual verified SSH peer copy and empty-lab-DB import. MHC HA Controller, Safe Control and v1.0 overlay remain **unactivated**; no GTID, auto-clone, manual/auto failover, Cloudflare production routing or public WordPress.
- **NOT VERIFIED**: Full Installer runtime on real Android device, WP-CLI install & real WP login/media, PHP-FPM / Nginx live probe, repeated backups after Android sleeps, bidirectional backup real SSH, real MariaDB restore or production-safe TPP restore. Default is TEST only.

## A. Fresh disposable phone — all in one ZIP

Install F-Droid Termux on a **new disposable aarch64 phone** with >= 3GiB free and Internet. Copy `MHC-Full-Installer-TEST-0.3.1.zip` to `$HOME` in Termux. `Termux:Boot` (optional) requires device-specific permission setup. Plan/diagnostics are read-only.

```bash
pkg update -y
pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.1.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
~/mhc-full doctor
~/mhc-full system status
```

Confirm the `TEST_NEW_DEVICE_INSTALL` prompt only on a truly clean disposable test device. Installing packages, starting local services and writing new files **are real changes**. On partial failure, the `install-incomplete` guard blocks blind retries. The upstream baseline installer is not fully transactional. Do not remove the marker without inspection. No M51/X7b installation, `.env`, DB, Tunnel, HA lease, or Cloudflare route is included in the ZIP.

## B. Existing disposable TEST 0.3 machine — source-only upgrade

This is a different mode from clean install, from the **same complete ZIP**. Preserve your own backup and review `--plan` first. Upgrade does NOT modify WordPress files, MariaDB, PHP-FPM/Nginx configurations, existing runit services, cloud routes or runtime service states. It can install Python 3 as a supporting Termux package if absent. It refuses a non-matching installed marker, incomplete install, running backup, TPP `.env` or a present HA policy file.

```bash
pkg install -y unzip nodejs
unzip MHC-Full-Installer-TEST-0.3.1.zip
cd MHC-Full-Installer
bash install.sh --plan
bash install.sh --upgrade
~/mhc-full system status
```

Type `TEST_SOURCE_ONLY_UPGRADE` only on the isolated test phone. The prior `bin/` code, launch wrapper and version marker are preserved in `~/.local/share/mhc-full-installer/rollback/<timestamp>/` for **manual recovery**; service configuration is not rewritten. Do **not** apply this upgrade path to an existing M51/X7b hosting deployment. Upgrading from unknown releases or automatically rolling back partial failures is not supported.

## C. Create a local static website without WP-CLI

```bash
~/mhc-full sites create-static landing
~/mhc-full sites list
~/mhc-full serve configure-static landing landing.test
~/mhc-full serve check
~/mhc-full serve start
~/mhc-full serve probe-static landing landing.test
```

`serve start` is for a runtime that has **not yet been provisioned** (it refuses to overwrite existing runit service files). If another managed vhost was added **after** that initial start, run `~/mhc-full serve check && ~/mhc-full serve reload` to activate the new site. All virtual hosts are bound to `127.0.0.1:18080`; from another device, use authenticated SSH forwarding and specify the matching Host header, e.g. `curl -H 'Host: landing.test' http://127.0.0.1:18080/`. No routing for real public domains is created automatically.

Put `index.html` at the **top level** of `landing.zip` (not one directory deeper). No PHP, executable server code, `.env`, symlinks or other sensitive files are allowed inside a static site archive. Directories/files are extracted with restrictive permissions; document roots are only the explicitly managed site locations.

```bash
~/mhc-full sites deploy-static landing ~/landing.zip
~/mhc-full serve check
~/mhc-full serve reload
# If this static release is wrong:
~/mhc-full sites rollback-static landing --confirm=ROLLBACK_STATIC
```

Rollback only moves static website releases, **NOT MariaDB or WordPress**, and does not change Cloudflare. Manual inspection and a backup are still expected before real data management. Old static releases are kept on-device; review storage use.

## D. WordPress local setup (same behavior as TEST 0.3)

Get a verified official WP-CLI separately; **this kit deliberately does not execute an unverified WordPress download command for CLI**. WordPress Core is downloaded only by WP-CLI. Ensure required PHP modules exist. MariaDB remains loopback-only.

```bash
~/mhc-full wordpress install demo
~/mhc-full serve configure demo demo.test
~/mhc-full serve check
~/mhc-full serve start       # only if managed runtime is not yet created
~/mhc-full serve probe demo demo.test
```

If managed runtime already exists, use `serve reload` instead of `start`. Verify actual WP admin flow/login/permalinks/media upload, and full offline recovery before calling this production. Do not expose ports 9090/9091/9092 or 18080 directly on the WAN.

## E. Backups (WordPress + static), restore and peer

```bash
~/mhc-full backup run
~/mhc-full backup verify
~/mhc-full restore plan "$(cat ~/hosting-backups/mhc-full/latest-success-path)"
~/mhc-full restore extract "$(cat ~/hosting-backups/mhc-full/latest-success-path)" ~/empty-restore-test --confirm=EXTRACT_ONLY
~/mhc-full schedule
```

Backup runs once per local calendar day when active; schedule retries hourly when Termux/runit is awake, retains seven local snapshots. Managed WordPress ingress is briefly stopped for snapshotting. **Other application/DB writers/cron/direct MySQL access are not fenced**, so the result is NOT an atomic cluster snapshot or guaranteed RPO=0. The offline tar guard refuses links and path traversal (some third-party WordPress themes using symlinks may therefore require a separate reviewed recovery procedure). SQL restore is only into a **freshly created disposable** `mhc_restore_*` DB with explicit confirmation, not a full WordPress restore.

For trusted peer backup only, manually set up pinned SSH keys and encrypted destination storage before:

```bash
~/mhc-full peer configure PEER_USER PEER_HOST 8022
~/mhc-full peer push
```

Peer snapshots contain database and site secrets **in plaintext inside archives**; **do not transfer to unencrypted off-device storage**. Off-cluster encrypted backup and independent restore are not yet built into this version.

## F. Acceptance checklist and safety stop

- Runtime: fresh Termux package installation succeeds and every service is controllable; real WordPress PHP request and static Host-header probe return correct content.
- Persistence: repeat after Termux restart, Android sleep, disconnect and restart; runit and backups show truthful errors.
- Recovery: verify a snapshot, offline-extract on another empty location, import SQL into a new lab database and manually check application behavior.
- Security: verify no public routing or TLS claims, no exposed admin panels, no running HA, no scripts overwriting M51/X7b DB/Tunnel.
- For actual HA: **not in this release**. Node joining, canonical MariaDB GTID, storage catch-up, lease/fencing, active edge gate and traffic switch remain future milestones.

Do not paste database dumps, `.env`, private SSH keys, access tokens or Cloudflare credentials into chat.
