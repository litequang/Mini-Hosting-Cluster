# MHC Hosting Panel — roadmap quản trị website cá nhân

> **CẬP NHẬT ƯU TIÊN 29/10/2026 — TRÁNH SA ĐÀ KIẾN TRÚC:** P3.3 Manual LAB DONE → hoàn tất N1.3 đang chạy → **P4.0 Đồng bộ định kỳ Lite** → P4 Lite Auto Primary → **HP1 quản trị hosting thiết yếu** → HP2 Cloudflare một zone → HP3 chỉ việc thật sự cần. [Spec P4.0](PERIODIC-SNAPSHOT-SYNC-LITE.md). Không realtime replication, dựng control plane mới hay mở rộng HA N-way phức tạp; không làm P4.0 giữa checkpoint N1.3. Trạng thái PASS/NOT RUN thực tại [LIVE-PROGRESS.md](LIVE-PROGRESS.md).

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

## Timeline mới nhất — 28/10/2026 (bổ sung N1 trước Auto)

| Thứ tự | Mốc | Kết quả cần đạt |
|---|---|---|
| **1 — đang chạy, KHÔNG GIÁN ĐOẠN** | **P3.3 — Manual Primary + Control** | Hoàn tất LAB hai chiều website WordPress có quyền ghi thực, scoped lease/gates/public proof; giữ website/Control gốc và M51/X7b nguyên vẹn. Tài liệu này không yêu cầu hủy hoặc làm lại code đang chạy. |
| **2 — ưu tiên kế tiếp** | **N1 — Unified New Node Installer** | Dùng một bootstrap pinned để tạo node Android Termux mới, tự kiểm tra phần cứng và dịch vụ, ghép Shared Authority bằng mã, Panel/Agent/Monitor, mặc định Standby. Bỏ giới hạn Vsmart/XZ3 theo kiểu membership + trust/eligibility, không tự cấp writer. Chi tiết [UNIFIED-NEW-NODE-INSTALLER.md](UNIFIED-NEW-NODE-INSTALLER.md). |
| **3** | **P4.0 — Đồng bộ định kỳ Lite** | Tái sử dụng N1.3 snapshot/relay/restore, một site/Primary + một Standby LAB, lịch 60 phút mặc định hoặc Đồng bộ ngay, checksum/restore proof và RPO thực. **Không GTID/binlog/live replication**, không tự ghi đè site đích. [Chi tiết](PERIODIC-SNAPSHOT-SYNC-LITE.md). |
| **4** | **P4 Lite — Auto Primary + Control cho site MHC-managed** | Sau P3.3 PASS, thử controlled failure Vsmart → tự promote XZ3 cho website LAB đã có data, Internet proof, quiesce/gate/lease, restart/rejoin old node chỉ Standby, không failback. Thử ngược XZ3 → Vsmart. Panel-only recovery không được tính là website failover. |
| **5** | **HP1 — Hosting thiết yếu + Remote Operations Lite** | Chọn node/site, upload **dist.zip build sẵn** cho Node, upload file; restore website lần đầu bằng **ZIP + SQL + storage** với cấu hình Node/PHP/WordPress tối thiểu, backup và health/rollback, MariaDB import/export, restart riêng service. Dùng original Panel9090, không build source trên điện thoại mặc định hoặc phát triển IDE/file manager nâng cao. |
| **6** | **HP2 — Cloudflare publish Lite** | Bắt đầu **một zone giaouoc.com**, tạo một hostname/site theo lựa chọn, dùng Cloudflare Tunnel hiện có, DNS/HTTPS và HTTP probe/rollback; chỉ mở rộng nhiều zone sau khi thực sự cần. Không tạo hệ thống DNS/router mới song song. |
| **7** | **HP3 — Bảo trì nhẹ (sau MVP)** | Giữ backup/restore P4.0 và HP1; chỉ thêm retention/lịch sử backup/log/cron, cập nhật MHC có rollback, WordPress auto-update/WP-Cron bằng công cụ sẵn có khi cần. Hoãn SQL editor cao cấp, staging, multi-site orchestration, backup enterprise. |
| **8 — chỉ sau duyệt riêng** | **P5 — migration production** | Di chuyển M51/X7b và website thật khi LAB an toàn, sau backup/duyệt. |

**Ưu tiên:** Chủ dự án đổi quyết định vì mục tiêu quan trọng nhất là **website tiếp tục phục vụ**. N1 được đặt ngay sau Manual; P4.0 Lite được thực hiện sau N1.3, rồi đến P4 Lite, trước HP1 thay vì đợi sau HP3; không kéo thêm replication/GTID/quorum đa máy phức tạp vào MVP. Nhưng không bỏ writer safety gates của site do MHC quản lý. **Không tự ngắt Codex đang làm P3.3**, không tự chạy P4 trong cùng checkpoint nếu P3.3 chưa nghiệm thu Android thật.

