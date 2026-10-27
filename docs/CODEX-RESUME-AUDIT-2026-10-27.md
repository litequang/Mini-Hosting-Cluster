# MHC — kiểm kê tiếp nhận 27/10/2026

Quan sát ban đầu khoảng 01:24–01:26 UTC (08:24–08:26 Việt Nam); bổ sung kiểm tra XZ3 trực tiếp khoảng 01:33 UTC (08:33 Việt Nam) sau khi user cài public key. Phạm vi: Git, test Windows và SSH chỉ đọc hai LAB. Không nâng cấp, restart, đổi DNS, bật Primary hoặc đọc secret. Đây là biên bản kiểm kê, không phải nghiệm thu P3.

## Git, thiết bị và Cloudflare

| Nơi | Kết quả đã kiểm |
|---|---|
| GitHub `codex/m1-m2-foundation` | HEAD `055aab52439f9fa5cd7c71c85bc6d1c2fc10a35c`, 143 commit sau `0903b883e83047588554198908608f5aee8f8ed5`; chứa `f73df61` và `764ba51`. |
| Checkout `.work/repository` | Ban đầu sạch ở `0903b88`; fetch rồi fast-forward an toàn đến `055aab5`. Thư mục cha `E:\CODE\MHC\MHC` không phải Git repo; có code clock-health chưa nhập Git: `bin/clock-health.mjs`, `tests/clock-health.mjs`, thay đổi `bin/remote-panel.mjs` và `bin/self-test.sh`. Giữ nguyên, không chép đè. |
| Vsmart | SSH key với strict host key PASS. Marker `TEST 0.5.0C-REMOTE-PANEL installed on clean Termux`. Collector Monitor blob `e79689c` và Panel server blob `9cb4832` khớp release `f73df61`; authority client blob `aba5764` (trước P3) và Panel `app.js` blob `bdf48f3` (manual route `e22de3b`) **chưa khớp** release P3 recovery (`5c72ae1` / `694eac6`). |
| Sony XZ3 | SSH key + strict host key PASS tới `u0_235@192.168.1.41:8022`. Marker cùng `TEST 0.5.0C-REMOTE-PANEL`. Collector Monitor blob `e79689c`, Panel server `9cb4832`, Panel UI `bdf48f3`; authority client blob `8718e95` (trước P3). Cả hai LAB chưa có Panel recovery UI `694eac6`. |
| Cloudflare | Không có kết nối quản trị tài khoản được xác nhận. Worker deploy hash, Cron, P3 opt-in, DNS/CNAME, XZ3 Tunnel và Access/JWT từng origin **CHƯA XÁC MINH**. Probe public Windows lỗi TLS schannel, HTTP 000; không suy ra lỗi origin. |

Vsmart `node-doctor --check` thấy Panel localhost:9090 và web localhost:18080 đều HTTP 200. `sv` theo đường dẫn service đầy đủ xác nhận `amh-panel`, `mhc-authority-agent`, `mhc-panel-tunnel`, `sshd`, `nginx`, `mysqld`, WordPress PHP/Nginx đang chạy. `sites list` có `mhc-lab` WordPress và `demo` static. `remote-panel status` báo configured, origin JWT required; lệnh này không xác nhận Cloudflare deploy. Snapshot metadata `snapshot-20261026` có `verified:false`. M1 từng có bằng chứng WordPress HTTP/SQL/upload và backup→restore ngày 26/10 trong `LIVE-PROGRESS`, nhưng lượt này không lặp write/restore/reboot.

Authority thực trả `SHARED_AUTHORITY_PREPARE_ONLY`, revision 3, epoch 0, `declaredPrimary:null`, `pending:null`, `writeLeaseGranted:false`, `automaticFailover:false`. Cả Vsmart và Sony có heartbeat/telemetry mới, và `cluster-authority status` trên XZ3 đọc cùng cluster/revision. Node thứ ba `Android Node`, model F3216, cũng heartbeat; người dùng xác nhận đây là **máy LAB ở nhà**, chưa thể truy cập SSH trực tiếp từ mạng công ty. Không đưa vào nghiệm thu hai Android tại công ty.

