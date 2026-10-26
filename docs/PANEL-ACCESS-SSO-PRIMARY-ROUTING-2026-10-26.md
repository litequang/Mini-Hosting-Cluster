# MHC M2: Cloudflare Access-only Panel login + Primary-following control URL

**Date:** 2026-10-26. **Status:** Access SSO source prepared and deployment script pushed; browser/device E2E NOT RUN after SSO update. M3/M4 actual cutover NOT IMPLEMENTED. LAB only.

## Approved topology

- Every node (Vsmart, XZ3, and future N) runs the original Panel :9090 and heartbeat agent.
- **One public URL** `panel.giaouoc.com` normally routes to the **current verified Primary** (same phone hosts both user-facing site and Panel).
- Shared Cloudflare authority (Durable Object) holds cluster revision/epoch/Primary intent independent of any phone; it cannot depend on the active Primary being online.
- If the active Primary is offline, a standby Panel must remain accessible in **recovery/control-only mode** while replacement eligibility, fencing, and route transitions are resolved. The administrative URL must not disappear merely because the former Primary is offline.
- A node returning after outage is Standby/quarantined, never auto-failback. If old writer cannot be fenced, **do not claim failover safe**.
- A naive shared Cloudflare Tunnel with two connectors and random ingress is not sufficient to ensure `panel.giaouoc.com` follows the Primary. Require explicit verified route selection/fallback to an eligible node; no DNS race assumptions.
- **Current real state** remains `SHARED_AUTHORITY_PREPARE_ONLY`, `declaredPrimary:null`, `writeLeaseGranted:false`. Neither Vsmart nor XZ3 is a true Primary today. The present public route is physically Vsmart because its Tunnel is attached to the hostname.

## Auth model (implemented source, not yet deployed)

- **Remote:** Cloudflare Access Allow policy for explicitly authorized admin emails; Tunnel's Protect with Access; origin validates every `Cf-Access-Jwt-Assertion` RS256 signature via JWKS plus issuer, AUD and time. On `GET /api/session`, a valid Access JWT starts a normal Panel admin session automatically. No username/Panel password prompt. `POST /api/login` from remote is rejected.
- **Local recovery:** `http://127.0.0.1:9090` reached by trusted SSH forwarding keeps existing Panel admin password. Local password session cannot be reused remotely and Access session cannot be reused on localhost.
- Each remote Panel session is bound to the **exact signed JWT** digest, expires after ≤6 hours of inactivity; every HTTP request must pass JWT verification before the session guard; session uses Secure/HttpOnly/SameSite=Strict cookie. CSRF mandatory on mutations, including Primary selection; Origin checked on mutations. When token rotates, browser may need refresh to establish a new Panel session.
- Remote 'Đăng xuất' clears Panel cookie and redirects to `/cdn-cgi/access/logout` on public application hostname to terminate Cloudflare Access cookie. Cloudflare logout propagates over a short period.
- Cloudflare Access application policy **must be tightly scoped to the approved administrator emails**. Do not set an unrestricted 'Allow Everyone' policy or general-purpose Bypass for this hostname. Do not log/export JWT, cookies or identity claims.
- The old Panel password remains available locally as emergency recovery; it is not used remotely once Access SSO source deployed.
- Endpoints: `GET /api/session` => `loggedIn,user,csrf,authMode`; `POST /api/login` local-only; `POST /api/logout` => `ok,accessLogout`.
- No new secret files or Cloudflare token on phones.

## Safe rollout on Vsmart LAB first

From Termux on Vsmart (known current public origin):

```sh
curl -fLsS \
  https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/e67cf881aa5378bd6520db257d792009766815aa/scripts/apply-panel-access-sso.sh \
  -o ~/apply-panel-access-sso.sh
bash ~/apply-panel-access-sso.sh --apply
```

Script downloads a pinned snapshot of 3 Panel source files, checks syntax and required signed JWT verification, backs up old modules under `~/.local/state/mhc-panel-sso-backups/`, restarts only `amh-panel`, validates localhost HTTP 200, and rolls back files on local service-health failure. Does **not** touch website, DB, node identity, authority secrets, Nginx, Tunnel, or Access policy. It cannot prove remote login; operator must test `https://panel.giaouoc.com` in private browser after deployment. Before opening public login, make Cloudflare policy allow **only the intended administrator email(s)**. Retain an SSH session for rollback.

Only after Vsmart passes remote browser SSO and local password recovery, apply equivalent code to XZ3; it currently reports remote-panel configured:false, so an independent XZ3 public route or matching Access configuration is still needed before routing the shared hostname to XZ3.

## End-to-end test criteria (do not claim PASS from source alone)

1. Remote Access email login => direct Panel overview, no Hosting password; Cloudflare logout returns to protected login.
2. Wrong/missing JWT, wrong audience, wrong public hostname => 403; local password and SSH forwarding unaffected.
3. Two browser sessions and JWT rotation: CSRF and same-JWT cookie binding enforced.
4. Access policy with unapproved email cannot reach origin, even if someone knows old Hosting password.
5. Disable Vsmart Tunnel: public Panel must become reachable on verified XZ3 standby without changing DNS manually, and must **not** promote writer just because standby Panel is reachable.
6. Manual Primary switch (M3): preflight candidate data/health, durable intent, old-writer fencing, start target workloads, verify website+Panel identity externally, atomically commit Primary and route. If any stage fails, enter safe recovery/rollback.
7. Auto Primary (M4) reuses the **same** safe transition pipeline with outage thresholds and no auto failback.

## M3/M4 missing work

- A per-node ingress or Worker-router binding to route the single admin hostname to the node chosen by the independent authority.
- Proven write fencing, target startup/HTTP identity checks, durable cutover, verified rollback, and replay-safe idempotency.
- A recovery-panel mode on standby when no writer has been safely promoted.
- Real two-Android outage/return tests, no production deployment before observed results.

**Never** represent an M2 `begin` / `PREPARED_NO_WRITER_GRANT` as a successful Primary cutover. `Panel selected a node` is not evidence of `website served by node`.

## M3 UI milestone (26 Oct 2026)

The main Cluster page now allows selecting a **candidate** node and making a durable, revision-checked `begin` request against the existing Worker. It displays the pending target on all Panels and supports `abort`. Only heartbeat-recent registered nodes are offered; the authority independently enforces recent heartbeat and single pending transition. This is not a live primary, does not change routing, does not fence old writers or start the target.

Source: `bin/legacy-panel-src/public/app.js`, commit `bd9b02c95aede607a353e3471d9c43f832418ac8`. Installer for both LAB devices: `scripts/apply-primary-candidate-ui.sh`, pinned Git blob `1a73c25997270925214c6fc67a935966b8507a65`. An Android/browser/Cloudflare runtime test has NOT been performed.