**Gap cần Codex ghi rõ khi hoàn tất P3.3:** Runbook manual hiện yêu cầu cả hai node online để quiesce. Để tiếp quản node offline ở P4 Lite, phải bổ sung/kiểm chứng **self-fencing khi mất Authority hoặc lease hết hạn**, và quy trình manual offline takeover có chặn ghi cũ trong phạm vi site quản lý. Không thể đơn thuần bỏ điều kiện quiesce-old từ mã nguồn để chuyển cho nhanh. Làm tiếp mục tiêu này khi P3.3 đạt mốc, không suy đoán P3.3 hiện đã xử lý offline takeover.


## Bộ giới hạn MVP — tránh mở rộng không cần thiết

- **N1.3:** chỉ hoàn thiện backup→relay→restore WordPress LAB đã làm, kiểm Standby/eligibility và journal. Không thêm lịch định kỳ hay backup tổng quát trong cùng checkpoint.
- **P4.0:** một website và một node dự phòng trước, lịch mặc định mỗi60phút + Đồng bộ ngay; snapshot/SQL/uploads được apply & verify mới gọi đồng bộ. Không realtime GTID/binlog, CDC, filesystem watch, two-way merge, Raft hay đồng bộ 100%.
- **P4 Lite:** một website WordPress LAB, một cặp candidate đã được kiểm, sử dụng lại **Manual P3.3** và Authority. Chỉ auto khi self-fencing/lease/SQL/PHP/jobs bảo đảm không có hai managed writers; thiếu chứng cứ thì báo Blocked, không tự promote. Không xây scoring phức tạp hoặc hệ thống election nhiều tầng.
- **HP1:** ưu tiên upload **prebuilt dist.zip**, restart Node service, ZIP + SQL + storage restore lần đầu; WordPress qua các công cụ có sẵn. Không build source trên Android, không thiết kế editor mã nguồn/IDE hay cPanel bản sao.
- **HP2:** chỉ zone `giaouoc.com` ở giai đoạn đầu; dùng Tunnel/Authority hiện tại. Không mở reseller, bulk domain, email hosting, multi-tenant.
- **HP3:** không chặn website xuất bản. Backup định kỳ nền tảng đã ở P4.0, chỉ bổ sung bảo trì cơ bản khi có nhu cầu; WordPress tận dụng tự cập nhật của WordPress và WP-CLI thay vì viết updater khác.
- **M51/X7b:** giữ nguyên trong khi chuyển ZIP+SQL+storage và nghiệm thu site trên node mới; cài lại/ghép Cluster bằng N1 chỉ sau backup độc lập và user cho phép. Không phát triển Adopt Existing Node tổng quát.

**Tạm hoãn sau MVP (không chủ động nhận việc):** realtime replication/GTID/binlog, file sync hai chiều, tự merge DB, nâng cấp sản phẩm thành hosting thương mại, bộ chấm điểm thiết bị nhiều hệ số, backup cloud độc lập, WordPress staging tự động, hệ thống alert phức tạp, giao diện bảng điều khiển thứ hai. An toàn writer và backup/restore chứng thực không được cắt bỏ.

## Không làm trong phạm vi self-hosting giai đoạn này

- Reseller/WHM, nhiều tenant thương mại, billing, package limits theo khách, mail server IMAP/SMTP trên điện thoại, FTP công khai.
- Không dùng việc cài đơn thuần nginx/php/mysql hoặc sửa DNS là bằng chứng failover thành công. Không mở MySQL/SSH/Panel LAN ra Internet công khai; giữ Access, SFTP qua SSH và secret trong vùng an toàn.
- Không viết lại MHC Cluster/P3.3; dùng cùng original Panel và kiến trúc Authority. Đã nghiệm thu P3.3 Manual LAB; hoàn thành N1.3 đang làm, tiếp P4.0 scheduled snapshot Lite, rồi P4 Lite, HP1. Không ngắt current checkpoint hoặc mở rộng sang realtime replication. Không ngắt P3.3 đang chạy.

## Definition of Done cho từng HP

Source từ commit rõ ràng + test trên Windows/Android fixture + nghiệm thu Vsmart/XZ3 thật, login/CSRF/security, API lỗi fail-closed, giữ nguyên website cũ + rollback, cập nhật CODEMAP/ARCHITECTURE/DECISIONS/TROUBLESHOOTING/LIVE-PROGRESS. Chỉ đánh dấu DONE sau khi kiểm khả năng thao tác trình duyệt thật và backup có thể khôi phục, không dựa trên mock hoặc code presence.
