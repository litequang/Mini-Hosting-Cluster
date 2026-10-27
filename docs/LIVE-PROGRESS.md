# MHC — trạng thái thực thi duy nhất

## 27/10/2026 08:40–08:49 VN — hoàn tất tiếp nhận hai LAB (source `da7d67a`)

- **P0 DONE trong phạm vi kiểm kê:** fetch branch sạch, local/upstream cùng `da7d67a`; so 245 file code ở workspace cha, giữ bốn phần clock-health chưa nhập Git. Báo cáo hợp nhất: [CODEX-RESUME-AUDIT-2026-10-27.md](CODEX-RESUME-AUDIT-2026-10-27.md), có kế hoạch source-only trước P3. Checkpoint docs trước `a6bfa55`, `da7d67a`; SHA chứa kết quả mới xem commit của mục này.
- **P1 IN PROGRESS:** Vsmart SSH/Panel/Agent/Tunnel/WordPress services khỏe, 9090/18080/wp-login HTTP 200, MariaDB SELECT 1 PASS. Snapshot metadata có, collector verified:false; restore/upload PASS lịch sử `889786e` ngày 26/10 giữ nguyên bằng chứng. Reboot/Doze/restore mới NOT RUN. Tiếp theo cho P1: hậu kiểm lifecycle trong cửa sổ LAB sau đồng bộ source.
- **P2 IN PROGRESS:** cả hai Android thật SSH key/strict host key PASS, Panel 9090 HTTP 200, MariaDB SELECT 1 PASS, Agent/telemetry mới cùng authority revision 3/epoch 0. Source runtime gần nhất `f73df61`, updater `764ba51`. Hash manifest Vsmart 9/13 khớp, XZ3 10/13; full managed bin Vsmart 57 khớp/8 khác/2 thiếu, XZ3 62 khớp/5 khác. XZ3 thiếu Tunnel/Access/site/snapshot, sshd runit lỗi bind nhưng daemon ngoài runit phục vụ SSH. Live JWT XZ3 và managed JWT cả hai còn cũ; updater 13 file không sửa JWT. Việc tiếp theo cụ thể: chuẩn bị một package source-only đầy đủ có rollback Agent/Panel/boot, test trên XZ3 canary, rồi mới Vsmart; chưa triển khai trong nhiệm vụ này.
- **P3 IN PROGRESS source, live NOT RUN/BLOCKED:** DNS/journal/recovery code và fixture có; candidate activation, fencing mọi writer, HTTP identity/conditional rollback và site restore XZ3 còn thiếu. Cloudflare Worker version/Cron/DNS/Access account CHƯA XÁC MINH; public HTTPS từ hai Android HTTP 302 chỉ chứng minh tới cổng Access. **P2.5/P4/P5 NOT STARTED runtime**; Panel-only recovery không phải auto Primary.
- **PASS Windows:** 16 JS syntax, 32 shell syntax bằng Git Bash, 13 manifest SHA. **PASS fixture trên MỖI Android:** p3-route, p3-panel-recovery, cluster-pairing, monitor-all-nodes, remote-panel (45 assertions), authority-panel, cluster-authority, authority-http-panels, access-sso-panel. Hai Panel HTTP trong fixture vẫn là hai process trên một máy, không phải installed two-node cutover.
- **FAIL/giới hạn:** manual-candidate-ui literal `declaredPrimary:null` cũ FAIL trên cả hai; SSO Windows fixture FAIL do `--import` path C: thiếu file URL (Android PASS). Authority HTTP lúc đầu bị guard TMPDIR trong source; chạy lại TMPDIR ngoài source PASS. Full self-test/updater fault injection/live browser/reboot/two-Android CAS/cutover NOT RUN. Test source cách ly đã dọn, PID Panel/Agent thật giữ nguyên.
- **Blocker cần người dùng/môi trường:** phiên quản trị Cloudflare hợp lệ để xác minh sau; F3216 là LAB ở nhà chỉ quan sát heartbeat, không có SSH từ công ty. Các sửa packaging/tests/SSH supervision tự làm được trong nhiệm vụ triển khai tiếp theo; không cần user chạy hộ test đã làm được.
- **Nhiệm vụ tiếp theo duy nhất:** sửa và diễn tập package đồng bộ toàn bộ managed/live source + JWT, rollback đúng cả process; trình kết quả canary/plan rollout trước khi làm P3. Không đổi Cloudflare, cài/nâng cấp node hoặc chạm M51/X7b trong checkpoint kiểm kê này.

Các mục dưới là lịch sử theo ngày/checkpoint; NOT RUN/PASS cũ không tự chuyển thành kết quả hiện tại.

## 27/10/2026 — P3 independent Panel recovery, source checkpoint (LAB only)

