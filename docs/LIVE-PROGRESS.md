# MHC — trạng thái thực thi duy nhất

Cập nhật sau checkpoint có ý nghĩa; không sao chép trạng thái sang báo cáo audit/status mới. HANDOFF/PROJECT-STATUS là lịch sử; [CONTINUE-MHC.md](CONTINUE-MHC.md) giữ hướng dẫn kết nối/phục hồi.

Branch `codex/m1-m2-foundation`. Ngày ghi nhận 26/10/2026. Vsmart Termux aarch64, Node v26.12.1, PHP 8.5.12, SSH `192.168.1.4:8022`. Người dùng cho phép push checkpoint.

## M1 — Hosting một node: IN PROGRESS

- **Hoạt động thực:** source-only upgrade và Panel 9090; mật khẩu mới giữ nguyên; login/session/CSRF; static demo, nginx → PHP-FPM, MariaDB, WordPress LAB HTTP. Tạo/đọc bài và nhập ảnh qua WP-CLI thật. Backup site/SQL, checksum, restore vào DB/thư mục riêng, phục vụ bản restore qua HTTP. Site gốc và Panel khỏe sau rehearsal.
- **Commit mã triển khai:** `889786e` (base full upgrade `f05f569`). SHA256 ba script sửa cuối khớp source trên node.
- **PASS — Windows mock/source:** service environment, guard management, authority/storage fixture và nhóm hồi quy liên quan.
- **PASS — Vsmart Android:** full source self-test `ba0be57`, full installer self-test `f05f569`; focused `wordpress-provision`, `site-probe-cleanup`, `integration-backup`, `static-sites`, `node-clone` ở `889786e` (runner dùng fixtures dù chạy Android). HTTP/SQL/Panel và backup→restore trên là runtime thật; log `~/mhc-lab-runs/m1-m2-20261026/acceptance.log`.
- **FAIL đã xử lý:** executable bit từ Windows tar; WP-CLI TAR thiếu file, PHP memory limit/socket MariaDB; probe EXIT trap; curl pipefail trong helper. Nhóm liên quan đã chạy lại PASS. Exit 23 cũ trong `final-deploy.log` không còn là lỗi chưa xử lý.
- **NOT RUN:** reboot/Doze Android, upload qua trình duyệt WP, full suite lại ở `889786e` (đã chạy nhóm chịu ảnh hưởng), nhiều Android.
- **Thiếu DoD:** M1-05 reboot/lifecycle; kiểm giao diện upload HTTP. Không gọi M1 DONE chỉ vì hosting hoạt động.
- **Blocker cần user:** reboot vật lý/Termux:Boot và mở lại Termux nếu Android không tự chạy; chưa reboot từ SSH không đặc quyền.
- **Việc tiếp theo:** kiểm boot setup chỉ đọc và upload WordPress HTTP; sau đó tập trung M2, không lặp full self-test đã đạt.

## M2 — Panel mọi node và authority chung: IN PROGRESS

- **Hoạt động thực:** Panel nâng cấp trên Vsmart; chưa bật authority.json/agent chung trên site đang phục vụ.
- **Mới có source:** Worker/SQLite DO membership, heartbeat riêng agent, revision/epoch/CAS, journal/receipt/audit begin/abort; client HTTPS fail-closed; Panel bridge chung; chặn manual/auto cũ khi cấu hình authority. PREPARE_ONLY, không writer grant/Primary commit/route.
- **Commit kết quả:** `f05f569`; nền test `d316311`/`ba0be57`.
- **PASS — Windows mock và Vsmart fixture:** concurrency chỉ một begin, auth phân vai, replay/idempotency, restart object, lỗi storage, fail-closed, bridge Panel và chặn legacy. Không tương đương Cloudflare runtime/nhiều Android.
- **NOT RUN:** Worker thật, hai Panel Android chung authority, Access/JWT Internet, URL quản trị sống khi một node offline.
- **Thiếu DoD:** bootstrap/config dễ triển khai, hai Panel HTTP thật, Cloudflare/node thứ hai, tuyến Panel dự phòng độc lập Primary.
- **BLOCKED — nghiệm thu Cloudflare/nhiều Android:** cần user cấu hình tài khoản và cung cấp SSH node LAB thứ hai. User đã nhận lời cả hai; không dùng M51/X7b thay thế.
- **Việc tiếp theo:** hoàn thiện Cloudflare LAB/private enrollment và kiểm nhiều Panel HTTP với authority fixture; ghi rõ giới hạn mô phỏng.

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
