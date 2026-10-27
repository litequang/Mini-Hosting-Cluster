# P3 — chung một Primary/Panel; đường khôi phục Panel độc lập (LAB)

## Tình trạng 27-10-2026
- **Source có, chưa triển khai/nhiệm thu Cloudflare hoặc điện thoại thật trong cuộc trao đổi này.** M51 và X7b không bị sửa.
- Mỗi node chạy **Panel gốc 9090** + Cluster Agent. Thường thì `panel.giaouoc.com` phục vụ từ node mà quản trị viên đã chọn làm Primary cùng với website.
- Nếu node đang phục vụ Panel offline, Worker Cron mỗi phút yêu cầu Durable Object xét điều kiện khôi phục; **Panel CNAME בלבד** được điều hướng sang node Standby còn khỏe. Worker/DO tiếp tục hoạt động độc lập điện thoại. Website, DB, quyền ghi và declaredPrimary **KHÔNG** thay đổi.
- Chuyển Primary thủ công đã có quy trình Panel ứng viên → operator LAB xác nhận site/backup/fencing thủ công → đổi DNS site trước, Panel sau → xác nhận HTTP → ghi nhận Primary LAB. Khi Panel đã khôi phục sang Standby, adapter chấp nhận trạng thái Panel CNAME mới và vẫn có thể chuyển cả site + Panel sang ứng viên khác.
- **P3 production chưa hoàn thành**: chưa có độc lập fencing toàn bộ đường ghi; không có executor có quyền dừng/khởi động toàn bộ service web/DB ở các node; chưa có signed HTTP identity end-to-end; DNS API GET đúng không chứng minh origin Panel/website thực sự truy cập được; Cloudflare Access và hai điện thoại chưa được thử khi mất mạng. Chưa có writer lease. Không triển khai trên `pro.thophuong.com` hoặc web thật.

## Cấu hình Cloudflare khi triển khai LAB

1. Dùng **Worker đã có** `mhc-cluster-authority-lab` và Durable Object cluster UUID **đang sử dụng**, không tạo cluster mới. Source tại `reference/cluster-authority/`, deploy bằng `npx wrangler@4 deploy --config wrangler.toml` tại chính thư mục đó. `wrangler.toml` khai báo Cron `* * * * *` nhưng không đổi DNS nếu chưa bật tính năng.
2. Với **từng node**, thiết lập named Cloudflare Tunnel riêng, route **cùng hostname bảo vệ** `panel.giaouoc.com` tới localhost Panel 9090 của node đó. Bật verify Access JWT ở mỗi origin với **cùng issuer và Audience/AUD**, cấu hình Cloudflare Access email admin. Kiểm chứng Panel trực tiếp qua node trước khi thay DNS. Cloudflare Tunnel chỉ định đúng account/UUID, connector đang chạy; không dùng một Tunnel có nhiều connector làm Primary router ngẫu nhiên.
3. Chỉ tạo allowlist **record CNAME LAB**: `MHC_P3_ROUTES_JSON` mỗi item có zoneId/recordId/hostname/kind/site hoặc panel/nodeTargets theo node UUID → `TUNNEL_UUID.cfargotunnel.com`. Phải có **đúng một** record kind=panel để kích hoạt phục hồi. Mỗi record là DNS CNAME proxied đã có, không tự động tạo subdomain. Ràng buộc domain và token quyền tối thiểu, không đưa token ra Panel/Termux/Git.
4. Đặt các Worker secret `MHC_P3_LAB_ENABLED=OPERATOR_ASSISTED_DNS_ONLY`, `MHC_P3_INITIAL_PRIMARY_NODE_ID` đúng incumbent LAB, `MHC_P3_CF_TOKEN` với **DNS Edit chỉ zone thử nghiệm**, `MHC_P3_ROUTES_JSON`, và **chỉ sau khi kiểm thử cấu hình** bật `MHC_P3_PANEL_RECOVERY_ENABLED=LAB_PANEL_ONLY`. Dùng `npx wrangler@4 secret put <NAME>` trong môi trường đã xác thực; không gửi secret vào chat.
5. Khi node đang phục vụ Panel mất heartbeat > 5 phút và đã từng được quan sát trong 30 ngày, Standby có heartbeat lẫn Monitor mới trong 90 giây và cả `amh-panel`, `mhc-panel-tunnel` ở trạng thái `running`, hệ thống chọn Standby có heartbeat mới nhất, tên node để hòa nếu đồng hạng. Có pending Primary thì **không** tự đổi Panel (tránh cạnh tranh).
6. Durable Object journal `DNS_REQUESTED` trước thay DNS; kiểm tra record CNAME/zone/hostname/type/proxied/target theo allowlist, chỉ PATCH khi khác. Nếu lỗi giữa chừng giữ journal, không giả thành công; tự thử lại sau 90 giây nếu target còn khỏe. Khi DNS API xác minh xong đổi thành `DNS_SWITCHED_RECOVERY` và giữ trạng thái, **không tự failback** khi node cũ online.
7. Cluster UI hiển thị trạng thái route Panel dự phòng và phân biệt với Primary LAB. **Không tự cấp writer lease** và không reset DB.
8. LAB test tối thiểu: xác nhận cả hai Panel có Access JWT, Worker deploy/cron, 2 agent Monitor v2, 2 Tunnel riêng; ngắt Tunnel/Agent incumbent đủ điều kiện, thử từ mạng ngoài `panel.giaouoc.com`, đảm bảo site CNAME không đổi, quyền DB trên standby không mở, node cũ online lại không giành Panel, sau đó manual route site+Panel theo P3. Kiểm tra cả retry khi Cloudflare API timeout, status Worker và journal.

## Tắt và cứu hộ
- Để tắt **lần kiểm tra tự động**: đặt `MHC_P3_PANEL_RECOVERY_ENABLED` khác `LAB_PANEL_ONLY` hoặc bỏ secret, deploy cấu hình Worker phù hợp. Việc tắt **không tự hoàn nguyên CNAME** từng được chuyển.
- Nếu DNS thực tế ngoài allowlist/đích dự kiến, adapter từ chối và yêu cầu kiểm tra thủ công; đừng xóa journal hoặc ép DNS khác khi đang có website ghi dữ liệu.
- Nếu Panel chung chưa truy cập: dùng SSH forward tới `http://127.0.0.1:9090` trên một node sống, đăng nhập Panel local bằng mật khẩu khôi phục. Đây là tuyến cứu hộ cuối cùng khi Cloudflare không hoạt động.
- Giữ phiên recovery trên Worker cho tới khi manual Primary complete, lúc đó journal recovery cũ được giữ trong `lastPanelRecovery`.

## Giới hạn an toàn
Không coi nhãn `declaredPrimary`, `DNS_SWITCHED_RECOVERY` hay Panel phản hồi HTTP là bằng chứng node đủ quyền ghi. Nếu Primary offline chỉ do mất kết nối mạng, writer trên node cũ có thể vẫn chạy. Cần write gate/fencing theo epoch độc lập cho mọi đường ghi trước khi bật tự bầu P4 hoặc quảng bá P3 production.
