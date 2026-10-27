# MHC — kiểm kê tiếp nhận 27/10/2026

Quan sát khoảng 01:24–01:26 UTC (08:24–08:26 Việt Nam). Phạm vi: Git, test Windows, SSH chỉ đọc Vsmart và telemetry Sony qua shared authority. Không nâng cấp, restart, đổi DNS, bật Primary hoặc đọc secret. Đây là biên bản kiểm kê, không phải nghiệm thu P3.

## Git, thiết bị và Cloudflare

| Nơi | Kết quả đã kiểm |
|---|---|
| GitHub `codex/m1-m2-foundation` | HEAD `055aab52439f9fa5cd7c71c85bc6d1c2fc10a35c`, 143 commit sau `0903b883e83047588554198908608f5aee8f8ed5`; chứa `f73df61` và `764ba51`. |
| Checkout `.work/repository` | Ban đầu sạch ở `0903b88`; fetch rồi fast-forward an toàn đến `055aab5`. Thư mục cha `E:\CODE\MHC\MHC` không phải Git repo; có code clock-health chưa nhập Git: `bin/clock-health.mjs`, `tests/clock-health.mjs`, thay đổi `bin/remote-panel.mjs` và `bin/self-test.sh`. Giữ nguyên, không chép đè. |
| Vsmart | SSH key với strict host key PASS. Marker `TEST 0.5.0C-REMOTE-PANEL installed on clean Termux`. Collector Monitor blob `e79689c` và Panel server blob `9cb4832` khớp release `f73df61`; authority client blob `aba5764` (trước P3) và Panel `app.js` blob `bdf48f3` (manual route `e22de3b`) **chưa khớp** release P3 recovery (`5c72ae1` / `694eac6`). |
| Sony XZ3 | User xác nhận `u0_235@192.168.1.41:8022`; host key được xác thực nhưng SSH key bị từ chối. Chưa kiểm tra trực tiếp version, Panel, boot, Tunnel, website hoặc DB; chờ user thêm public key. |
| Cloudflare | Không có kết nối quản trị tài khoản được xác nhận. Worker deploy hash, Cron, P3 opt-in, DNS/CNAME, XZ3 Tunnel và Access/JWT từng origin **CHƯA XÁC MINH**. Probe public Windows lỗi TLS schannel, HTTP 000; không suy ra lỗi origin. |

Vsmart `node-doctor --check` thấy Panel localhost:9090 và web localhost:18080 đều HTTP 200. `sv` theo đường dẫn service đầy đủ xác nhận `amh-panel`, `mhc-authority-agent`, `mhc-panel-tunnel`, `sshd`, `nginx`, `mysqld`, WordPress PHP/Nginx đang chạy. `sites list` có `mhc-lab` WordPress và `demo` static. `remote-panel status` báo configured, origin JWT required; lệnh này không xác nhận Cloudflare deploy. Snapshot metadata `snapshot-20261026` có `verified:false`. M1 từng có bằng chứng WordPress HTTP/SQL/upload và backup→restore ngày 26/10 trong `LIVE-PROGRESS`, nhưng lượt này không lặp write/restore/reboot.

Authority thực trả `SHARED_AUTHORITY_PREPARE_ONLY`, revision 3, epoch 0, `declaredPrimary:null`, `pending:null`, `writeLeaseGranted:false`, `automaticFailover:false`. Vsmart và Sony đều heartbeat/telemetry gần thời điểm đọc. Còn một node thứ ba `Android Node`, model F3216, cũng heartbeat. **Chưa xác định đây là LAB hay thiết bị có dữ liệu thật; không thao tác node này trước khi nhận diện.** Sony metrics từ authority báo Panel/nginx/mysqld/Agent running, Panel Tunnel unknown, sshd stopped. Tuy nhiên kết nối SSH tới được bước xác thực, nên nhãn sshd stopped cần kiểm tra trực tiếp, không kết luận daemon tắt. Sony chưa báo snapshot đã xác minh hoặc bản restore site.

## Source và kiểm thử

143 commit mới thêm Monitor nhiều node, pairing 10 phút, bootstrap và updater 13 file, SSO Access, P3 DNS route/journal và Panel-only recovery Cron. Worker/DO source có Cron mỗi phút và opt-in; runtime Cloudflare chưa xác minh. Manifest `scripts/update-existing-android-node.sh` ghim snapshot `f73df61`; cả 13 Git blob SHA khớp. Updater không chạy. Bảy tệp JS mới `node --check` PASS. `bash -n` NOT RUN vì Bash trên Windows bị từ chối truy cập.

Windows Node v22.22.2, fixture/mock: `tests/p3-route.mjs`, `tests/p3-panel-recovery.mjs`, `tests/cluster-pairing.mjs`, `tests/monitor-all-nodes.mjs` PASS. `tests/manual-candidate-ui.mjs` FAIL vì đòi literal `declaredPrimary:null` không còn nguyên dạng trong Worker; cần phân biệt test cũ với lỗi chức năng. `tests/access-sso-panel.mjs` FAIL ở bước “panel started” trên Windows; cần chẩn đoán process startup và chạy lại ở môi trường phù hợp. Full self-test, test Android mới, trình duyệt Internet, Cloudflare runtime NOT RUN. Không coi fixture là nghiệm thu hai điện thoại.

## P0–P5 và việc kế tiếp

| Mốc | Trạng thái | Thiếu để đạt DoD |
|---|---|---|
| P0 kiểm kê/bảo vệ | IN PROGRESS | Sony SSH, Cloudflare read-only, nhận diện node thứ ba, chẩn đoán 2 test FAIL. |
| P1 hosting Vsmart | IN PROGRESS | Reboot/Termux lifecycle, đối chiếu WordPress và backup hiện hành. |
| P2 Panel/authority | IN PROGRESS | Hai Panel/Access/Tunnel cùng revision được kiểm trực tiếp, XZ3 origin/boot, browser Internet và CAS trên hai máy thật. Heartbeat/telemetry hai node đã quan sát. |
| P3 manual Primary | IN PROGRESS source LAB; BLOCKED triển khai thực | Đồng bộ source, Cloudflare LAB riêng, restore/kích hoạt ứng viên, HTTP/DB origin proof, chặn mọi đường ghi node cũ, cutover/rollback hai Android. DNS verified/operator attest không phải writer lease. |
| P4 auto Primary | NOT STARTED runtime | Tái dùng pipeline P3 an toàn, verified snapshot, cooldown/rejoin/fencing và test partition. Cron Panel-only là cứu hộ quản trị, không bầu Primary. |
| P5 production migration | NOT STARTED | Chỉ sau LAB đạt và user duyệt riêng. M51/X7b không được chạm. |

Ưu tiên P0: nhận diện node F3216, không chạy updater/P3 hay thử outage trên đó; giải quyết SSH Sony và chứng minh Tunnel/Access của XZ3. Ưu tiên P1: xử lý lệch version Vsmart, xác nhận Cloudflare deployment và sửa test drift thành một checkpoint. Nhiệm vụ sau mới lập cửa sổ LAB có backup, cập nhật hai node/Worker theo pin, rồi hoàn thiện candidate activation, fencing, HTTP proof và chạy manual cutover/rollback website/DB LAB. **Dừng ở báo cáo và tài liệu trong nhiệm vụ hiện tại.**