- **Implemented/pushed** `reference/cluster-authority/p3-recovery.mjs` deterministic eligibility: incumbent heartbeat absent >=5m (previously observed), standby heartbeat & telemetry <=90s, `amh-panel` and `mhc-panel-tunnel` running, sticky failback-disabled selection, blocks concurrent Primary transition.
- **Cloudflare Worker** Cron every minute via `wrangler.toml`. Opt-in secret `MHC_P3_PANEL_RECOVERY_ENABLED=LAB_PANEL_ONLY`; DOES NOT change DNS until opted in. DO commits `DNS_REQUESTED` before panel DNS API PATCH, idempotent GET verify, cooldown retry after 90s, `DNS_SWITCHED_RECOVERY` journal and audit after DNS verification.
- **Panel-only** DNS recovery leaves all site hostnames, Primary identity, DB and writer lease unchanged. Operator P3 site+Panel cutover now recognizes when Panel CNAME was previously recovered to a Standby.
- **UI original Panel 9090** shows recovery DNS route separately from website Primary without falsely claiming HTTP availability. Code snapshot `f73df611aa600e6f74a13690171fe8fe0a1f0c65`; LAB updater `764ba5189d0ed89b6b83099a4eaf246ff4c4e32a`, manifest 13 source blob SHA verified.
- **Simulated tests:** source Worker syntax PASS, Panel JS syntax PASS, p3 recovery/DNS scenarios PASS in isolated V8 fixture, DO recovery simulated: first switch recorded + one DNS call, subsequent cron no additional DNS switch, website/Primary untouched. New `tests/p3-panel-recovery.mjs` includes Node runtime suite but **Node runner in repo NOT RUN in this session**. See `docs/P3-PANEL-RECOVERY-2026-10-27.md`.
- **NOT COMPLETE END-TO-END:** no actual Cloudflare deployment, Worker secrets, two Android Tunnel/Access verification, device-side agent updated status, public HTTP check or independent data-path fencing. P3 manual Primary still operator-attested LAB DNS only, **not safe production writer failover**. M51/X7b production untouched.

## 26/10/2026 — P3 manual Primary LAB route source (NOT production-ready)
- Implemented opt-in exact-allowlist Cloudflare DNS adapter with pre-verified CNAME targets, crash-retry-safe DO `ROUTING_REQUESTED` and `DNS_SWITCHED_AWAITING_HTTP_CONFIRM` phases, 30s resume guard, operator attestations in original Panel, and metadata `declaredPrimary` only after public HTTP/Panel operator confirmation.
- No default DNS mutation: Worker requires explicitly enabled `MHC_P3_LAB_ENABLED`, privately configured `MHC_P3_CF_TOKEN`, `MHC_P3_ROUTES_JSON`, and initial incumbent UUID. Existing M2 monitoring/join not promoted or re-routed by source commit.
- Mocked DNS adapter isolated evaluation **PASS**: site then panel DNS checks/patches, no duplicate PATCH on repeat, unexpected DNS content refused, feature disabled by default. JS syntax check of Worker, UI, route adapter PASS; Node test runner, device/Worker/Access real tests NOT RUN.
- **P3 remains INCOMPLETE end to end:** cannot independently fence old DB/site writers, start target services or verify actual target application/Panel; no independent recovery-panel route if incumbent phone is dead. Do not declare live true Primary or safe automatic failover. Details `docs/P3-LAB-MANUAL-CUTOVER.md`.

## 26/10/2026 — Roadmap thêm Cloudflare multi-domain auto-subdomain
- Đã ghi **P2.5** trong `docs/ROADMAP-TO-V1.md`: list domains theo zone permissions, chọn domain + subdomain từ Mini Hosting, DNS/Tunnel ingress/Nginx tự cấu hình bằng API, HTTPS verify, rollback, không cần IP tĩnh; token ở control plane, wildcard optional; route adapter dùng chung P3/P4.
- **SOURCE STATE VERIFIED**: `Mini Hosting > Thêm website` hiện `/api/sites` chỉ tạo thư mục/Nginx và dịch vụ Node.js. `/api/domains` báo `manual:true`. Không có Cloudflare DNS/Tunnel mutation trong đường tạo website; cần implement P2.5. Không tuyên bố đã tự tạo subdomain.
- **Primary M3**: nút chọn ứng viên + begin/abort lưu Shared Authority Durable Object ở trạng thái `SHARED_AUTHORITY_PREPARE_ONLY`; `declaredPrimary:null`, `writeLeaseGranted:false`. Chưa chuyển route website/Panel, chưa chứng minh stop/fence writer và chưa tự bầu M4. Panel mỗi node 9090; `panel.giaouoc.com` hiện gắn Vsmart Tunnel chứ chưa theo active Primary. Source audit only, không chạy Cloudflare hoặc Android trong lượt này.
- Nguyên tắc: Primary thông thường phục vụ cả website và Panel chung; khi Primary ngắt, URL Panel phải vào Standby recovery-only. Authority không phụ thuộc Primary; chuyển Panel không đồng nghĩa cấp quyền Primary.

## 26/10/2026 — unified Monitor V3 expanded release

