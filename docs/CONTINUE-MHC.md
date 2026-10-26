# Tiếp tục sau gián đoạn — 26/10/2026

## Nguồn đang làm

- Remote được người dùng cung cấp: `https://github.com/litequang/Mini-Hosting-Cluster.git` (trống khi tiếp quản).
- Branch đang làm: `codex/m1-m2-foundation`. Người dùng đã yêu cầu chủ động commit/push checkpoint.
- Checkout Git local: `E:\CODE\MHC\MHC\.work\repository`; cây làm việc đang chỉnh ở `E:\CODE\MHC\MHC`, cần đối chiếu trước khi copy vào checkout. Không reset/giải nén đè.
- Baseline Git `af8666e`: import source REMOTE-PANEL bàn giao, không phải lịch sử cũ.
- Bản trước sửa local: `.work/before-m1-m2.zip` (không đưa vào Git).

## Thiết bị / quyền

- Vsmart LAB hiện tại: `u0_a180@192.168.1.4:8022`. Host key đã được SSH tin cậy; StrictHostKeyChecking=yes.
- Người dùng thiết lập key riêng tại `%USERPROFILE%\.ssh\id_ed25519_mhc_lab`; không đọc/commit khóa.
- Người dùng xác nhận dữ liệu demo có thể xóa/bỏ qua, nhưng hiện chưa cần xóa.
- Không sửa M51/X7b hoặc Cloudflare production. Account Cloudflare do user thiết lập.

## Checkpoint đang thực hiện (chưa nghiệm thu)

- Sửa SVDIR cho SSH không tương tác; guard giữ named-tunnel, thử dừng mọi writer dù một service lỗi.
- M2 source: Worker/DO có membership, auth agent/Panel riêng, revision/epoch, heartbeat sequence, journal begin/abort idempotent; client + Panel bridge. Chỉ PREPARE, không writer activation/route/commit Primary.
- PASS mới trên Windows: service-environment, guard-management, cluster-authority (storage fixture), termux-compat.
- FAIL môi trường: manual-primary trên Windows (quyền POSIX); không hạ kiểm quyền để làm test qua.
- Vsmart thực: aarch64, Node v26.12.1, marker TEST 0.4.0B3, Panel HTTP 9090=200; nginx/PHP/MariaDB chạy qua runit đường dẫn đầy đủ.
- `~/mhc-full serve status` cũ báo sai do thiếu SVDIR. Probe demo chưa đạt do hostname đoán `localhost` không đúng; cần lấy hostname từ cấu hình Nginx của demo.
- Full self-test đang chạy từ source riêng, log `~/mhc-lab-runs/m1-m2-20261026/self-test.log`; chưa coi PASS toàn bộ.
- Source archive đầu tiên SHA256 `724b7c13b4736a9bfd02e39444ac02f292f0c091c078d7e8ef7d25edb0a4cd02`.

## Việc tiếp theo

1. Đọc AGENTS và HANDOFF; kiểm Git status/log. Xác nhận source nào mới nhất.
2. Đọc phần cuối self-test log trên Vsmart; xử lý lỗi, chạy lại đúng nhóm ảnh hưởng.
3. Hoàn tất test Panel chung, cấu hình/runbook authority và giới hạn M2. Chưa deploy Cloudflare.
4. Backup source/config/Panel/DB trên Vsmart vào vùng riêng 0700; không tải secrets/dump vào repo hoặc chat.
5. Nâng source-only khi self-test đạt, kiểm Panel apply/rollback và password giữ nguyên; HTTP demo/PHP/DB, backup/restore vùng riêng.
6. Cập nhật báo cáo PASS/FAIL/NOT RUN và file này, commit/push. M3/M4/hai Android/reboot/Cloudflare thật chưa nghiệm thu.

Không ghi lại mật khẩu đã được cung cấp trong chat. Dùng key SSH hiện có.
