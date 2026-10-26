# MHC Full Installer TEST 0.3.10 — Original Panel Integration (LAB)

Ngày: 25/10/2026

## Chuyển hướng quan trọng
- Dùng **Android Mini Hosting Panel gốc ở cổng 9090** làm giao diện quản trị chính; không thay nó bằng dashboard 19090.
- Giữ menu Tổng quan, Websites, File Manager, Databases, Dịch vụ/Logs, Backups, Domain/Nginx và tài khoản mật khẩu hiện tại.
- Bổ sung Modules PHP/Server (PHP, PHP-FPM, Nginx, MariaDB, Node.js, WP-CLI, phiên bản, extensions, runit) và Cluster (metadata quan sát có nhãn rõ) vào menu 9090.
- Sửa chữ Samsung M51 cố định trên Panel gốc. Android model lấy qua `getprop` khi có thể.
- Endpoints thêm: GET `/api/mhc/modules`, GET `/api/mhc/cluster`. Bắt buộc đăng nhập qua cookie của Panel 9090, hoàn toàn chỉ đọc. Không trả secret, private keys, SQL dumps hoặc quyền HA.
- Bổ sung lệnh `~/mhc-full hosting-panel plan|apply|rollback ROLLBACK_ID` cho TEST LAB. Lệnh apply tạo bản sao bảo toàn 4 file gốc + trạng thái module mới, KHÔNG copy admin.json/data. Cần tự restart `amh-panel` sau khi kiểm tra.
- Bộ cài sạch gồm cùng Panel gốc đã mở rộng; mã Cluster/backup khác giữ nguyên.
- Giữ Panel 19090 trong bản TEST để tương thích các tác vụ thử nghiệm chưa chuyển; **không** phải một bảng điều khiển thay thế mới. Không bỏ chức năng/port trong upgrade này.

## Giới hạn
- Cluster 9090 mới chỉ đọc trạng thái; không ghép node/clone hoặc điều khiển writer từ UI này.
- PHP/WordPress mới hiển thị binary, phiên bản và service. Chưa có quản lý database WordPress bằng GUI hoàn chỉnh hoặc nghiệm thu WordPress thực tế.
- HA, GTID và file replication chưa nghiệm thu. Bản LAB chưa được phép chạy trên M51/X7b production.
