# MHC Full Installer TEST 0.3.3 — v0.3B Node Enrollment (stage 1)

24 October 2026. This is a **full ZIP**, not a patch, based on TEST 0.3.2. No production access or data were used.

## Added

- `mhc-full node init [LABEL]`: unique locally generated UUID, stored private (0600) in a NEW TEST identity file; never overwrites legacy `mini-hosting-cluster/node.json`.
- `mhc-full node cluster-init`: create a separate **inventory-only** cluster ID on a freshly installed lab phone; not a Cloudflare witness, quorum or HA authority.
- `mhc-full node invite [1..10 minutes]`: 192-bit random one-use secret, stored as SHA-256 verifier, expires at controller; the cleartext is displayed once in the controller terminal only. Revoke with `node revoke-invite`.
- `mhc-full node join HOST SSH_USER [PORT]`: requires previously pinned SSH host key and authorized SSH public key; one-time invitation read from the local terminal (not command-line arguments), exchanged over SSH stdin; no enrollment HTTP port opened. Rejects unexpected SSH protocol responses.
- `mhc-full node accept`: coordinator records node UUID, label and bounded hardware observations. Invitation consumed **before** membership commit so crashes fail closed rather than admitting extra nodes.
- `mhc-full node heartbeat`: dedicated 256-bit credential issued in the SSH enrollment response, hash held on the controller, secret stored only on the candidate in `node-auth.json` mode 0600; monotonic sequence blocks replay. The controller records last observed heartbeat and current capability.
- Optional `mhc-full node service start|stop|status` with 60-second outbound SSH reporting, **off by default**. An explicit setup and one successful heartbeat are required before enabling.
- Optional `node rpc` forced-command handler supports only the enrollment and heartbeat SSH RPCs, suitable for SSH `authorized_keys` `restrict,command=...` (manual key authorization required).
- `mhc-full node status|list|remove`: local diagnostics, bounded inventory and explicit inventory removal; **removal does not change SSH authorized_keys**.
- Panel `/nodes` authenticated **read-only** inventory, last heartbeat marked as recent/stale (3-minute observation window), node hardware, explicit `Not replica-ready`. Login and HTTPS over SSH forwarding requirements unchanged.
- Integrated new files into the full installer, guarded code-only upgrade (isolated TEST 0.3.x phones only), self-test, doctor/status and runbook.

## Testing in sandboxed Linux environment

- Node enrollment: **43 assertions** (signed-code format, SSH argument safety, token secrecy, one-time invite, expiration, duplicate, membership, auth heartbeats, monotonic replay rejection, node removal, production guard).
- Panel HTTP: **41 assertions** including private inventory, escaping untrusted labels and no display of verifier hashes.
- Existing WordPress/static/backup/peer/restore tests pass. Sources from HA Controller/Safe Control/staged v1.0 remain uninstalled and unchanged.

## Safety boundaries and not completed

- **No actual Android Termux device acceptance** of this build. No real SSH two-phone enrollment or runit heartbeat acceptance performed.
- Does not download/restore/replicate databases or files, change WordPress/TPP/Cloudflare routes, turn on HA, set MariaDB read-only, grant write authority, select Primary or guarantee online status.
- Hardware probe does not measure real battery/thermal/network health (reported unavailable/unmeasured where unsupported); inventory observation is not service health.
- SSH host public keys and user permissions need independent validation. An unrestricted SSH account grants much broader rights than pairing; prefer manually restricted `authorized_keys` with dedicated enrollment key.
- No automatic peer SSH key installation, key rotation, cross-cluster reparenting, encrypted offsite backup, per-node RBAC, online status consensus, replication, or robust clone/rejoin protocol.
- Enrollment invitation and membership registry file operations are not a distributed transaction. Interrupted RPC can leave a node recorded on only one side: inspect, remove from inventory, revoke keys if needed and create a fresh invite.
- No auto-ARM or failover. M51/X7b are production-adjacent and must not be upgraded with this test installer.
