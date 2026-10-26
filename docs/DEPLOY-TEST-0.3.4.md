# MHC TEST 0.3.4 — Full node snapshot clone (safe offline lab stage)

**Allowed targets: completely new/disposable Android aarch64 Termux test phones ONLY.** M51 (`192.168.1.43`) and X7b (`192.168.1.35`) contain real hosting data: **DO NOT INSTALL, UPGRADE, RUN CLONE, RESTORE OR ARM HA THERE** using this build. Controller means SSH enrollment inventory controller, not the production Primary, witness or Cloudflare owner.

## 1. Install test phones (All-in-One; no separate patches)

Copy `MHC-Full-Installer-TEST-0.3.4.zip` into Termux HOME:

```bash
pkg update -y && pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.4.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
~/mhc-full doctor
```

Type the explicit `TEST_NEW_DEVICE_INSTALL` confirmation if everything is really new. The installer installs server tooling, including packages with potentially long downloads, and may leave a partial marker on failure. Do not run it again blindly. It does not create a cluster or connect to cloud automatically.

**Code-only upgrade** on a test phone with a completed TEST 0.3–0.3.3: make a verified backup, use this full 0.3.4 ZIP, then `bash install.sh --plan && bash bin/self-test.sh && bash install.sh --upgrade`, type `TEST_SOURCE_ONLY_UPGRADE`. This updates managed MHC scripts only; no database migration, website restore, daemon restart or cloud changes. Android upgrade has not been accepted on real devices yet.

## 2. First set up SSH enrollment (TEST 0.3.3 prerequisite)

On an **empty lab controller**, after installing TEST 0.3.4:

```bash
~/mhc-full node init 'Lab Source'
~/mhc-full node cluster-init
~/mhc-full node invite 10
```

On an **empty lab candidate**, after installing TEST 0.3.4:

```bash
~/mhc-full node init 'Lab Candidate'
~/mhc-full node join SOURCE_IP SOURCE_TERMUX_USER 8022
~/mhc-full node heartbeat
```

Before `join`, separately verify the SSH server host-key fingerprint and authorize a candidate public key on controller. Never disable StrictHostKeyChecking or share tokens. For restricted SSH `authorized_keys`, the controller command is the SAME existing node enrollment RPC:

```
restrict,command="/data/data/com.termux/files/usr/bin/node /data/data/com.termux/files/home/.local/share/mhc-full-installer/bin/node-enroll.mjs rpc" ssh-ed25519 ACTUAL_VERIFIED_CANDIDATE_PUBLIC_KEY
```

This SSH forced command now understands `~/mhc-full clone rpc` requests in addition to `node accept` and `node heartbeat-accept`. Verify `~/mhc-full node list` on controller and `~/mhc-full node status` on candidate. Authenticated heartbeat is not proof of replica readiness.

## 3. Prepare a **new** daily snapshot on the controller

Create static/WordPress lab sites as needed. Example test static site:

```bash
~/mhc-full sites create-static demo
~/mhc-full backup run
~/mhc-full backup verify
```

This backup is only suitable if no other process can write unsafely while the snapshot is made. WordPress/PHP/MariaDB must be accepted on-device before treating the snapshot as recoverable. **Snapshots produced before TEST 0.3.4 may include node identity, cluster auth or Panel token in the configuration tar and are rejected for cloning.** If today already has a snapshot, `backup run` verifies and reuses it instead of overwriting it. Wait for a new day's snapshot; do not delete or rewrite existing snapshots casually.

## 4. Explicitly approve a clone to one enrolled UUID

On controller:

```bash
~/mhc-full node list
~/mhc-full clone offer CANDIDATE_NODE_UUID latest --confirm=LAB_CLONE_ONLY
~/mhc-full clone status
```

`latest` points to `~/hosting-backups/mhc-full/latest-success-path`. Source validates archives, SHA256 and disallows exporting node identity/admin credentials. **Offer lasts 24 hours**, is bound to a specific node and snapshot. Controller's snapshot may hold database credentials, files and WordPress secrets, so ensure **encrypted storage at both ends** and private SSH routing before approval. To revoke a pending approval:

```bash
~/mhc-full clone revoke CANDIDATE_NODE_UUID
```

Revocation prevents new reads; it cannot remotely wipe bytes already downloaded.

## 5. Fetch on enrolled EMPTY lab candidate

```bash
~/mhc-full clone fetch
~/mhc-full clone status
```

This requests a signed manifest over verified SSH and fetches only the offered files, checking each SHA256 and size. It stores them in a private, separate data directory, not the active website. Successful transfer still does **not** mean site is running or DB is imported.

Path pattern:

```
~/hosting-clones/mhc-full/incoming/<source-node-uuid>/snapshot-YYYYMMDD/
```

The operation requires an empty candidate website inventory, excludes production/HA-marked nodes, and does not overwrite a previous clone. If transfer fails, an incomplete `.pending-...` or `.part` may remain. Inspect and compare before manual cleanup; retrying the same approved snapshot reuses successfully verified files but fails closed on an incomplete `.part`. It never restores into the original live directories.

## 6. Extract offline and inspect recovery payload

On candidate:

```bash
~/mhc-full clone stage
```

Offline result:

```
~/hosting-clones/mhc-full/staged/<source-node-uuid>/snapshot-YYYYMMDD/
  websites/          # backed-up WP/static site files, NOT active
  mhc-full-installer/ # site configs; node identity/tokens deliberately excluded
  database-dumps/    # compressed SQL dumps, NOT imported
  tpp/               # optional storage/release/sheet files, NOT running
```

To test importing a WP database **into a separately named disposable schema only**, use the already-existing guarded `~/mhc-full restore sql-lab SNAPSHOT demo mhc_restore_demo --confirm=EMPTY_LAB_ONLY` and review the SQL dump first. This cannot be interpreted as permission to import onto M51/X7b. No website is activated or assigned a domain by clone.

## 7. Acceptance still required on actual Android test phones

1. Fresh aarch64 Termux preflight, package availability, runit and Power/Doze restart behavior.
2. SSH host-key pinning, public-key restriction, token expiry and disk exhaustion with multiple phones.
3. MariaDB dump/restoration in isolated lab schema; WordPress admin, uploads, permalinks, plugin requirements on local PHP-FPM/Nginx.
4. Restore Sheet/Sheet+ data with app metadata and compare counts/checksums to source; no production `.env` transplant.
5. Try revoked offer, malicious archive, missing file, disk-full, broken SSH, mismatched hashes, failed retries and reboot during transfer.
6. No writes to active sites/DBs, no Cloudflare DNS or named-tunnel changes, no permission to become Primary. Until GTID and file catch-up exist, clone is a **point-in-time backup, not an up-to-date standby**.

**Next v0.3C.2**: isolated lab restore orchestration with tested new DB/users, sanitized config rewrite, controlled local smoke probe and clone health report. **v0.4**: GTID and file delta replication, then v0.5 manual switch, v0.6 auto failover once fencing and origin gate proven.
