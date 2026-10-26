# MHC Full Installer TEST 0.5.0C-ROUTE-RECOVERY

## Mục tiêu
Tiếp tục Manual + Auto Primary bằng **khả năng phục hồi sau lỗi đổi Cloudflare CNAME** và **tác nhân hạ dịch vụ của node cũ khi quay lại**. Không yêu cầu GTID cùng trạng thái trước khi bầu chọn; bản snapshot mới nhất chỉ được xem là gợi ý về độ mới, không phải bằng chứng không mất dữ liệu.

## Thay đổi chính
1. **Durable route journal:** ghi `route-pending.json` quyền 0600 *trước* khi gọi Cloudflare. Khi mạng/controller mất giữa PATCH và ghi trạng thái, lần `tick` kế tiếp đối chiếu live CNAME với Tunnel cũ/đích đã chọn, khôi phục đúng phiên chuyển hoặc từ chối nếu có đích thứ ba. Không bầu ứng viên khác trong lúc phiên cũ chưa xử lý.
2. **Tránh tự bầu controller:** node điều phối không thể trở thành node phục vụ khi Primary offline.
3. **Node rejoin:** không cho cách ly nhầm Primary hiện tại. Node cũ bị loại khỏi bầu chọn sau chuyển tuyến thành công. Lựa chọn Primary thủ công sau backup/restore có xác nhận được phép gỡ chính node đích khỏi danh sách cách ly.
4. **Read-only role RPC:** node đã join hỏi vai trò qua SSH host key đã ghim, credentials enrollment, nonce; response có cluster/node/controller ID, không cấp write lease. Hỗ trợ forced-command `~/mhc-full node role-accept`.
5. **Node Role Guard:** trên Android LAB đã join, người quản trị ARM các service đã lựa chọn. `check` và `watch` hỏi controller: nếu standby/unverified/mất kết nối thì `sv down` các service đó; không bao giờ `sv up` tự động. Có thể cài runit watcher sau xác nhận riêng.
6. **Panel 9090:** hiển thị route pending cần phục hồi và trạng thái Node Role Guard tại máy đang xem, chỉ đọc, không hiển thị token/SSH server.
7. **Installer:** version marker mới, nâng cấp source-only có rollback mã; giữ nguyên DB, website, dịch vụ, Tunnel mặc định.

## Giới hạn không thể bỏ qua
- Controller chỉ là nguồn phân vai trò theo bản ghi, **không phải witness cấp lease độc lập**.
- `sv down` chỉ cố dừng những unit được ARM khi watchdog còn chạy và kết nối được controller. Người dùng có quyền cao hoặc DB writer không nằm trong danh sách vẫn có thể ghi.
- Auto-route chỉ hoạt động khi người quản trị opt-in BEST_EFFORT_ROUTE và cấu hình Cloudflare token/targets; **tắt mặc định**.
- Không có nghiệm thu Cloudflare thật, 2 Android thật, crash/power-loss filesystem, hay bảo đảm chống split-brain.
- M51/X7b production tuyệt đối không phải mục tiêu TEST. Vsmart có website demo chỉ nâng cấp source, không ARM node guard.
