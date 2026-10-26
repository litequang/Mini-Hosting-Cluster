# TEST 0.3.9 — Android acceptance / Cluster integration LAB guide

> This version **supplies an acceptance toolkit, not the evidence of a completed Android test**. Use only new/isolated test phones. M51 and X7b production remain unchanged.

## 0. Prepare

- Keep the physical LAB phone separate from the real Cluster, its Cloudflare routes and its production SSH keys, DB dumps, `.env` and secrets.
- Install Termux from a maintained compatible source, enable its repository and Internet access; make enough free storage available (at least 3 GiB before baseline install, plus sufficient capacity for snapshots).
- Android battery optimization and Termux:Boot behavior can interrupt unattended jobs; neither installer self-test nor a process that has run for a minute proves 24-hour reliability.
- Use *two* disposable phones only when testing enrollment/heartbeat/clone. Preserve and verify their SSH server fingerprints rather than disabling host-key checking.

## 1. NEW LAB Android only — install

Transfer `MHC-Full-Installer-TEST-0.3.9.zip` to Termux `$HOME`, then:

```bash
pkg update -y
pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.9.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
~/mhc-full doctor
~/mhc-full accept check
~/mhc-full accept report
```

`install.sh --install` requires typing `TEST_NEW_DEVICE_INSTALL`. **Never bypass guards** when pre-existing hosting/HA is found. Verify package availability for your Termux repository; code tests do not establish that `php-fpm` or optional PHP packages are present on a given phone.

## 2. Existing disposable TEST 0.3.x LAB only — code-only upgrade

Back up LAB data; check there is no ongoing backup and no HA configuration. From the *new unpacked* TEST 0.3.9 directory:

```bash
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --upgrade
~/mhc-full accept check
```

The script expects the installation marker from a known TEST 0.3.x release and confirmation `TEST_SOURCE_ONLY_UPGRADE`. Upgrader does not restart running services. If Panel needs new code, restart it **only on LAB** and inspect local rollback directory. It is not a production updater.

## 3. On-device acceptance matrix

| Component | Test on actual new Android LAB phone | What counts as evidence | What does **not** count |
|---|---|---|---|
| Installer | Run `--install`, reboot Termux, inspect `accept check` | Marker and tool availability, no incomplete-install flag | Archive extracted on Linux |
| Nginx/PHP-FPM | Configure a WordPress vhost, `~/mhc-full serve check`, `~/mhc-full serve start`, `~/mhc-full serve probe SLUG HOST` | Actual localhost request executes throwaway PHP and responds with expected token | `nginx -t`, `php-fpm -t` alone |
| WordPress | Install verified WP-CLI, provision a test WordPress, finish WordPress setup through loopback, check login/media/permalinks/update | Each operation passes and is documented on Android | A 200 from `/` alone |
| MariaDB | Check `SELECT 1`, then make a new LAB-only sample DB snapshot and recover into an **empty LAB DB** after inspecting contents | SQL restore, table counts and application reads match | Successful `mariadb-dump` alone |
| Static hosting | Create site, configure vhost, `serve start`, `~/mhc-full accept site demo local.test` | PASS for loopback HTTP; static content visually correct | Assumed public HTTPS |
| Backup | `~/mhc-full backup run`, `backup verify`, `accept check` | Snapshot checksum PASS; restore files to fresh empty LAB directory | Checksum PASS as proof of SQL/files atomicity |
| Peer transfer | Pair two LAB phones by known SSH fingerprint, clone an approved snapshot, verify on destination | SHA256/restore lab results on node B, not only controller's claim | Enrollment alone |
| Telemetry | Node B `node heartbeat`, controller `/cluster` via SSH port forwarding | Fresh authenticated heartbeat and member report, then expected stale alert after disconnection | Marker `primary` / stale inventory |
| 24h scheduler | Observe two real scheduled backups after sleep/reboot and test retention/failure reporting | Timestamped snapshots plus Android log and manual restore drill | Existence of a cron/runit script |

### Safe, read-only diagnostic commands

```bash
~/mhc-full accept check                  # human-readable categories
~/mhc-full accept check --json           # machine-readable to stdout
~/mhc-full accept report                 # JSON, mode 0600, under private config folder
~/mhc-full accept site demo local.test   # host-scoped HTTP to 127.0.0.1:18080 only
~/mhc-full cluster status                # Cluster observation, not HA authority
```

Do not paste full `~/mhc-full doctor` output without checking for any unusual environment details. The acceptance report contains **only fixed status fields and no credentials**, but always inspect it before sharing.

`accept check` returning shell exit 0 means it ran; it **does not mean acceptance passed**. Verify warning/blocker rows. Its `ha-promotion` row is deliberately `BLOCKED`: HA has not been certified.

## 4. LAB tests involving real changes — opt in separately

If a new LAB static site was registered earlier:

```bash
~/mhc-full sites create-static demo
~/mhc-full serve configure-static demo local.test
~/mhc-full serve check
~/mhc-full serve start
~/mhc-full accept site demo local.test
```

For WordPress use the dedicated `wordpress install` and `serve configure` commands from older runbooks. Use `serve probe` only on disposable LAB, because it writes and requests a temporary PHP file, then removes it. Never execute untrusted WordPress plugins in the primary Termux user environment.

For a true MariaDB restore drill, first confirm isolation and source metadata; use existing guarded `restore sql-lab SNAPSHOT SOURCE_SLUG mhc_restore_NAME --confirm=EMPTY_LAB_ONLY` on a new LAB DB. This can create/partially import a database; do not confuse it with the `accept` read-only diagnostics.

## 5. Enrollment/monitor integration

The earlier TEST 0.3.8 guide covers one-use enrollment, heartbeat on demand and local `/cluster` Panel. These are retained unchanged. On the test controller, review both `~/mhc-full cluster status` and the member's own `~/mhc-full clone standby-status`; **remote telemetry is the member's claim, not verification by the controller**.

## 6. What remains before v0.4 GTID

- Record *real* Android acceptance evidence for PHP, WordPress, MariaDB restore, peer SSH, background services, daily backup and Panel.
- Fix any failures found on the devices; this release cannot infer hardware-specific results.
- Implement v0.4 GTID and incremental file replication only after lab deployment passes, with fencing/lease design still requiring separate later HA stages.
- Full off-node encrypted, independent disaster recovery and production-safe rolling upgrades remain future work.