- **SOURCE PUSHED**: every Shared Authority node visible as expanded card in original Panel 9090 Monitor, no click to expand; pin/temperature/RAM/storage/Wi-Fi/network/uptime/service states, Node.js process RSS, snapshots, unverified sync, freshness, 12-hour per-node trends. Local/current nodes first; 15s polling and lazy history loads. CPU fully hidden in UI and CPU fallback collection removed.
- **UPDATED USER-VISIBLE ERROR**: `CHƯA CÓ MONITOR V2` where the node's heartbeat exists but no new telemetry; `DỮ LIỆU ĐÃ CŨ` for old metrics; `MẤT TÍN HIỆU` for stale heartbeat. No false claims about offline.
- **RELEASE INSTALLER** `scripts/update-existing-android-node.sh` at commit `33480440f9b5e7652467ff59d31a67332c231dc0`, pinned to code snapshot `30e64673f84f035394e1c2a8069f68198acc5e5f`. Validated all **13** GitHub blob hashes match, JavaScript page parsed, static UI/state/security checks passed. Corrected check for ESM modules via stdin and rollback on explicit install failures.
- **NOT RUN**: Termux physical source install, browser render on real Vsmart/XZ3 and Cloudflare Worker deploy in this session. User must run installer on both nodes and confirm `APPLIED_OK` and Monitor UI. Worker supports telemetry only after separate deployment. No change to production Primary or routing.

# MHC — trạng thái thực thi duy nhất

## 26/10/2026 — monitor installer failure fixed, CPU hidden, legacy node card improved

- **USER OBSERVED:** invoking the original monitor installer on Termux returned `STOP: Unexpected auth module in Panel`. Root cause located in installer check of `crypto.verify` in the wrong file. Exit happened before the installer wrote Panel source. Corrected check now verifies `server.mjs` imports JWT guard and installed `mhc-remote-access.mjs` includes RSA signature verification. No weakening of auth.
- All Panel UI CPU displays removed (Dashboard, Monitor, Node.js processes). Node telemetry no longer measures CPU. Added privacy-safe Wi-Fi RSSI (no SSID/IP/BSSID), 12 service states, process RSS list, last snapshot name/mtime (not integrity proof), DB/Web/Tunnel/Panel indicators, sync-unverified chip, 12h Wi-Fi history and gaps. Legacy monitor screenshot was used as feature baseline, not assumed to represent current live node status.
- Updated sanitized Cloudflare Worker telemetry schema and tests. Isolated in-memory Worker fixture **PASS**: 2-node heartbeat, status, Panel-only history, legacy heartbeat, no CPU, no private fields, no writer grant. GitHub pinned installer blobs **PASS**. Corrected script commit `2656d8b9cb4ddc330a850064567ff257cf4ab030`. **NOT RUN:** new installer on Android, real Wi-Fi API/ps, real Worker deploy, old/current browser screens. Existing `panel.giaouoc.com` SSO unaffected by source plan.
- Old `~/mhc online-enroll CODE` pairing applies to legacy monitor. Current Shared Authority MHC uses manually registered `MHC_MEMBERS_JSON` keys. Ten-minute pairing via Panel is a proposed next feature, **not deployed**; `docs/MONITOR-V2-PAIRING-DESIGN.md`.


## 26/10/2026 — Monitor v2 all-nodes developed, GitHub pushed, runtime deployment NOT RUN

- Expanded original Panel 9090's Monitor for all nodes (Vsmart/XZ3/N), rich device/service/storage/network/battery/CPU/RAM, freshness warnings, 12h history, sample gaps. Current `monitor.thophuong.com` web content was not accessible, so not claimed an exact parity audit.
- New read-only `bin/node-monitor.mjs` collected in agent heartbeat; modified Cloudflare Worker/DO `reference/cluster-authority/worker.mjs` to retain bounded sanitized per-node telemetry and 144 history points (5min spacing). Added authenticated history API in client+Panel bridge/server. No change to Primary rights, writer grant, Tunnel routing or node identity.
- **ISOLATED FIXTURE PASS:** Loaded actual Worker source into in-memory Request/Response/storage mocks: 2-node telemetry and history successful, malformed telemetry rejected, agent denied history, legacy heartbeat works, nothing promoted, privacy field stripped. Mock local Android collector produced correct RAM/storage/battery/services schema. Static app/bridge/server syntax checked. **NOT RUN:** Node test suite, actual Android install, true Cloudflare Worker deploy, 2 phone Monitor/browser regression, screen-off persistence.
- Version-pinned installer `scripts/apply-monitor-all-nodes.sh` was checked against five GitHub blobs at commit `b77f557778c291ec486b9b59ff3693b137367d45`. Only existing clean LAB Vsmart and XZ3, backups, Panel/Agent-only restart and HTTP rollback. Cloudflare Worker must be updated separately under the existing name and DO binding; no secret rotation or deletion. Full instructions `docs/MONITOR-V2-ALL-NODES.md`.


## 26/10/2026 — M3 chọn node ứng viên ngay trong Panel (source + UI rollout)

