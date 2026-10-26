# MHC — trạng thái thực thi duy nhất

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
