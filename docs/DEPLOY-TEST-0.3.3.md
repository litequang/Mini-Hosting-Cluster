# MHC Full Installer TEST 0.3.3 — clean lab installation and SSH node pairing

**Scope: only isolated, disposable Android/Termux aarch64 phones with NO production data.** This is a complete source ZIP based on 0.3.2. M51 and X7b must not receive `--install`, `--upgrade`, clone, restore, HA arm or route changes from this build. Web management panel stays on `127.0.0.1:19090`; no public Admin Panel, DNS or Cloudflare configuration changes.

## 1. On a brand-new Termux lab phone

Place `MHC-Full-Installer-TEST-0.3.3.zip` in `$HOME` and run:

```bash
pkg update -y && pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.3.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
~/mhc-full doctor
```

The installer requires at least 3 GiB free, normal Termux aarch64, and literal confirmation `TEST_NEW_DEVICE_INSTALL`. It installs the baseline Termux services and MHC source, but **does not initialize a controller, issue pairing tokens or start a heartbeat service automatically**. The upstream baseline may install local dashboard services: run `~/mhc-full system status` and verify the local runit services before starting tests.

### TEST-only upgrade from a successfully installed Full Installer 0.3 / 0.3.1 / 0.3.2

Make a verified backup first. After extracting the **full new ZIP**, run `bash install.sh --plan`, `bash bin/self-test.sh` and `bash install.sh --upgrade` and confirm `TEST_SOURCE_ONLY_UPGRADE`. The script backs up managed code to `~/.local/share/mhc-full-installer/rollback/` and replaces MHC scripts only. It does NOT migrate DB, website configs, Cloudflare or production HA policy. Stop/restart the optional Panel yourself to display the new `/nodes` UI. This upgrade path is **untested on real Android** and refuses evidence of live production/HA configuration.

## 2. Create the controller (one NEW TEST phone only)

```bash
~/mhc-full node init 'Lab Controller'
~/mhc-full node cluster-init
~/mhc-full node status
~/mhc-full node list
~/mhc-full node invite 10
```

The final command prints a **private one-time pairing code**, valid for 10 minutes, which is NEVER stored in cleartext on the controller. Keep this code out of chat, screenshots and version control; use it locally on the other phone. Only one active invite is allowed; `~/mhc-full node revoke-invite` invalidates it. Controller here means **node inventory coordinator only**, NOT production Primary and NOT Cloudflare HA witness.

## 3. Prepare SSH manually, then enroll another NEW TEST phone

First set up **SSH public-key access** from candidate to controller and verify the controller's SSH host key fingerprint out of band. The connection must already succeed with strict host key verification (no `StrictHostKeyChecking=no`); never weaken these settings to make pairing pass. A **restricted SSH key** is strongly preferred over a key granting full Termux shell access.

Optional, for an enrollment-specific SSH public key that you have already independently verified, you may manually add a forced-command entry to the controller's `~/.ssh/authorized_keys` using the actual Termux home, for example:

```
restrict,command="/data/data/com.termux/files/usr/bin/node /data/data/com.termux/files/home/.local/share/mhc-full-installer/bin/node-enroll.mjs rpc" ssh-ed25519 VERIFIED_CANDIDATE_ENROLLMENT_PUBLIC_KEY
```

The public key text is a PLACEHOLDER: never paste a private key. With a restricted key the SSH forced command dispatches only `accept` or `heartbeat-accept`; no shell access is granted through that key. Apply `chmod 700 ~/.ssh` and `chmod 600 ~/.ssh/authorized_keys`. Actual device host paths may vary by Termux user context. Ensure the remote `~/mhc-full` is installed and verify fingerprint first.

On the **candidate TEST phone**:

```bash
~/mhc-full node init 'Lab Candidate'
~/mhc-full node join CONTROLLER_LAN_IP CONTROLLER_TERMUX_USER 8022
```

