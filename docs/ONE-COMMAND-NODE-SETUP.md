# MHC — one-command Termux node rollout and XZ3 reboot recovery

Date: 2026-10-26. Release source pinned to `2f14deb8d6fc31118a4bbc6b0a67e38bc2049767` on `codex/m1-m2-foundation`. These are source deliverables, **not** acceptance evidence from the two actual phones. MHC remains `SHARED_AUTHORITY_PREPARE_ONLY`; no writer or route failover.

## Fresh unprovisioned aarch64 Termux phone

Prerequisites Android apps installed from compatible signing source: **Termux**, **Termux:Boot**, **Termux:API**. Open Termux:Boot once after installation. On device Settings set unrestricted battery for all three; on Sony disable STAMINA. Non-root Android cannot grant these permissions from Shell, so end-user action is still required. Use charger+ventilation and monitor battery temperature.

One pasted command INSIDE Termux (or an authenticated SSH terminal session):

```sh
curl -fLsS https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/e4bd8cfbdebfa0aa8a3b2c1956cb04f44ee92f34/scripts/bootstrap-new-android-node.sh -o ~/mhc-bootstrap.sh && bash ~/mhc-bootstrap.sh --install
```

The bootstrap refuses existing MHC/website/HA files, installs Termux CLI packages including `termux-api`, fetches immutable source, invokes existing clean full installer, installs original Panel+new Monitor CSS and frontend, requests wake lock, starts runit/SSH/Panel/MariaDB/Nginx as defined by baseline, writes managed Termux:Boot script, checks localhost 9090 and battery API. The standard Panel's initial local admin password is generated and printed once by its setup. Do not share it. A node's site writer, Cloudflare external Tunnel, production DB restore or Primary role are **not** activated by this bootstrap.

The bootstrap is deliberately **fresh-only**. Do not run it on Vsmart/XZ3/M51/any initialized device.

## Single-code pairing

Once the **existing Cloudflare Worker** has been upgraded with this release's `reference/cluster-authority/worker.mjs`, and the Vsmart Panel code has been updated with the matching one-command existing-node release:

1. Sign in to `https://panel.giaouoc.com` using Cloudflare Access authorized email.
2. Open **Cluster → Thêm điện thoại mới → Tạo mã ghép 10 phút**.
3. Copy the *single* generated command and paste into the **newly bootstrapped** Termux. It is `~/mhc-full join "MHC1...."`; it includes the public authority URL, cluster UUID and a 192-bit one-time secret. It is sensitive; do not put it in screenshots/chats/logs.
4. Node locally creates identity and 2 unique credentials, calls HTTPS Cloudflare Worker, obtains durable enrollment, stores private files (0600/0700) and starts management-only `mhc-authority-agent`. Panel Monitor auto-shows the node after fresh heartbeat and metric readouts.
5. It joins **Standby** only. Backup/restore, website app deployment, replicated data and Primary selection remain operator activities not automatically executed.

Worker join uses Durable Object transactions, only a matching unused code less than 10 min old, dynamic SHA-256 credential digests, role separation (agent cannot create invites), replay rejection, static Vsmart/XZ3 member preservation. Do not re-run `prepare-secrets`, delete Durable Object, change Worker name, or remove the existing `MHC_MEMBERS_JSON` secret.

## Upgrade existing LAB Vsmart/XZ3 without a fresh reinstall

Inside the existing Termux:

```sh
curl -fLsS https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/d3b5f696977770cea23333d6286f2f34002e88bc/scripts/update-existing-android-node.sh -o ~/mhc-update.sh && bash ~/mhc-update.sh --apply
```

This checks known MHC LAB source marker and existing JWT signature validator, then downloads the **13** exact immutable source blobs (nine live runtime assets plus four retained managed Panel source files) (Panel server/integration/Monitor JS/CSS, Node collector, authority client, CLI, boot manager, doctor). It backs up everything, leaves Cloudflare Access config, admin data, database, websites and remote Tunnel alone, restarts only `amh-panel`/existing `mhc-authority-agent`, verifies served JS SHA and attempts managed boot repair. Rollback automatically restores files on HTTP/restart failure. On a different/production node the installer refuses.

After update run:

```sh
~/mhc-full node-doctor --check
bash ~/.local/share/mhc-full-installer/bin/node-boot.sh --status
```

If XZ3 rebooted and shows no services, check `boot-last.log` recorded after reboot. If missing, the Android Termux:Boot app was not invoked by the OS; reopen it, enable auto-start and battery unrestricted and disable STAMINA. If present but `RUNSVDIR_MISSING`, relaunch `~/mhc-full node-doctor --repair`, check `$PREFIX/etc/profile.d/start-services.sh` and runit logs. If Agent is running but Panel shows no remote metrics, `node-doctor` differentiates `WORKER_NEEDS_MONITOR_DEPLOY` vs `MONITOR_SCHEMA_V2`, recent heartbeat and telemetry count. A configured Agent that cannot send due to network/Cloudflare remains an issue. Do not treat stale telemetry as current.

## Cloudflare deploy (authorized Windows terminal)

From the same pinned git source checkout (not an outdated ZIP):

```powershell
cd reference\cluster-authority
npx wrangler@4 whoami
npx wrangler@4 deploy --config wrangler.toml
```

Check Worker name `mhc-cluster-authority-lab` before deploying. This upgrades the **existing** Worker/DO; do not create a separate authority or rotate secrets. Existing Worker cannot support newly issued invite or all-node telemetry until upgraded. Remote panel login continues through Cloudflare Access.

## Scope / test evidence

- Source pinned and nine blob IDs reviewed, and an isolated JavaScript Durable Object fixture validated invite→join→dynamic heartbeat, replay denial, wrong-role denial, with `declaredPrimary:null` and `writeLeaseGranted:false`. The original Node test `tests/cluster-pairing.mjs` was committed, but **not executed** in a Node test runner here.
- **NOT RUN on Android**: clean Termux install, API permission prompts, cold boot of XZ3, real SSH after reboot, actual Worker deployment and physical new phone pairing. The Android steps must be verified before claiming 24/7 operation.
- Future Panel-managed provisioning/remote app/site deployment requires authenticated node job execution and approval/rollback. **Not implemented by this milestone**. Pairing+Monitor/Agent are currently usable from the Panel once deployed; arbitrary remote shell commands are intentionally not exposed.