- User requested immediate manual Primary selection from public Panel. Implemented **durable shared selection PREPARE only** in default `Cluster` overview: choose recent-heartbeat Vsmart/XZ3, `begin` with fresh status/CAS revision and request UUID, display selected candidate/epoch/operation state, allow abort from either Panel. Existing Cloudflare DO already persists the pending operation and rejects stale/concurrent/racing requests.
- `bin/legacy-panel-src/public/app.js` updated in commit `bd9b02c95aede607a353e3471d9c43f832418ac8`; JavaScript syntax parsed successfully via runtime Function constructor, NOT full browser test.
- `scripts/apply-primary-candidate-ui.sh`: pinned source + SHA check, per-node `app.js` backup, no backend/Tunnel/DB changes, after-copy HTTP asset verification + rollback. Deploy script and user runtime installation NOT RUN. Test source `tests/manual-candidate-ui.mjs` added, NOT EXECUTED.
- **Blocking remainder for real M3:** Cloudflare admin route switch to XZ3, target service activation, old-writer fencing, authenticated HTTP+DB readiness, old-primary rejoin handling and two-Android end-to-end. `declaredPrimary:null`, `writeLeaseGranted:false` continue; DO is `SHARED_AUTHORITY_PREPARE_ONLY`. Selection is NOT promotion, no active website moved. Source work must continue without conflating these states.


## 26/10/2026 — SSO + Primary-following Panel user request (source only)

- User confirmed public `panel.giaouoc.com` **working** after JWT header fix; this does **not** mean a Primary is assigned, `declaredPrimary:null` remains.
- User wants Cloudflare Access email-only remote admin login (no Hosting password step). Original Panel Password remains for SSH/localhost recovery. Source patches: verified-JWT-only new session on `GET /api/session` (JWT-bound, Secure/HttpOnly/SameSite=Strict cookie), CSRF unchanged, remote password login disallowed, Access logout URL, local password kept. Source syntax was parsed; E2E integration test `tests/access-sso-panel.mjs` created and syntax parsed, **NOT RUN**. LAB safe rollout script `scripts/apply-panel-access-sso.sh` created, **NOT DEPLOYED**. Do not imply live SSO until operator applies and confirms browser login. Cloudflare Allow policy must restrict admin emails.
- User clarified the public Panel's backend should **follow the actual Primary**. The same Primary serves Panel and app. All nodes have independent local Panel; on Primary outage, independent Cloudflare authority/route must still expose standby recovery Panel until safe Primary activation. No manual Primary activation, independent fencing, web/admin switch, auto-election, or real two-node failover implemented yet. Current M2 PREPARE_ONLY. Design: `docs/PANEL-ACCESS-SSO-PRIMARY-ROUTING-2026-10-26.md`.


## Bổ sung 26/10/2026 — Access 403 header failure observed; targeted source fix, Android re-deploy pending

- **OBSERVED BY USER (later):** Vsmart private log from actual Access login contained `MHC_REMOTE_ACCESS_DENIED JWT_HEADER_INVALID` twice at 12:17 and 12:18 UTC. Prior combined JOSE validation rejected either algorithm, type or key ID, not proven which. RFC 7519 makes typ optional; patch accepts absent/case-insensitive JWT type while still requiring RS256, keyed RSA signature, issuer/aud/time; diagnostic reason now distinguishes algorithm/type/kid. Patch not yet applied to Android or verified through browser, so public access still UNVERIFIED.\n- **OBSERVED BY USER:** Vsmart Panel localhost HTTP 200; Cloudflare redirect HTTP 302; Tunnel service running; matching origin hostname/team/AUD, Access application duration 24h; Cloudflare JWKS HTTPS HTTP 200, 2 RSA/RS256 keys. Browser after login reports `{"error":"Remote Access verification required"}` (HTTP origin 403). **Cause still unverified**; no authentic JWT/header/claims observed. Source tests and physical Android deploy for new diagnostic NOT RUN.
- **SOURCE PUSHED:** `bin/legacy-panel-src/src/mhc-remote-access.mjs` private rate-limited reason diagnostics `MHC_REMOTE_ACCESS_DENIED`, retaining RS256/issuer/AUD/clock/password/CSRF and public generic 403; `tests/remote-panel.mjs` expanded; LAB rollback script `scripts/apply-remote-access-diagnostics.sh`. Android Panel live NOT YET patched; deploy only to Vsmart as confirmed origin, then user log in through Access and read filtered private log to identify exact reason. Public 9090 remains localhost-only.
- **USER-OBSERVED HEARTBEAT:** Vsmart runit `mhc-authority-agent` running; manual shared heartbeat succeeded. Shared state PREPARE_ONLY, no Primary/lease/auto.
- **USER-OBSERVED UI:** Vsmart received frontend-only Cluster patch with `APPLIED_OK`; XZ3 received file by SCP, but `APPLIED_OK` not yet observed in conversation. Browser through SSH 19090 failed by strict localhost Host allowlist; 9090 forwarding works if no conflicting tunnel. No verified public UI success.


Cập nhật sau checkpoint có ý nghĩa; không sao chép trạng thái sang báo cáo audit/status mới. HANDOFF/PROJECT-STATUS là lịch sử; [CONTINUE-MHC.md](CONTINUE-MHC.md) giữ hướng dẫn kết nối/phục hồi.

