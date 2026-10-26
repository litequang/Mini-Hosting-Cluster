# MHC LAB: Cluster UI heartbeat and public Panel Access troubleshooting (26 Oct 2026)

## Verified source checkpoint

- Branch: `codex/m1-m2-foundation`.
- UI code: `bin/legacy-panel-src/public/app.js`, commit `f0c94a4`.
- The old Cluster > Node Inventory showed empty heartbeat cells because `mhcClusterPage()` rendered `node.state` and `node.lastSeen`, but M2 Shared Authority responses contain `heartbeatRecent` and `lastSeenAt`.
- The new default Cluster view is a compact overview: registered node count, recent heartbeat count, individual node freshness/last-seen, unverified Primary, auto-failover unavailable, Shared Authority status. Refreshes every 20s while authenticated, tab visible. **Kỹ thuật LAB** exposes the unchanged detailed test panels and the PREPARE_ONLY controls. No worker/API/write path/security semantics changed.
- JavaScript parse verification passed and the changed file was re-fetched from GitHub. No Android-browser E2E UI verification has been performed on this commit.

## User-observed LAB state (not directly inspected by Codex)

- Vsmart-LAB nodeId `4ed4c025-62ae-4c2a-8d68-65dd76ecf550`.
- Sony-XZ3 nodeId `4a9672d1-bb62-4286-946a-a78b73e57b24`.
- Shared cluster UUID `2c1ea7c0-1d1f-4802-8336-0925a529c431`.
- On 2026-10-26 at roughly 17:19 ICT, the user's `~/mhc-full cluster-authority status` showed `mode: SHARED_AUTHORITY_PREPARE_ONLY`, `nodeCount: 2`, `heartbeatRecent: true` for both nodes; `revision:0`, `declaredPrimary:null`, `writeLeaseGranted:false`, `automaticFailover:false`. This demonstrates the two-node authority/membership/heartbeat data path at that observation, **not** safe Primary election or data replication.
- Existing Tunnel for `panel.giaouoc.com` was previously hosted via the Vsmart connector `mhc-panel-tunnel`. Route ownership/current online state must be confirmed in Cloudflare before changing either node.
- User reported public `panel.giaouoc.com` first returned Cloudflare 1033 while BOTH phones were offline (expected, not evidence of code bug); after reconnect reported JSON `{"error":"Remote Access verification required"}`. The latter is an origin Panel authorization 403, distinct from 1033. **Root cause remains unverified.**

## Safe diagnosis for public Panel 403

`bin/legacy-panel-src/src/mhc-remote-access.mjs` has `authorizeRequest(req,9090)`:
- Only local Host `127.0.0.1:9090` or `localhost:9090` is allowed as SSH-only access.
- Remote Host must match the private origin configuration `hostname` (expected `panel.giaouoc.com`).
- Origin requires `cf-access-jwt-assertion`, RS256/JWKS signature, issuer matching configured Team Domain, correct application AUD, valid `exp`/`iat`/`nbf`, and a suitable clock.
- This same JSON error is emitted for all remote authorization failures; it **does not identify which check failed**.
- Do not remove the JWT check, lower signature verification, set an unauthenticated bypass or publish 9090 directly.

On Vsmart (or the confirmed actual origin), read-only commands:

```sh
~/mhc-full remote-panel status
sv status "$PREFIX/var/service/amh-panel" "$PREFIX/var/service/mhc-panel-tunnel"
curl -sS -o /dev/null -w 'LOCAL_PANEL_HTTP=%{http_code}\n' http://127.0.0.1:9090/
date -u
```

On XZ3 check `~/mhc-full remote-panel status` separately: it may correctly report `configured:false` for a node not yet assigned a public hostname. If the actual Tunnel routes to that node, the public Host will be rejected.

In Cloudflare, check (1) self-hosted Access application for the exact hostname `panel.giaouoc.com` and a narrowly scoped Allow policy, (2) its Team Domain and AUD match the origin's private config, and (3) Tunnel > Routes > published application points to the intended active node's `http://127.0.0.1:9090` and enables **Protect with Access** where appropriate. Cloudflare documents origin JWT delivery in `Cf-Access-Jwt-Assertion`; do not share/copy the JWT, cookie, passwords, token files or Tunnel credentials into chat or Git.

If Access login succeeds but the Panel still gives 403, capture sanitized information only: route target, `remote-panel status`, runit status and HTTP codes. Investigate whether JWT reaches origin and claims validate before modifying origin auth logic. No security bypass.

