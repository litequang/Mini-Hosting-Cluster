# MHC Hosting Panel — roadmap quản trị website cá nhân

> Quyết định người dùng 28/10/2026. Tài liệu này là **định hướng ưu tiên tương lai**, không phải giao việc ngay. Trạng thái thực tế, commit đang chạy, PASS/FAIL/NOT RUN luôn xem [LIVE-PROGRESS.md](LIVE-PROGRESS.md).

## Mục tiêu sản phẩm

- MHC để **quản lý website của chính mình**, chưa kinh doanh hosting. Làm giao diện tương tự cPanel cho self-hosting, **không** cài cPanel/WHM chính hãng hoặc xây reseller, billing, multi-tenant hosting, email server tự host.
- Nâng cấp **original Panel 9090** đang chạy trên mọi node, giữ nguyên Cluster/Monitor/SSO/Cloudflare Access/CSRF và khả năng quản trị từ một hostname. **Không tạo Panel mới song song**.
- Đích vận hành quan trọng nhất: **website vẫn có khả năng phục vụ khi Primary gặp sự cố**. Việc tự khôi phục trang quản trị chỉ là tính năng hỗ trợ; website online mới là kết quả chính.
- Quản lý site/file/DB qua node được cấp quyền; Control/Panel đang online **không** có nghĩa website hoặc database có writer lease. Không đủ chứng cứ authority/epoch/lease/fencing thì mọi thao tác ghi phải fail-closed và hiển thị lý do.
- Giữ dữ liệu, quyền truy cập, lịch sử backup, installer/rollback và cấu hình hiện tại. Phát triển/kiểm thử trên Vsmart + XZ3 LAB; không tác động M51/X7b/production nếu chưa được phép riêng.

## Phân biệt Control recovery và Auto Primary

- **P3.2 tự phục hồi đường Panel/Control:** Authority đổi riêng tuyến Panel sang node quản trị dự phòng khi node trước không truy cập được. Admin vẫn vào được Panel để xem và **chủ động** xử lý. **Website/DB có thể vẫn ngừng**, không cấp writer lease, không auto failback. Chức năng này đã có nghiệm thu **LAB**, xem LIVE-PROGRESS. **Giữ nguyên, không dành thêm một phase phát triển riêng cho nó**.
- **P3.3 Manual Primary/Control (đang Codex triển khai):** Người dùng chủ động chọn node phục vụ website và Control. Phải có giới hạn MHC-managed site rõ, quản lý activation/quiesce/fencing, writer lease theo epoch, origin proof, rollback theo trạng thái dữ liệu, quarantine node cũ. Không khẳng định fencing toàn Android/root/shell ngoài phạm vi quản lý.
- **P4 Auto Primary/Control (để sau):** Khi site Primary mất khả năng phục vụ, hệ thống tự chọn node có dữ liệu phù hợp và sức khỏe tốt, fencing chống hai writer, activate site/DB, chuyển tuyến web+Panel, kiểm chứng HTTP và không auto failback. Đây là phần **thực sự duy trì khả năng phục vụ website**, phức tạp hơn rõ rệt so với chỉ đổi Panel; phải báo RPO và rủi ro mất dữ liệu snapshot. Nếu chưa kiểm chứng được đường ghi cũ đã bị loại trừ, **không auto promote**.

## Timeline đã thống nhất — Codex bám theo

| Thứ tự | Mốc | Kết quả cần đạt |
|---|---|---|
| **1 — đang làm** | **P3.3 Manual Primary + Control** | Chuyển chủ động giữa Vsmart/XZ3 với website WordPress LAB có writer gate theo phạm vi MHC, kiểm hai chiều, Signed Proof, route, lease, rollback/rejoin; không ngụy nhận production-ready. **Không ngắt ngang phần Codex đang làm.** |
| **2** | **HP1 — Hosting Panel Core** | Website Manager: Static/React/Node.js/PHP/WordPress, ZIP/Git deploy; File Manager Pro: upload/download/ZIP/chỉnh sửa trong website root; Database Manager: MariaDB DB/users/tables/import/export; PHP/Nginx config theo site; WordPress Toolkit cơ bản; UI responsive/mobile-first. |
| **3** | **HP2 — Domain & Automation** | Tích hợp mục tiêu P2.5: khi thêm website chọn Cloudflare zone/domain/subdomain, tự cấu hình DNS/Tunnel ingress/HTTPS; kiểm truy cập thật, xử lý xung đột, rollback. Token scoped riêng trong control plane; không truyền tới mọi node. |
| **4** | **HP3 — Backup & Advanced Tools** | Backup ZIP+SQL theo lịch, xác minh restore, tùy chọn bản sao node khác, cron, logs, SQL editor có guard, Git deployment nâng cao, staging WordPress nếu cần. |
| **5 — hoãn sau HP3** | **P4 — Auto Primary/Control để duy trì website** | Dùng lại pipeline manual đã nghiệm thu; health+active web probes, snapshot đã xác minh, lựa node và cảnh báo RPO, witness/authority/lease/fencing, cooldown, rejoin standby, fault test; chỉ bật khi bảo đảm không có hai writer trong phạm vi quản lý. |
| **6 — duyệt riêng** | **P5 — migrate production** | Chỉ sau LAB đạt và người dùng duyệt backup/migration cụ thể cho M51, X7b và web thật. |

**Quy tắc ưu tiên:** Chủ dự án đã chọn hoãn P4 vì độ phức tạp để hoàn thiện HP1–HP3 trước. Điều đó **chấp nhận tạm thời** rằng khi Primary hiện tại offline, website vẫn cần chuyển thủ công; không được nói Panel recovery làm website không gián đoạn. Khi đổi quyết định ưu tiên uptime cao hơn tiện ích Panel, phải cập nhật lại roadmap theo yêu cầu mới.

## Không làm trong phạm vi self-hosting giai đoạn này

- Reseller/WHM, nhiều tenant thương mại, billing, package limits theo khách, mail server IMAP/SMTP trên điện thoại, FTP công khai.
- Không dùng việc cài đơn thuần nginx/php/mysql hoặc sửa DNS là bằng chứng failover thành công. Không mở MySQL/SSH/Panel LAN ra Internet công khai; giữ Access, SFTP qua SSH và secret trong vùng an toàn.
- Không viết lại MHC Cluster/P3.3; dùng cùng original Panel và kiến trúc Authority. Chỉ bắt đầu HP1 khi P3.3 có checkpoint và người dùng giao nhiệm vụ riêng.

## Definition of Done cho từng HP

Source từ commit rõ ràng + test trên Windows/Android fixture + nghiệm thu Vsmart/XZ3 thật, login/CSRF/security, API lỗi fail-closed, giữ nguyên website cũ + rollback, cập nhật CODEMAP/ARCHITECTURE/DECISIONS/TROUBLESHOOTING/LIVE-PROGRESS. Chỉ đánh dấu DONE sau khi kiểm khả năng thao tác trình duyệt thật và backup có thể khôi phục, không dựa trên mock hoặc code presence.
