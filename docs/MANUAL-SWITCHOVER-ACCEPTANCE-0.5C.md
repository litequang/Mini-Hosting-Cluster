# v0.5C — Manual Switchover: nghiệm thu bắt buộc (LAB-only RC)

## Mức hoàn thành
Đã triển khai trình kiểm tra readiness (read-only), quy trình mô phỏng chuyển vai trò v0.5A, write gate HTTP fixture và endpoint MariaDB **riêng cho LAB**. **CHƯA phát triển executor chuyển Primary thật**. Không gọi Cloudflare routing, SQL CHANGE MASTER hay chuyển read_only.

## Các điều kiện cần chứng minh trước khi làm executor
1. Hai node Android riêng biệt, không có website production, không kết nối tài khoản Cloudflare đang phục vụ.
2. MariaDB source/replica LAB GTID với hai giao dịch khác nhau; giao dịch thứ hai tạo trong lúc ngắt mạng; sau nối lại đối chiếu dữ liệu và tọa độ GTID.
3. Delta Sheet/uploads kiểm SHA-256, phục hồi seed, thử lỗi xóa/đổi file và rollback ngoại tuyến.
4. Fence cứng node cũ bằng biện pháp độc lập và xác minh không thể ghi qua TCP/Unix socket, PHP, cron và SSH; token/epoch witness không thể thay thế việc fence node cũ.
5. Witness Cloudflare Durable Object được triển khai trên vùng thử riêng; thử TTL hết, mạng phân vùng, 2 requests tranh lease; sự kiện lease chứng thực không chỉ từ đánh dấu thủ công.
6. Không có lối bypass đối với quản trị DB, uploads, filesystem, PHP, cron, tasks, root shell và backup/restore; nếu chưa chứng minh được, STOP.
7. Chuyển ingress trên test hostname riêng và kiểm sau chuyển; rollback cẩn trọng, không tái kích hoạt writer cũ nếu chưa fence writer mới.

## Các lệnh an toàn hiện tại
`~/mhc-full switchover-readiness plan` — chỉ đánh giá điều kiện, không thay đổi server.
`~/mhc-full switchover sample|plan|status` — diễn tập offline theo bằng chứng do người vận hành cung cấp.
`~/mhc-full app-db-gate plan` — mô tả endpoint MariaDB LAB; không tạo schema.

**Không đưa công cụ LAB ra mạng công cộng hoặc nối nó với database WordPress/Thờ Phượng Pro.**