Branch `codex/m1-m2-foundation`. Ngày ghi nhận 26/10/2026. Vsmart Termux aarch64, Node v26.12.1, PHP 8.5.12, SSH `192.168.1.4:8022`. Người dùng cho phép push checkpoint.

## Bổ sung 26/10/2026 — hai Android M2 có heartbeat (bằng chứng người dùng)

- **OBSERVED BY USER (17:19 giờ VN)**: Vsmart-LAB và Sony-XZ3 đã truy cập cùng Cloudflare authority; output `~/mhc-full cluster-authority status` từ Sony hiển thị `nodeCount:2`, `mode:SHARED_AUTHORITY_PREPARE_ONLY`, Vsmart `4ed4c025-62ae-4c2a-8d68-65dd76ecf550` và XZ3 `4a9672d1-bb62-4286-946a-a78b73e57b24` đều có `heartbeatRecent:true` tại thời điểm đọc; cluster ID `2c1ea7c0-1d1f-4802-8336-0925a529c431`. Đây là lần đầu có bằng chứng người dùng về **hai máy Android thật** cùng authority; Codex chưa tự nghiệm thu reboot, failover, browser hoặc cutover.
- **Not M3/M4**: `declaredPrimary:null`, `revision:0`, `writeLeaseGranted:false`, `automaticFailover:false`, `canComplete:false`. Đăng ký/heartbeat thật KHÔNG chứng minh website, replication, fence hoặc HA.
- **UI source đã push**: commit `f0c94a4` thay `bin/legacy-panel-src/public/app.js` để sửa bảng Heartbeat thiếu dữ liệu (`heartbeatRecent/lastSeenAt`) và thêm tổng quan Cluster ngắn + trang kỹ thuật LAB cũ; JS parse PASS, GitHub re-fetch PASS; **chưa có browser Android test**. Các node phải source-only upgrade và `hosting-panel apply` riêng mới nhìn thấy bản này.
- **Public Panel Access còn lỗi**: khi cả hai máy offline user nhận Cloudflare 1033; sau online `panel.giaouoc.com` nhận `{"error":"Remote Access verification required"}` từ Panel origin. Chưa kết luận nguyên nhân; cần xác nhận route thực đang đến node nào, `remote-panel status`, trạng thái Tunnel và Access JWT Team Domain/AUD; không tắt xác minh JWT. Xem `docs/CLUSTER-UI-HEARTBEAT-REMOTE-ACCESS-2026-10-26.md`.
- Các ghi nhận `NOT RUN` về Worker thật/hai Android trong checkpoint lịch sử phía dưới là **trước** bằng chứng mới và cần được phân biệt theo thời điểm; phần Panel Internet end-to-end và tuyến dự phòng vẫn **CHƯA ĐẠT**.

## M1 — Hosting một node: IN PROGRESS

- **Hoạt động thực:** source-only upgrade và Panel 9090; mật khẩu mới giữ nguyên; login/session/CSRF; static demo, nginx → PHP-FPM, MariaDB, WordPress LAB HTTP. Tạo/đọc bài và nhập ảnh WP-CLI; thêm đăng nhập HTTP, nonce, multipart upload ảnh và GET ảnh thật qua nginx/PHP/DB. Backup site/SQL, checksum, restore vào DB/thư mục riêng, phục vụ bản restore HTTP. Site gốc và Panel khỏe sau rehearsal.
- **Commit mã triển khai:** `889786e` (base full upgrade `f05f569`). SHA256 ba script sửa cuối khớp source trên node.
- **PASS — Windows mock/source:** service environment, guard management, authority/storage fixture và nhóm hồi quy liên quan.
- **PASS — Vsmart Android:** full source self-test `ba0be57`, full installer self-test `f05f569`; focused `wordpress-provision`, `site-probe-cleanup`, `integration-backup`, `static-sites`, `node-clone` ở `889786e` (runner dùng fixtures dù chạy Android). HTTP/SQL/Panel và backup→restore trên là runtime thật; log `~/mhc-lab-runs/m1-m2-20261026/acceptance.log`.
- **FAIL đã xử lý:** executable bit từ Windows tar; WP-CLI TAR thiếu file, PHP memory limit/socket MariaDB; probe EXIT trap; curl pipefail trong helper. Nhóm liên quan đã chạy lại PASS. Exit 23 cũ trong `final-deploy.log` không còn là lỗi chưa xử lý.
- **NOT RUN:** reboot/Doze Android, thao tác giao diện trình duyệt (đường HTTP upload đã PASS bằng client), full suite lại ở `889786e` (đã chạy nhóm chịu ảnh hưởng), nhiều Android.
- **Thiếu DoD:** M1-05 reboot/lifecycle. Có `~/.termux/boot/10-start-hosting`, chưa chứng minh tự hồi phục sau reboot. Không gọi M1 DONE chỉ vì hosting hoạt động.
- **Blocker cần user:** reboot vật lý/Termux:Boot và mở lại Termux nếu Android không tự chạy; chưa reboot từ SSH không đặc quyền.
- **Việc tiếp theo:** phối hợp reboot thực khi có người mở lại Termux nếu cần; chuyển trọng tâm thi công sang M2 trong lúc chờ, không lặp full self-test đã đạt.

