# MHC Hosting Panel — roadmap quản trị website cá nhân

> Quyết định người dùng 28/10/2026. Tài liệu này là **định hướng ưu tiên tương lai**, không phải giao việc ngay. Trạng thái thực tế, commit đang chạy, PASS/FAIL/NOT RUN luôn xem [LIVE-PROGRESS.md](LIVE-PROGRESS.md).

## Mục tiêu sản phẩm

- MHC để **quản lý website của chính mình**, chưa kinh doanh hosting. Làm giao diện tương tự cPanel cho self-hosting, **không** cài cPanel/WHM chính hãng hoặc xây reseller, billing, multi-tenant hosting, email server tự host.
- Nâng cấp **original Panel 9090** đang chạy trên mọi node, giữ nguyên Cluster/Monitor/SSO/Cloudflare Access/CSRF và khả năng quản trị từ một hostname. **Không tạo Panel mới song song**.
- Đích vận hành quan trọng nhất: **website vẫn có khả năng phục vụ khi Primary gặp sự cố**. Việc tự khôi phục trang quản trị chỉ là tính năng hỗ trợ; website online mới là kết quả chính.
- Quản lý site/file/DB qua node được cấp quyền; Control/Panel đang online **không** có nghĩa website hoặc database có writer lease. Không đủ chứng cứ authority/epoch/lease/fencing thì mọi thao tác ghi phải fail-closed và hiển thị lý do.
- Giữ dữ liệu, quyền truy cập, lịch sử backup, installer/rollback và cấu hình hiện tại. Phát triển/kiểm thử trên Vsmart + XZ3 LAB; không tác động M51/X7b/production nếu chưa được phép riêng.

## Phân biệt Control recovery, Manual và Auto Primary

- **P3.2 Panel/Control recovery (LAB ĐÃ NGHIỆM THU):** Chuyển riêng đường truy cập quản trị sang node còn sống. Không khôi phục web/DB, không cấp writer. Giữ nguyên như khả năng phụ; không mở thêm phase riêng để xây lại.
- **P3.3 Manual Primary + Control (CODEX ĐANG LÀM):** Người quản trị chọn node chạy site; xác minh website/node/data readiness, epoch, writer lease, quiesce/fencing các writer thuộc phạm vi MHC, signed public HTTP proof, chuyển route, retry/journal và old-node rejoin Standby. Dùng dữ liệu đã có trên node đích, KHÔNG bắt buộc đồng bộ 100%, GTID hay replication liên tục. Hiển thị RPO/data-stale rõ ràng, không tự xóa/ghi đè DB.
- **P4 Lite Auto Primary + Control (LÀM NGAY SAU khi P3.3 LAB PASS):** Tái dùng **đúng pipeline Manual** để website MHC-managed WordPress LAB tiếp tục phục vụ khi node chính mất mạng. Shared Authority/DO làm trọng tài; lấy tín hiệu heartbeat + chủ động HTTP site/Tunnel check, chọn node đủ dữ liệu, kiểm lease cũ hết hiệu lực và gate ghi không thể tiếp tục nhận ghi, rồi CAS/epoch → activation → route web/Panel → HTTPS/proof xác thực. Rejoin luôn Standby/quarantine và **không auto failback**. Auto chỉ là opt-in sau live fault test; không mở production.
- **Ranh giới tối giản nhưng bắt buộc:** Máy mất Internet vẫn có thể chạy PHP/SQL/cron nội bộ. Không suy ra old writer đã ngừng chỉ vì offline/heartbeat mất. Ghi từ website MHC-managed phải bị chặn khi lease mất/hết hạn hoặc authority không xác thực được: cả HTTP/PHP/app DB session/job liên quan, gồm xử lý connection tồn tại; boot/reconnect phải kiểm epoch trước khi bật. Chỉ cấp lease mới sau khi đã đủ bằng chứng về gate + hạn lease cũ, có safety margin kiểm clock/partition. Root/shell/privileged SQL hoặc app ngoài MHC không nằm trong guarantee; nếu site có đường ghi ngoài phạm vi MHC mà chưa được kiểm soát thì **không tự promote site đó**. Authority unreachable thì fail-closed, không tự tách cụm.
- **MVP không hứa zero downtime:** Node dự phòng phải có dataset/DB hoạt động được từ trước, không cần bytes giống Primary; nếu thiếu dữ liệu hoặc restore chưa kiểm, giữ pending và thông báo, không tự dựng dữ liệu từ snapshot chưa xác minh. Dữ liệu mới nhất có thể mất; không tự đồng bộ/merge/overwrite DB.