Trên XZ3 thật: `node-doctor --check` thấy Panel 9090 HTTP 200, Monitor v2 collector OK, shared Worker schema v2 với 3/3 sender. `sv` xác nhận Panel/Agent/nginx/mysqld running. `remote-panel status` **configured:false** và **không có** service `mhc-panel-tunnel`; `sites list` trống, port web 18080 HTTP 000, chưa có WordPress/backup snapshot. Endpoint `/api/session` localhost HTTP 200, `/api/mhc/cluster` không đăng nhập HTTP 401 đúng guard; chưa nghiệm thu Panel UI đăng nhập/Access trên XZ3. `sshd` runit **down/normally up**, trong khi một `sshd` riêng PID 9663 (PPID 1) phục vụ SSH; đây là rủi ro boot supervision, không được coi là sshd runit khỏe. Termux:Boot scripts hiện diện, `boot-last.log` có `MHC_BOOT_FINISHED` và Panel HTTP 200 ngày 26/10 23:24 +07, nhưng không chứng minh tự phục hồi sau một reboot được quan sát trong lượt này. Không khởi động lại hoặc sửa service.

## Source và kiểm thử

143 commit mới thêm Monitor nhiều node, pairing 10 phút, bootstrap và updater 13 file, SSO Access, P3 DNS route/journal và Panel-only recovery Cron. Worker/DO source có Cron mỗi phút và opt-in; runtime Cloudflare chưa xác minh. Manifest `scripts/update-existing-android-node.sh` ghim snapshot `f73df61`; cả 13 Git blob SHA khớp. Updater không chạy. Bảy tệp JS mới `node --check` PASS. `bash -n` NOT RUN vì Bash trên Windows bị từ chối truy cập.

Windows Node v22.22.2, fixture/mock: `tests/p3-route.mjs`, `tests/p3-panel-recovery.mjs`, `tests/cluster-pairing.mjs`, `tests/monitor-all-nodes.mjs` PASS. `tests/manual-candidate-ui.mjs` FAIL vì đòi literal `declaredPrimary:null` không còn nguyên dạng trong Worker; cần phân biệt test cũ với lỗi chức năng. `tests/access-sso-panel.mjs` FAIL ở bước “panel started” trên Windows; cần chẩn đoán process startup và chạy lại ở môi trường phù hợp. Full self-test, test Android mới, trình duyệt Internet, Cloudflare runtime NOT RUN. Không coi fixture là nghiệm thu hai điện thoại.

## P0–P5 và việc kế tiếp

| Mốc | Trạng thái | Thiếu để đạt DoD |
|---|---|---|
| P0 kiểm kê/bảo vệ | IN PROGRESS | Cloudflare read-only, chẩn đoán 2 test FAIL. Sony SSH trực tiếp đã PASS; F3216 được xác nhận là LAB ở nhà, direct test NOT RUN. |
| P1 hosting Vsmart | IN PROGRESS | Reboot/Termux lifecycle, đối chiếu WordPress và backup hiện hành. |
| P2 Panel/authority | IN PROGRESS | XZ3 Agent đọc cùng shared revision, local Panel 200; còn thiếu XZ3 Tunnel/Access và kiểm UI đăng nhập, browser Internet, reboot và CAS trên hai máy thật. |
| P3 manual Primary | IN PROGRESS source LAB; BLOCKED triển khai thực | Đồng bộ source, Cloudflare LAB riêng, restore/kích hoạt ứng viên, HTTP/DB origin proof, chặn mọi đường ghi node cũ, cutover/rollback hai Android. DNS verified/operator attest không phải writer lease. |
| P4 auto Primary | NOT STARTED runtime | Tái dùng pipeline P3 an toàn, verified snapshot, cooldown/rejoin/fencing và test partition. Cron Panel-only là cứu hộ quản trị, không bầu Primary. |
| P5 production migration | NOT STARTED | Chỉ sau LAB đạt và user duyệt riêng. M51/X7b không được chạm. |

Ưu tiên P0: thiết lập và chứng minh Tunnel/Access của XZ3; để F3216 LAB ở nhà ngoài thử nghiệm tại công ty. Ưu tiên P1: xử lý sshd runit XZ3 và lệch version hai LAB, xác nhận Cloudflare deployment và sửa test drift thành một checkpoint. Nhiệm vụ sau mới lập cửa sổ LAB có backup, cập nhật hai node/Worker theo pin, rồi hoàn thiện candidate activation, fencing, HTTP proof và chạy manual cutover/rollback website/DB LAB. **Lượt này chỉ kiểm tra read-only và cập nhật tài liệu.**