## M2 — Panel mọi node và authority chung: IN PROGRESS

- **Hoạt động thực:** Panel nâng cấp trên Vsmart; origin Access JWT đã cấu hình với Team/AUD user cung cấp cho `panel.giaouoc.com`, JWKS HTTPS reachable, restart riêng Panel và auth/CSRF/password PASS. Connector riêng `mhc-panel-tunnel` (cloudflared 2026.10.3) chạy bằng token-file private user tự nhập, 4 kết nối đăng ký Cloudflare, có log rotation. Probe HTTP socket xác minh Host public thiếu/JWT sai → 403. Chưa bật authority.json/agent chung trên site đang phục vụ.
- **Mới có source:** Worker/SQLite DO membership, heartbeat riêng agent, revision/epoch/CAS, journal/receipt/audit begin/abort; client HTTPS fail-closed; Panel bridge chung; chặn manual/auto cũ khi cấu hình authority. PREPARE_ONLY, không writer grant/Primary commit/route.
- **Commit kết quả:** `66a4064` (connector runit thật/private enrollment), `78230ee` (bootstrap và hai Panel HTTP), `783cb80` (hosting evidence), `f05f569` (M2 bridge). Bằng chứng route/DNS mới nằm trong checkpoint chứa cập nhật này; tra SHA như hướng dẫn cuối trang.
- **Source mới ở checkpoint này:** `cluster-authority prepare/configure` tạo credentials riêng 0600, prepare không bật shared mode; configure kiểm HTTPS và cả hai role trước ghi, không overwrite config khác. `prepare-secrets.mjs` gom membership đầy đủ vào JSON private ngoài source/Git để user nạp Wrangler qua stdin. Helper nhập Tunnel token trên TTY, không argv/stdout.
- **PASS — Windows mock và Vsmart fixture:** concurrency chỉ một begin, auth phân vai, replay/idempotency, restart object, lỗi storage, fail-closed, bridge Panel và chặn legacy. Không tương đương Cloudflare runtime/nhiều Android.
- **PASS — Vsmart, hai process cách ly:** `tests/authority-http-panels.mjs` chạy Panel HTTP thật + TLS client + Worker/storage fixture: private enrollment/retry, production-footprint/file permissions, handshake lỗi không cài config, CSRF/auth, hai begin chỉ một thắng, receipt replay, restart DO fixture, tắt một Panel vẫn abort từ Panel kia, authority outage không fallback. Log `~/mhc-lab-runs/m1-m2-20261026/authority-http-panels.log`. Hai HOME/process trên một Vsmart, không phải hai Android. Windows bài này NOT RUN vì cần POSIX/openssl.
- **FAIL đã sửa trong integration mới:** Android từ chối hardlink; writer private file chuyển sang lock-directory + fsync/rename, không dùng hardlink, test chạy lại PASS.
- **Chuẩn bị node thật PASS:** runtime bootstrap `78230ee`; identity `4ed4c025-62ae-4c2a-8d68-65dd76ecf550`, cluster dự kiến `2c1ea7c0-1d1f-4802-8336-0925a529c431`. Private enrollment và `~/mhc-lab-runs/m1-m2-20261026/cloudflare-lab-secrets.json` đã tạo cho một node, không đưa vào Git. Thêm node phải giữ UUID/key hiện có. Log `m2-prepare.log`; không chạy lại script tạo UUID/file này.
- **PASS — route Internet trước đăng nhập:** DNS resolver public 1.1.1.1 trả A/AAAA; HTTPS request với SNI/chứng chỉ được kiểm, IP lấy từ DNS public, trả 302 đến đúng Team Domain Access; HTTP trả 301 về HTTPS. Không bypass TLS. Chưa kiểm request mang JWT hợp lệ sau user login nên chưa kết luận end-to-end Panel Internet.
- **FAIL — DNS LAN đang chờ user sửa:** Windows/Chrome và router resolver 192.168.1.1 vẫn NXDOMAIN; đã xóa Windows DNS cache nhưng router vẫn trả cũ. Chrome thực báo `DNS_PROBE_FINISHED_NXDOMAIN`. Phiên shell không có Administrator; đã hướng dẫn user đổi DNS Wi-Fi 2 sang 1.1.1.1/1.0.0.1 bằng PowerShell admin. Không sửa router, hosts hoặc hạ xác minh TLS/JWT.
- **NOT RUN:** Worker thật, hai Panel Android chung authority, JWT hợp lệ qua Tunnel sau đăng nhập Access, URL quản trị sống khi một node offline.
- **Thiếu DoD:** deploy/kiểm authority Cloudflare, hai Android, Panel Internet và tuyến dự phòng độc lập Primary. Bootstrap và hai Panel HTTP một máy đã có; không tính thành multi-device DoD.
- **BLOCKED — nghiệm thu Cloudflare/nhiều Android:** Published application route đã reachable qua DNS public; còn user khắc phục DNS LAN và đăng nhập Access/Panel, deploy Worker/nạp secrets, cung cấp SSH node LAB thứ hai. Không dùng M51/X7b thay thế.
- **Việc tiếp theo:** xác minh Chrome vào Access/Panel sau DNS được sửa, rồi deploy Worker/nạp secrets qua stdin, configure/heartbeat endpoint thật. M3 source có thể làm độc lập nhưng chưa được tuyên bố cutover đạt.

