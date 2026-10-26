# DECISIONS — quyết định đã thống nhất

1. **26/10/2026: Panel 9090 trên tất cả node** (thay controller chuyên dụng là Panel duy nhất). Mọi Panel quản trị chung cùng một cluster.
2. **Shared authority**: không cho mỗi node tự coi mình là Primary; dùng nguồn trạng thái bền vững/tuần tự (đề xuất Cloudflare DO), không đặt dependency sống trên Primary hiện tại.
3. **Manual Primary** từ Internet hoặc Panel bất kỳ là chức năng chính; người dùng chủ động backup/restore, chọn node và xem web sau chuyển.
4. **Auto Primary** khi offline: ưu tiên node khỏe, snapshot mới nhất đáng tin; node cũ khi online bị đưa về Standby/quarantine. Không tự failback.
5. **Dữ liệu không cần bằng nhau** trong MVP; hiển thị rủi ro mất dữ liệu (RPO). Tuy nhiên dữ liệu lệch không biện minh cho split-brain ghi đồng thời.
6. **Vsmart là LAB do Codex trực tiếp cài/test qua SSH**. Không yêu cầu user chạy tests mà Codex làm được. Vsmart từng có demo/DB, cần backup và xác nhận trước khi xóa.
7. **M51 + X7b production legacy**: chỉ chuyển về cùng source MHC **sau khi** Vsmart LAB đạt và user duyệt migration. Không sửa production mặc định.
8. **Chỉ original Hosting Panel 9090**, không viết dashboard mới thay thế. Panel phụ 19090 chỉ phục vụ tương thích LAB nếu cần.
9. **Cloudflare do user thao tác nếu Codex không có quyền**: Codex chuẩn bị cấu hình scripts và chỉ dẫn. Secret không gửi qua chat.
10. **Không tạo tràn lan phiên bản TEST nhỏ**. Lộ trình tối giản: Vsmart hosting ổn -> distributed panel -> manual switchover -> automatic failover LAB -> migration -> v1.
11. **Hostname riêng mỗi node là tùy chọn** để debug/recovery, không bắt buộc triển khai MVP.
12. **Không giả vờ hoàn thành**: test giả lập != end-to-end, backend lưu node role != fencing, đổi DNS != dừng writer.
