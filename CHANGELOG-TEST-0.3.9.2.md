# MHC Full Installer — TEST 0.3.9.2

**2026-10-25 · Hotfix panel login + Vsmart LAB upgrade**

Base: complete `MHC-Full-Installer-TEST-0.3.9.1.zip`. This is a **new All-in-One TEST installer**, not a separate required patch. Its `--upgrade` mode is source-only and restricted to already completed disposable TEST 0.3.x nodes; it is **NOT** authorized on production M51/X7b.

## Changes

1. When an unauthenticated browser opens `/`, `/nodes`, `/sites`, or `/cluster`, return HTTP `303` to `/login?next=...` instead of a bare `Request failed — Login required` page. `/login` now has a visible entry in the unauthenticated navigation.
2. On correct admin-token sign-in, navigate back to the requested **allowlisted** page (e.g. `/cluster`). On invalid token, retain the sign-in form and show a non-sensitive error message.
3. Reject unsafe/out-of-site post-login destinations (`https://`, `//`, backslashes, control characters, query injection). Authentication remains required for every protected route; unauthenticated API GET and write POST still return `401`, not data or automatic writes. Token is never placed in a URL.
4. Replace stale `TEST 0.3.8` Panel header with `TEST 0.3.9.2` and adjust local cluster summary's release label. Cluster capabilities/HA guarantees are unchanged.
5. Update completed-install version gates for TEST 0.3.9.2 in node enrollment, clone and readiness; support a guarded TEST 0.3.9.1 → 0.3.9.2 **source-only** upgrade, retaining rollback copy of old scripts.
6. Extend HTTP integration tests with redirect/cookie/login-return/error/open-redirect and unauthenticated POST/API checks. Update Termux marker regression assertions.

## Security / deployment scope

- Panel stays on `127.0.0.1:19090` and must only be accessed via a trusted SSH tunnel. Do **not** publish Panel or port 9090 through Cloudflare.
- `--upgrade` changes MHC-managed source scripts and launcher, **does not** install or start website/DB/Tunnel/HA services, alter `.env` or write production database. It retains `~/websites/demo` and managed site metadata.
- Panel process must be **separately restarted** under runit to load new JS. Existing browser session is invalidated by restart; sign in again with the same stored token. Restart is expected to momentarily interrupt **Panel only**.
- No live replication, automatic failover, WordPress production acceptance or MariaDB GTID replication is claimed. HA remains unarmed.