## Timeline mới nhất — quyết định 28/10/2026 (thay thế lịch HP trước Auto)

| Thứ tự | Mốc | Kết quả cần đạt |
|---|---|---|
| **1 — đang chạy, KHÔNG GIÁN ĐOẠN** | **P3.3 — Manual Primary + Control** | Hoàn tất LAB hai chiều website WordPress có quyền ghi thực, scoped lease/gates/public proof; giữ website/Control gốc và M51/X7b nguyên vẹn. Tài liệu này không yêu cầu hủy hoặc làm lại code đang chạy. |
| **2 — ưu tiên kế tiếp** | **P4 Lite — Auto Primary + Control cho site MHC-managed** | Sau P3.3 PASS, thử controlled failure Vsmart → tự promote XZ3 cho website LAB đã có data, Internet proof, quiesce/gate/lease, restart/rejoin old node chỉ Standby, không failback. Thử ngược XZ3 → Vsmart. Panel-only recovery không được tính là website failover. |
| **3** | **HP1 — Hosting Panel Core** | Nâng original Panel 9090: Website Manager Static/React/Node.js/PHP/WordPress; File Manager Pro; MariaDB DB/users/tables/import/export; PHP/Nginx config; WordPress Toolkit, responsive mobile-first. |
| **4** | **HP2 — Domain & Automation** | Tích hợp mục tiêu P2.5: chọn Cloudflare zone/domain/subdomain khi tạo website, tự DNS/Tunnel ingress/HTTPS, kiểm HTTP, chống xung đột, rollback; token scoped ở control plane. |
| **5** | **HP3 — Backup & Advanced Tools** | Backup ZIP+SQL lịch trình và bản sao qua node, restore được xác minh, cron/logs, SQL editor có guard, staging WordPress khi cần. |
| **6 — chỉ sau duyệt riêng** | **P5 — migration production** | Di chuyển M51/X7b và website thật khi LAB an toàn, sau backup/duyệt. |

**Ưu tiên:** Chủ dự án đổi quyết định vì mục tiêu quan trọng nhất là **website tiếp tục phục vụ**. P4 Lite được đưa ngay sau Manual thay vì đợi sau HP3; không kéo thêm replication/GTID/quorum đa máy phức tạp vào MVP. Nhưng không bỏ writer safety gates của site do MHC quản lý. **Không tự ngắt Codex đang làm P3.3**, không tự chạy P4 trong cùng checkpoint nếu P3.3 chưa nghiệm thu Android thật.

**Gap cần Codex ghi rõ khi hoàn tất P3.3:** Runbook manual hiện yêu cầu cả hai node online để quiesce. Để tiếp quản node offline ở P4 Lite, phải bổ sung/kiểm chứng **self-fencing khi mất Authority hoặc lease hết hạn**, và quy trình manual offline takeover có chặn ghi cũ trong phạm vi site quản lý. Không thể đơn thuần bỏ điều kiện quiesce-old từ mã nguồn để chuyển cho nhanh. Làm tiếp mục tiêu này khi P3.3 đạt mốc, không suy đoán P3.3 hiện đã xử lý offline takeover.

## Không làm trong phạm vi self-hosting giai đoạn này

- Reseller/WHM, nhiều tenant thương mại, billing, package limits theo khách, mail server IMAP/SMTP trên điện thoại, FTP công khai.
- Không dùng việc cài đơn thuần nginx/php/mysql hoặc sửa DNS là bằng chứng failover thành công. Không mở MySQL/SSH/Panel LAN ra Internet công khai; giữ Access, SFTP qua SSH và secret trong vùng an toàn.
- Không viết lại MHC Cluster/P3.3; dùng cùng original Panel và kiến trúc Authority. Chỉ bắt đầu P4 Lite khi P3.3 đã đạt nghiệm thu LAB và có nhiệm vụ tiếp theo; HP1 sau P4 Lite. Không ngắt P3.3 đang chạy.

## Definition of Done cho từng HP

Source từ commit rõ ràng + test trên Windows/Android fixture + nghiệm thu Vsmart/XZ3 thật, login/CSRF/security, API lỗi fail-closed, giữ nguyên website cũ + rollback, cập nhật CODEMAP/ARCHITECTURE/DECISIONS/TROUBLESHOOTING/LIVE-PROGRESS. Chỉ đánh dấu DONE sau khi kiểm khả năng thao tác trình duyệt thật và backup có thể khôi phục, không dựa trên mock hoặc code presence.