## M3 — Manual Primary end-to-end: NOT STARTED

- **Hoạt động thực:** chưa cutover.
- **Mới có source:** legacy manual record/route journal và guard stop-writer; chưa candidate activation/commit qua authority chung.
- **Commit liên quan:** `f05f569` (chặn legacy/tích hợp PREPARE, không phải M3 đạt).
- **Test:** legacy fixture PASS trong full suite; activation/route/HTTP identity/chuyển giữa Android NOT RUN.
- **Thiếu DoD:** luồng durable chung: candidate/restore, dừng hoặc fence writer cũ, kích hoạt đích, route/nhận diện HTTP, commit, crash retry, rejoin quarantine. Heartbeat mất không chứng minh writer dừng.
- **Blocker:** nghiệm thu cần authority/node thứ hai; source tiếp tục độc lập được.
- **Việc tiếp theo:** nối transition executor vào authority sau M2 config/HTTP integration; giữ quyền ghi mặc định đóng.

## M4 — Auto dùng luồng Manual: NOT STARTED

- **Hoạt động thực:** chưa bật auto.
- **Mới có source:** legacy recommendation/best-effort, không dùng làm auto mới.
- **Commit nền:** `af8666e`; M2 `f05f569` chặn auto cũ trong shared mode.
- **Test:** legacy fixtures PASS; auto authority/cutover nhiều Android NOT RUN.
- **Thiếu DoD:** tái dùng M3, snapshot xác minh, health/cooldown, candidate failure và rejoin/partition.
- **Blocker:** M3 chưa xong, thiếu nghiệm thu nhiều Android.
- **Việc tiếp theo:** hoàn thành M3 trước, không mở replication/scoring nâng cao.

## M5 — Migration production: NOT STARTED

- **Hoạt động/source mới:** chưa triển khai/sửa M51/X7b.
- **Commit nền tài liệu:** `af8666e`. Tests production NOT RUN.
- **Thiếu DoD/blocker:** nghiệm thu LAB, backup độc lập, dry-run, user duyệt từng cutover.
- **Việc tiếp theo:** giữ ngoài phạm vi hiện tại.

## Bằng chứng checkpoint hosting

```text
PASS: real site/SQL/media snapshot restored to isolated DB/files and served HTTP
PASS: local nginx -> PHP-FPM -> PHP for managed site.
PASS: authenticated Panel API modules / cluster / primary-selection / auto-primary / remote-access
PASS: new password preserved after Panel upgrade; authentication and CSRF enforced
PASS: original WordPress and Panel healthy after restore rehearsal
```

Không lưu secrets/dump. SHA của chính bản ghi checkpoint tra bằng `git log -1 --format=%H -- docs/LIVE-PROGRESS.md` (không ghi SHA tự tham chiếu).


## 26/10 — one-command node bootstrap + joining and XZ3 reboot repair, source pushed
- Source release pinned `2f14deb8d6fc31118a4bbc6b0a67e38bc2049767`. Published fresh bootstrap `e4bd8cfbdebfa0aa8a3b2c1956cb04f44ee92f34` and existing-LAB unified update `d3b5f696977770cea23333d6286f2f34002e88bc`. Verified exact all 13 updater manifest blobs against release SHA; backup/rollback and boot doctor sources included.
- One-use invite/candidate membership Worker code + Panel invite endpoint + node join CLI and management agent autostart; original Panel shows full Monitor cards for all nodes without clicks and no CPU. Existing Worker needs deploy with same binding/secrets.
- **PASS in mock Durable Object fixture** for Panel invitation, one-time 192-bit code, dynamic node membership, Agent heartbeat, unauthorized Agent invite denied, code replay denied, no Primary/writer grant. Crypto in isolated fixture was mocked; not a real signed Cloudflare deployment.
- **NOT RUN**: real Node automated test suite (`tests/cluster-pairing.mjs`), clean Termux installer, Android reboot/Termux:Boot, screen-off XZ3, end-to-end Worker rollout, physical third-node pairing. User-reported XZ3 stopped services after reboot; cause has not been proven on phone. The integrated boot repair is source code, not yet deployed to XZ3. `docs/ONE-COMMAND-NODE-SETUP.md` has exact operator commands.
- Remote Panel app/site deploy orchestration, actual Primary cutover and auto failover **remain unimplemented**; no mislabeling.


