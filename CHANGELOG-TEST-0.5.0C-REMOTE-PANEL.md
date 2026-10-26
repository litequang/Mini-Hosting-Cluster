# TEST 0.5.0C-REMOTE-PANEL

- Thêm `remote-panel plan|status|configure|disable` để cấu hình hostname controller (không gọi API Cloudflare).
- Bổ sung server-side Cloudflare Access JWT signature verification dùng RSA-SHA256 JWKS, kiểm issuer/audience/expiry, fail-closed khi remote Host chưa được chứng thực.
- Không còn tin cậy hostname `panel.thophuong.com` hardcoded chỉ dựa trên Origin; hostname HTTPS mới phải cấu hình chính thức qua CLI, không có config thì remote bị chặn.
- Giữ nguyên localhost 9090/SSH forwarding và mật khẩu Panel + CSRF; cookie `Secure` khi dùng hostname HTTPS được xác thực.
- Tích hợp thông tin kết nối remote trong mục Cluster của Panel gốc 9090. Không tạo Panel thứ hai.
- Cơ chế nâng cấp/rollback Panel gốc có sao lưu thêm helper JWT.
- Không tự thay đổi Cloudflare, database, route Primary hoặc HA.
- Hỗ trợ marker nâng cấp version mới tại installer, enrollment, clone, readiness và guard.

**Chưa nghiệm thu:** Cloudflare Access/Tunnel thật, remote login qua Internet thật, Manual/Auto Primary thực trên hai Android. Các test RSA JWT sử dụng JWKS giả lập cục bộ.
