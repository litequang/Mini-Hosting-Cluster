# MHC — trạng thái thực thi duy nhất

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
