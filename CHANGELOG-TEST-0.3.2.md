# MHC Full Installer TEST 0.3.2 — Local Management Panel

**Roadmap:** v0.3A Unified Installer Foundation, **not** completion of v0.3 Multi-Node Management. Full ZIP based on TEST 0.3.1, **no separate patches**.

## Delivered source

1. `bin/local-panel.mjs` — Node.js HTTP Panel bound **only to 127.0.0.1:19090** with SSH-forward access. No Cloudflare/DNS/tunnel modifications. Does not read/accept MariaDB, WordPress .env, HA tokens, or site root secrets through file browsing.
2. `bin/panel.sh` — `mhc-full panel start|stop|status|token`. Termux runit service `mhc-full-panel`, installed/started **on explicit user action only**, not by installer. Existing unknown service scripts are not overwritten or enabled.
3. Panel read-only server inventory: registered WordPress sites (names only), static sites, selected managed runit states, latest snapshot marker presence. No service stop/start buttons.
4. Static-site File Manager for MHC-registered static sites: directory navigation, binary download (max 8 MiB), create/edit text file (max 256 KiB), binary upload (max 8 MiB), entire ZIP deploy (max 20 MiB upload with existing safe ZIP extractor), rollback to previous static release. Editing or uploading preserves the previous file in a private history directory outside the website; no automatic history cleanup yet.
5. Safety: 256-bit random admin token in `~/.config/mhc-full-installer/panel-admin-token` (0600), in-memory session (30min sliding expiry), HttpOnly/SameSite=Strict cookie, CSRF token and Origin checks, Host-header allowlist, login rate limit, strict input/file extension allowlists, root/path traversal and symlink rejection, atomic file replacement, exclusive operations locked against backup, request size limits, no CORS allowance, no external listening interface.
6. Code-only `install.sh --upgrade` from TEST 0.3, 0.3.1 or 0.3.2 lab installations copies `.mjs` runtime and preserves old scripts under rollback path. **Not an in-place production updater**, does not rewrite DB, runtime, websites, SSH, Cloudflare or HA.
7. Updates installer, CLI dispatcher, self-test, system doctor/status, and documentation.

## Not delivered / constraints

- **No real Android test performed**. PHP-FPM, MariaDB, WP-CLI, Nginx and runit on Termux need on-device acceptance.
- **No WordPress file write / WP-CLI management from Panel**. WP metadata only; WordPress file upload/admin stays in WP UI and trusted CLI.
- No deleting files/folders, creating nested directories through Panel, authenticated multi-user RBAC, externally reachable Panel, HTTPS, WAF, public exposure, or production remote admin.
- Panel ZIP/static changes are immediate local filesystem changes. They are not cluster-wide replicated; full WordPress+SQL restores and consistent whole-cluster snapshots still require future phases.
- File-history retains older copies without automatic quota/rotation. ZIP extractor and file manager protect against known path traversal/symlink/extension risks, not malicious client-side JavaScript and **not a security audit**.
- No M51/X7b changes, no lease/HA activation, no assumption X7b is live Primary.
