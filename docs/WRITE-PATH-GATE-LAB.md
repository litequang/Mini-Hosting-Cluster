# MHC TEST 0.5.0B3 — Write-path coverage & isolated witness-gated canary

**Mode: ISOLATED LAB ONLY. Not HA. Not a production write fence.**

## Scope

The `mhc-full write-gate plan` command reports the entire write-path coverage inventory. Precisely ONE isolated file-canary path has an enforced witness check. The following nine production write-path groups remain **NOT ENFORCED**:

1. HTTP ingress (Nginx)
2. PHP/WordPress application writes
3. MariaDB SQL sessions and administrative accounts
4. Sheet/Sheet+ and uploaded file writes
5. Hosting Panel 9090 write APIs
6. Background jobs and cron
7. SSH and direct local shell writers
8. Backup, restore and replication apply
9. Cloudflare routing

`read_only` for MariaDB is not hard fencing. Administrator privileges may bypass it; HA must independently stop every old writer. No shell/PHP/database/Cloudflare write is intercepted by B3.

## Separate LAB phone and Cloudflare LAB witness required

Do not run mutations on Vsmart if any website (such as `demo`) is registered, nor on M51/X7b production. The CLI rejects MHC registered website directories, known HA/TPP footprints, symlink directories, public permissions and unsafe witness credentials. It never alters the existing hosting configuration.

1. Read-only inventory, safe on installed Vsmart:

   ```sh
   ~/mhc-full write-gate plan
   ~/mhc-full write-gate status
   ```

2. On an **empty, dedicated LAB Termux** which already has a separately configured witness client under `~/.config/mhc-witness-lab` (per B2), initialize isolated canary storage:

   ```sh
   ~/mhc-full write-gate init --confirm=ISOLATED_CANARY_WRITE_ONLY
   ```

3. ONLY after witness status/lease verification is manually established on that LAB, write a trivial test canary:

   ```sh
   printf 'MHC isolated LAB canary\n' | ~/mhc-full write-gate canary-write --confirm=ISOLATED_CANARY_WRITE_ONLY
   ```

Each canary is at most 64 KiB, allocated under `~/mhc-writegate-lab/canaries/`, with a fresh unpredictable filename, 0600 file permissions and no overwrite. Each command authenticates to the witness using the existing B2 node token twice: immediately before staging a file and again before publishing it. Epoch must be unchanged. When a check fails, the provisional file is removed and **no new canary is published**. The client does not silently retry failed writes.

The local `audit.jsonl` contains canary hashes/IDs/epochs (no tokens); it is a diagnostic journal, *not* authoritative consensus or audit notarization. The witness is **not** installed or deployed automatically, and the Panel never contacts it or reads token files.

## Faults tested in CI (mock witness)

- Witness unavailable / returns denial / lease expired
- Wrong reply nonce, incompatible protocol
- Epoch changes between the two checks
- Unsafe permissions on private credentials or canary directory
- Symlinks to external paths, missing folder
- Existing hosting-site registration or production `.env`
- Empty and >64 KiB inputs
- Unknown database-writing commands blocked
- No alteration of any hosting/SQL/Cloudflare path

## Why not authorize real switchover

Verification of an HTTPS lease immediately before a canary write has a time-of-check/time-of-use window and no secure enforceable connection to every application writer. The witness is not a second physical fence, and a partitioned old node might continue to accept direct SQL or other writes. B3 never sets `canPromote`, `haEligible`, or `productionProtected` to true.

**Next gates before v0.5C:** isolate two real Android LAB nodes; successfully run v0.4D GTID + Sheet/file E2E acceptance; prevent all ingress and direct SQL writes on fenced old primary; secure per-request fencing terms on all application writers; test forced network partitions and watchdog stop; prove Cloudflare routing handoff and rollback; obtain signed/independent fencing acknowledgment. A single failed gate blocks promotion.