The CLI asks for the code without echoing it. The command uses SSH `BatchMode=yes`, `StrictHostKeyChecking=yes` and sends the code through stdin, not argv or shell history. No public pairing endpoint is created.

Verify both ends:

```bash
# On the controller:
~/mhc-full node list
# On the candidate:
~/mhc-full node status
~/mhc-full node heartbeat
```

An enrollment displays `enrolled-unverified`; it does **not** clone sites or database, validate replication/GTID or grant a live writer lease. For multiple additional test phones, issue a fresh one-time invite for each candidate. Removing a node from inventory requires `node remove NODE_UUID --confirm=REMOVE_FROM_INVENTORY`; independently revoke the corresponding SSH key if removing trust.

## 4. Optional heartbeat every 60 seconds (candidate only)

After `~/mhc-full node heartbeat` succeeds, on that **candidate lab phone**:

```bash
~/mhc-full node service start
# Type ENABLE_TEST_HEARTBEAT when prompted
~/mhc-full node service status
~/mhc-full node service stop    # when done
```

This creates and enables a dedicated `mhc-full-heartbeat` runit service ONLY after explicit permission. It contacts the controller over SSH every 60 seconds using a per-node token, sends hardware observations and persists a monotonically increasing sequence number. The controller shows *recent authenticated heartbeat* for observations within 3 minutes, otherwise *not recently observed*. Neither is proof of website health or HA eligibility. If Android suspends Termux, status becomes stale. The code is **not** auto-enabled by the installer, and real background-service reliability remains unverified.

## 5. View nodes in the existing local Panel

```bash
~/mhc-full panel start
~/mhc-full panel token  # PRIVATE token
```

Use SSH port forwarding from your own PC to the new lab phone:

```powershell
ssh -p 8022 -N -L 19090:127.0.0.1:19090 TERMUX_USER@LAB_PHONE_IP
```

Open `http://127.0.0.1:19090/nodes` on the PC after Panel login. Inventory shows stored information only, not proof that Cloudflare traffic, MariaDB writes or app data are served by any node. No invite code or heartbeat verifier is displayed.

## 6. Prior hosting features (unchanged)

```bash
~/mhc-full sites create-static demo
~/mhc-full serve configure-static demo demo.test
~/mhc-full serve check
~/mhc-full serve start
~/mhc-full backup run
~/mhc-full backup verify
```

For WordPress, use the verified WP-CLI path in `docs/DEPLOY-TEST-0.3.2.md`. Local WordPress still requires PHP-FPM/Nginx/DB real-device acceptance. Do not advertise WordPress as production-ready, expose the test Panel to WAN, or presume backup restore succeeds merely because checksums pass.

## 7. Acceptance checklist (NOT yet executed on real phones)

1. Two clean test devices: preflight and installer succeeds, records separate immutable node identities; no inherited production `.env`, cloud secrets, or old cluster ID.
2. SSH public key trust/fingerprint independently verified, no unrestricted key if using restricted enrollment approach.
3. One-time invitation succeeds once; wrong/expired/replayed code fails; multiple candidates with independent tokens are admitted; manual removal revokes local inventory (SSH authorization checked separately).
4. Runtime hardware readings match actual phone capacity or are marked unmeasured; heartbeat records stale after suspension, no incorrect claim of continuous online.
5. `http://127.0.0.1:19090/nodes` works over SSH tunnel after authentication; refuses unauthenticated requests and leaks no invite/auth secrets.
6. Termux Doze/reboot/power loss, SSH unavailable, controller restart and clock skew exercises; no auto-failover, no DB writes, no cloud route changes.
7. Test WordPress, backup/verify and **restore on a separate lab node** before considering production.

**Next v0.3C:** authenticated snapshot selection and full node clone to an EMPTY lab member only, signed/checksummed transfer, isolated MariaDB restore, cutover/catch-up verification, followed by GTID and file delta syncing in v0.4. Not yet implemented.
