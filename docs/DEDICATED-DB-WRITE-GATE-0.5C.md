# v0.5C — MariaDB dedicated application LAB endpoint

Đường HTTP `POST /v1/lab/mariadb-event` trên `127.0.0.1:19096`, JSON `{ "id":"32 lowercase hex", "value":"text" }`. Cùng bearer token riêng của HTTP LAB gateway. Khi được cấu hình đúng, hai lần xác minh witness trước khi gửi SQL INSERT giới hạn; DB option file không vào argv, đường dẫn DB là cố định. Không có SQL DDL tự động.

## Yêu cầu triển khai
- Chỉ trên node Android LAB xóa sạch, **không có website đã đăng ký**; không dùng Vsmart đang có `demo`, M51, X7b.
- Một MariaDB instance chuyên dụng có socket riêng tại `~/mhc-db-lab/run/mariadb.sock`. Không được symlink, không dùng socket DB chính.
- Trong instance LAB, quản trị viên tạo thủ công schema `mhc_lab_app` và bảng `write_events` gồm: `request_id BINARY(16) PRIMARY KEY`, `payload_sha256 BINARY(32) NOT NULL`, `value_bytes VARBINARY(2048) NOT NULL`. Tài khoản riêng `mhc_lab_writer` chỉ có quyền `INSERT` trên bảng đó, không được CREATE/GRANT/DELETE/UPDATE, không được quyền trên bảng khác; chỉ kết nối qua socket LAB.
- File `~/mhc-db-lab/client.cnf` quyền `0600`, thư mục `0700`, nội dung đúng bốn key của `[client]`: `user=mhc_lab_writer`, `password=<secret >=20 chars>`, `socket=<absolute path to dedicated socket>`, `protocol=socket`. Không dùng file trong repo.
- Cấu hình witness của B2 đã nghiệm thu với Cloudflare LAB, các file/lệnh test B3/B5 đã chuẩn bị.

## Giới hạn
Hai lần hỏi witness **không có tính nguyên tử với COMMIT MariaDB**. Một lease có thể hết hạn hoặc bị revoke sau lần kiểm tra thứ hai. Đây là một ứng dụng LAB cụ thể có gate, **không bảo vệ toàn bộ MariaDB** (shell/privileged account/cron vẫn có thể ghi). Bất kỳ lỗi DB/witness trả 503 chung, không trả SQL hoặc secret.