## 26/10/2026 — XZ3 báo CHƯA CÓ MONITOR V2, mã chẩn đoán phát hành
- Chưa có bằng chứng Worker hiện đã được deploy và XZ3 Agent đã gửi telemetry. Không tự khẳng định lỗi nằm ở Termux:API.
- Code: `bin/node-doctor.sh` kiểm tra trực tiếp collector và phân biệt status Worker schema; `bin/cluster-authority.mjs` ghi error class có giới hạn tốc độ thay cho hoàn toàn bỏ qua lỗi collector, vẫn giữ heartbeat khi thiếu metrics.
- Single-source existing-node updater mới `scripts/update-existing-android-node.sh` commit `e36b804a237b34c5042c853fc87656df10b801e9` pin `7ea74bcc6dd519bac97cb2e4eb45d8d3570f51ed`; không sửa Cloudflare hay dữ liệu website. **NOT RUN** XZ3 thật, Worker thật, screen off hoặc browser.
## 27/10/2026 — tiếp nhận Git và kiểm kê read-only (checkpoint source `055aab5`)

- **P0 IN PROGRESS:** checkout sạch `0903b88` đã fast-forward đến GitHub `055aab5` (143 commit mới). Audit chi tiết: `CODEX-RESUME-AUDIT-2026-10-27.md`. Code clock-health riêng ở workspace cha chưa nhập Git, được bảo vệ.
- **P1 IN PROGRESS:** Vsmart thật SSH/Panels/Agent/WordPress services và localhost 9090/18080 HTTP 200; site WordPress `mhc-lab` còn đăng ký. Reboot/restore hiện hành **NOT RUN**. M1 HTTP/SQL/upload/restore PASS là bằng chứng ngày 26/10, không được tự nâng thành nghiệm thu mới.
- **P2 IN PROGRESS:** Vsmart authority thật có 3 node heartbeat + telemetry mới, gồm Vsmart và Sony XZ3; `PREPARE_ONLY`, revision 3, epoch 0, không Primary/lease. Vsmart Panel/Agent/Tunnel chạy; Sony SSH auth bị từ chối dù host key tin cậy, Tunnel `unknown` qua telemetry, kiểm trực tiếp **BLOCKED** chờ user thêm public key. Node thứ ba F3216 chưa rõ vai trò, không thao tác.
- **P3 IN PROGRESS source, BLOCKED live:** 13 updater blob pins khớp `f73df61`. Vsmart collector/server khớp pin nhưng authority client/UI còn phiên bản trước P3 recovery. Cloudflare Worker/Cron/DNS/Access runtime **NOT VERIFIED**; không chạy updater/deploy/cutover. Candidate activation, fencing, origin HTTP và rollback còn thiếu. **P4/P5 NOT STARTED** runtime/migration.
- **PASS Windows mock:** P3 route, P3 Panel recovery, pairing và Monitor tests; 7 JS syntax checks; 13 manifest hashes. **FAIL Windows:** candidate UI structural test đòi literal cũ; Access SSO process không start trong fixture. **NOT RUN:** Bash syntax, full suite, Sony direct, two-Android cutover, public browser, Cloudflare account. Commit source gần nhất `055aab5`; checkpoint audit docs SHA xem Git history sau commit.
- **Việc tiếp theo:** xác minh Sony qua SSH key, nhận diện node F3216 và Cloudflare read-only; sau nhiệm vụ kiểm kê mới xử lý test/version drift rồi P3 LAB end-to-end. Không dùng M51/X7b để nghiệm thu.
## 27/10/2026 — XZ3 SSH và runtime checkpoint (sau `a6bfa55`)

- **P2 IN PROGRESS, PASS trên Android thật:** Sony XZ3 SSH key + pinned host key; local Panel 9090 HTTP 200, Agent/Monitor v2 `MONITOR_V2_OK`, shared authority status cùng cluster revision 3 và 3/3 telemetry sender với Vsmart. Panel/Agent/nginx/mysqld runit chạy. XZ3 source có collector/server mới nhưng authority client `8718e95` và Panel UI `bdf48f3` trước P3 recovery. Không có thao tác deploy/restart.
- **BLOCKED cho Panel dự phòng/P3:** XZ3 `remote-panel configured:false`, `mhc-panel-tunnel` chưa cài; `sites list` rỗng, web 18080 HTTP 000, snapshot chưa xác minh. `sshd` runit đang down dù daemon ngoài supervision phục vụ SSH. Boot log cũ `MHC_BOOT_FINISHED`/Panel 200 nhưng reboot mới **NOT RUN**. Internet Access/Worker P3/Cron **NOT VERIFIED**; không có Primary/lease.
- **Node thứ ba:** user xác nhận F3216 là LAB ở nhà; heartbeat từ authority có, SSH trực tiếp từ mạng công ty NOT RUN/không có đường truy cập. Không đưa vào nghiệm thu hai Android tại công ty.
- **Việc tiếp theo:** xác minh Cloudflare LAB, sửa SSH supervision và cấu hình Tunnel/Access XZ3 trong mốc triển khai có backup/rollback riêng; sau đó đồng bộ source hai LAB và nghiệm thu manual cutover. Commit checkpoint tài liệu xem Git history.
