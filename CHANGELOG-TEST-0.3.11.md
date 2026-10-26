# MHC Full Installer TEST 0.3.11 — Original Panel Integration Phase 2

## Cơ sở
Phát triển trực tiếp từ TEST 0.3.10. Giữ nguyên **Hosting Panel gốc 9090** làm giao diện quản trị chính. Không thay thế bằng Panel 19090, không xóa/tạo lại trang quản trị đang chạy.

## Thay đổi
- Bổ sung màn hình **Monitor** trên Panel 9090: CPU (khi có dữ liệu đo), số lõi, RAM còn trống/tổng, phần trăm pin, nhiệt độ **pin** và uptime. Làm mới khoảng 15 giây khi trang đang mở. Termux:API không phản hồi thì trả trạng thái không khả dụng; không nhầm nhiệt độ pin với CPU.
- Sửa nhãn PIN M51 thành PIN ĐIỆN THOẠI trên tổng quan; không gắn cứng tên máy.
- Trang **Websites** hiển thị cả website Panel gốc và **registries MHC LAB** (static / WordPress), nhãn rõ "chưa kiểm tra HTTP/DB".
- Trang **Backups** giữ nguyên công cụ backup Thờ Phượng Pro của Panel gốc, bổ sung bảng snapshot MHC hàng ngày. Phân biệt có manifest với checksum thực tế được verify (chưa thực hiện bởi API này). Bỏ nhãn lịch "trên M51".
- API mới (sau cookie session 9090): GET `/api/mhc/monitor`, `/api/mhc/sites`, `/api/mhc/backups` cùng APIs modules/cluster cũ. Chỉ trả allowlist, không đọc `.env`/nội dung SQL/SSH credentials/token, không lộ đường dẫn snapshot.
- Đồng nhất dấu phiên bản 0.3.11 cho installer, heartbeat, clone, node readiness và các bài test. Vẫn cho phép upgrade từ TEST 0.3.10.

## Không thay đổi
- `sv`, nginx, MariaDB, PHP-FPM, Panel 9090 runtime đang chạy cho đến khi quản trị viên chủ động `sv restart amh-panel`.
- Website `demo`/WordPress, dữ liệu, tên miền Cloudflare, SSH, tunnel, lease, fencing, HA.
- Panel 19090 vẫn được giữ cho chức năng LAB chưa chuyển sang 9090.

## Hạng mục còn thiếu
- WordPress thực tế trên Termux: WP-CLI, cài WordPress, đăng nhập/media/permalinks, PHP-FPM HTTP, DB backup/restore đến site hoàn chỉnh.
- Monitor có lịch sử dài hạn, kiểm nhiệt độ CPU (nếu Android hỗ trợ), cảnh báo và đẩy monitor online.
- Kiểm checksum/restore snapshot tự động từ Panel, gia nhập node/clone bằng GUI có kiểm soát; chưa thêm để tránh mở rộng bề mặt ghi khi HA chưa nghiệm thu.
- MariaDB GTID + file delta, single-writer/fencing ở lớp write ingress, production switchover/failover.