## Deployment of UI code to existing TEST Android nodes

The GitHub commit alone does not change live node files. Each LAB node uses an independent local `~/android-hosting-panel` checkout and needs controlled deployment:

1. Confirm source revision / backup location / no production footprint; never re-run `--install`.
2. Update `~/MHC-Installer` with `git pull --ff-only` on branch `codex/m1-m2-foundation`.
3. Run `bash install.sh --upgrade`, confirm `TEST_SOURCE_ONLY_UPGRADE` only after preflight; this runs source tests and updates staged source, not the running Panel.
4. Run `~/mhc-full hosting-panel plan`, then if it passes `~/mhc-full hosting-panel apply` (confirmation `UPGRADE_ORIGINAL_PANEL_LAB`); this captures a rollback ID and preserves `admin.json`.
5. `sv restart "$PREFIX/var/service/amh-panel"`; wait for `curl http://127.0.0.1:9090/` HTTP 200, then hard-refresh browser.
6. Preserve authority enrollments, cluster UUID and node identities; do not rerun node/cluster init, regenerate member keys, or enable M3/M4 on these steps.

## Remote Access 403 — private, bounded diagnostic source patch

User-provided evidence 26 Oct 2026: Vsmart origin localhost HTTP 200, Access redirect 302, Cloudflare route configured to the correct Vsmart 9090, private hostname/team/AUD all match Cloudflare screenshot. Vsmart HTTPS JWKS returned HTTP 200 with 2 RSA/RS256 public keys. These checks do **not** prove that real JWT header reaches origin or passes verification; do not claim root cause fixed.

Source updated in `bin/legacy-panel-src/src/mhc-remote-access.mjs` to emit **server-side only** reason codes (rate-limited once/30 sec per code): `REMOTE_CONFIG_INVALID`, `HOST_MISMATCH`, `JWT_MISSING`, `JWT_FORMAT`, `JWT_HEADER_INVALID`, `JWT_ISSUER_MISMATCH`, `JWT_AUDIENCE_MISMATCH`, `JWT_EXPIRED_OR_INVALID`, `JWT_EXPIRY_OVER_POLICY`, `JWT_NOT_YET_VALID`, `JWT_IAT_IN_FUTURE`, `JWKS_FETCH_FAILED`, `JWKS_KID_UNKNOWN`, `JWT_SIGNATURE_INVALID`, `JWT_PARSE_OR_CRYPTO_ERROR`. Never log JWT/cookie, claim values, raw hostname, private config contents or upstream response. Public 403 remains unchanged. Bound port 443 accepted for matching public Host but unknown host/ports still rejected. JWT RS256, JWKS, AUD, issuer, time, origin password, CSRF retained. Tests extended in `tests/remote-panel.mjs`, not yet run on Android.

`scripts/apply-remote-access-diagnostics.sh --apply` downloads fixed source pinned to commit `8a0ca26111b4f097b0859506359bbffb8c3aeb3d` on Vsmart LAB; checks Node syntax, backs up only origin module, restarts only `amh-panel`, checks localhost HTTP 200, auto-rolls back on HTTP failure. Does not change Cloudflare dashboard, DNS, Panel credentials or cluster authority. After deployment, Access sign-in user attempts browser; only filtered log markers shared. Fix the concrete rejection cause based on new log evidence. This is not a confirmed end-to-end fix for 403 or proof of node cutover.

## 26 Oct 2026 — JWT JOSE header fix after actual runtime log

User's real Vsmart private log: `MHC_REMOTE_ACCESS_DENIED JWT_HEADER_INVALID` at 12:17:36 and 12:18:08 UTC. Thus remote JWT header has arrived, but one of prior combined `alg/typ/kid` predicates rejected it. No raw token/header was logged, so the exact sub-condition is **not proved**. RFC 7519 §5.1 defines `typ` as OPTIONAL. Source now accepts absent `typ` and case-insensitive `JWT`, retains mandatory `alg=RS256` and nonempty bounded `kid`, plus issuer/AUD/time/JWKS RSA signature verification. A supplied unrelated typ still rejects. Separate local-only diagnostic codes clarify a persistent 403. Added regression coverage in `tests/remote-panel.mjs`; tests and Android deployment **NOT RUN** in this coding session. Updated `scripts/apply-remote-access-diagnostics.sh` uses pinned commit and backs up/rolls back only origin module if restart/HTTP health fails. Public errors intentionally remain generic.
