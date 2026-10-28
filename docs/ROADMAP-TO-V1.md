# Roadmap còn lại — rút gọn, không tạo phiên bản TEST liên tục

> Trạng thái thực thi hiện hành chỉ ở [LIVE-PROGRESS.md](LIVE-PROGRESS.md), gồm source đã cài, test Android thật, blocker và phần NOT RUN. Roadmap này giữ mục tiêu/Definition of Done; các mô tả lệch source và kế hoạch nâng cấp trong audit tiếp nhận là checkpoint lịch sử, không thay thế hậu kiểm mới.

## P0 — Audit & protect existing workspace (bắt đầu ngay)
- Đọc Git/AGENTS/docs, kiểm checkpoint vs `E:\CODE\MHC` thực tế; backup worktree và Vsmart trước.
- Kiểm installer marker, lỗi compatibility và lệnh ảnh hưởng dữ liệu; chạy test nền. Khắc phục lỗi P0 trực tiếp.
- Kết quả: báo cáo hiện trạng và danh sách thao tác an toàn.

## P1 — Vsmart single-node MHC hosting thật (Codex làm)
- Kết nối SSH có fingerprint ghim trước; inspect site demo và DB/Panel, snapshot full + khả năng restore.
- Tạo/cập nhật server mới trên Vsmart theo chiến lược **không phá dữ liệu** cho tới khi user xác nhận xóa demo nếu thật sự cần clean.
- Nginx/PHP-FPM/MariaDB, static + WordPress LAB, backup/restore ZIP/SQL, boot recovery, Panel 9090, RAM/pin/nhiệt/lưu trữ (Monitor không hiển thị CPU), logs đã lọc.
- Nghiệm thu: reboot, website HTTP, query DB, WP actions, Panel login, backup->restore test, tự chạy services, không hỏng SSH.

## P2 — Distributed Panel + Shared Cluster Authority (phần kiến trúc ưu tiên)
- Mỗi node cài Panel 9090 + node agent; node enrollment hoạt động từ Panel trên mọi node, role không lưu divergent local per-controller.
- Thiết kế API/Worker + Durable Object (hoặc một authority chung tương đương) with durable atomic revision/epoch, node membership, health, backups, manual request, election, route intent, audit; auth cho mỗi node và Panel.
- Panel remote via Tunnel/Access JWT + existing admin auth+CSRF; URL panel chung độc lập trạng thái website Primary. Không cần hostname từng node trong MVP.
- User xử lý tạo Access/Tunnel/Worker/domain nếu Codex không có quyền, Codex cung cấp `wrangler` source, hướng dẫn chính xác và test sau user deploy.
- Nghiệm thu: từ Panel ở 2 node thấy cùng dữ liệu, cập nhật không tạo hai Primary, mất một node vẫn dùng Panel node còn lại.

## P2.5 — Tạo website và subdomain Cloudflare tự động (bổ sung 26/10/2026)
- **Cài một lần** kết nối Cloudflare được ủy quyền, giới hạn đúng account/zone, dùng API token quyền tối thiểu (Zone Read, DNS Edit, Tunnel config Edit chỉ khi cần). Đặt token trong một dịch vụ điều khiển bí mật/Cloudflare Worker Secret có xác thực riêng, **không sao chép sang mọi node Termux, không lộ qua Panel/log/Git**. Quyền chia theo từng domain được phép, không tự nhận mọi zone trong tài khoản.
- **Mini Hosting > Thêm website**: tự lấy danh sách zone mà token được phép đọc; chọn domain trong dropdown, nhập subdomain, loại Static/React/Node.js/WordPress (WordPress chỉ bật khi workflow đã nghiệm thu), và node phục vụ. Cho phép chọn node được chỉ định trong LAB; production dùng Primary được xác minh. Hiển thị hostname trước khi tạo.
- Một lần bấm **Tạo & xuất bản**: kiểm tra hostname đã tồn tại/xung đột và giữ nguyên các DNS/Tunnel/Access records ngoài phạm vi MHC; tạo cấu hình site/Nginx + dịch vụ nội bộ; tạo/cập nhật DNS CNAME tới Cloudflare Tunnel và ingress hostname -> local Nginx đúng Host; kiểm HTTP(S), trạng thái, lỗi, lịch sử và rollback từng bước. Nếu token/permission/zone/tunnel sai: báo lý do rõ, giữ website ở dạng local/draft, **không báo đã xuất bản**.
- Không cần IP tĩnh hoặc port forwarding trên điện thoại; ưu tiên named Tunnel đang có. Wildcard `*.domain` chỉ là opt-in theo từng zone sau khi kiểm tra DNS/Access/chứng chỉ, không bật toàn bộ domain mặc định; không tự ghi đè các subdomain đang dùng.
- Cloudflare route adapter phải có interface dùng chung cho **website publishing** và P3/P4 **Primary cutover**; mô hình admin-panel chung tách khỏi routing website. Với nhiều domain, cập nhật từng hostname an toàn, idempotent và có xác minh/khôi phục khi thất bại giữa chừng. Không tự hứa tất cả website chuyển Primary nếu website chưa có dữ liệu trên node đích.
- Nghiệm thu LAB: tạo `demo` ở **hai zone được cấp quyền** (nếu có), thử hostname trùng, token thiếu quyền, Tunnel offline, reboot, lỗi nginx -t, API timeout, rollback; xác nhận không ảnh hưởng hostname đã chạy và không sửa website production M51/X7b.
- **Trạng thái hiện tại:** CHƯA TRIỂN KHAI Cloudflare API trong nút “Thêm website”; Panel gốc mới tạo website + cấu hình Nginx cục bộ, còn domain phải thêm route thủ công. Lộ trình ưu tiên sau P2 và phối hợp ngay với P3 để dùng chung route adapter, không đợi P6.

## P3 — Manual Primary usable end-to-end
- P3.1 triển khai nền dataset riêng, signed readiness và preview activation nội bộ fail-closed; không tự suy ra manual Primary/writer hoặc Internet routing đã đạt. Các bằng chứng hiện hành chỉ ở LIVE-PROGRESS; protocol và checklist P3.2 ở P3-INTERNAL-CANDIDATE.md. Privileged SQL/same-UID/files/jobs còn phải có giải pháp trước safe writer/cutover.
- P3.2: original Panel qua hai Tunnel riêng, chuyển đúng hai hostname LAB và recovery quản trị bằng authority độc lập; scoped origin proof/Access/HTTP và journal riêng, không cấp Primary writer. Runbook P32-CLOUDFLARE-LAB.md. P3.3 mới thiết kế/nghiệm thu writer lease/gates/conditional data rollback; chưa bật P4.
- Backup/restore có thể do user làm; thao tác chọn từ bất kỳ Panel, health target, RPO warning, quiesce old writer và cảnh báo nếu không xác minh được.
- Route switch via Cloudflare adapter P2.5 (nhiều domain/hostname, chỉ zone được ủy quyền), durable intent, idempotent resume, auth/audit, postcheck và rollback chỉ khi không phát sinh ghi mới không thể đảo an toàn. Panel chung normally theo Primary; khi Primary mất thì standby Panel ở chế độ recovery vẫn phải truy cập được và không tự cấp writer.
- Rejoin old node as standby/quarantine; nó không tự bật lại route/DB writer.
- Nghiệm thu: switchover và rollback giữa hai LAB độc lập, cả khi Panel của Primary chết; một hostname Panel vẫn truy cập qua node dự phòng được bảo vệ Cloudflare Access trong chế độ recovery.

## Thứ tự mới nhất — 28/10/2026: khôi phục WEBSITE trước, Hosting Panel sau

**Đang làm: P3.3 Manual Primary + Control**. Codex tiếp tục hoàn thiện code/tests/live rollout hai Android hiện tại, **không dừng hay làm lại**. Sau nghiệm thu P3.3 thật trên Vsmart/XZ3: **N1 Unified New Node Installer → P4 Lite (Auto Primary + Control cho site LAB thuộc MHC quản lý) → HP1 (Hosting Panel Core) → HP2 (Domain & Automation / P2.5) → HP3 (Backup & Advanced Tools)**. N1 bổ sung cài mới/ghép nhiều node/kiểm eligibility từ nguồn động, không cấp Primary hoặc writer khi join; chi tiết tại [UNIFIED-NEW-NODE-INSTALLER.md](UNIFIED-NEW-NODE-INSTALLER.md). Production migration P5 chỉ sau khi user duyệt.

- P4 Lite **tái dùng** Manual pipeline; Authority độc lập, CAS epoch và lease/fencing, health+HTTP site/Tunnel; kiểm dataset node đích; khi node cũ mất liên lạc, **chờ quyền ghi cũ hết và đảm bảo managed writer self-fence**, thay vì giả định mất mạng là SQL ngừng. Site/DB trên node đích có thể cũ hơn; chấp nhận RPO, không ép replication/GTID 100%. Chỉ auto chọn site MHC-managed đã được xác minh có guard HTTP/PHP/app-DB/jobs; nếu không fence được thì không auto promote, hiển thị yêu cầu can thiệp thủ công. Node cũ rejoin chỉ Standby/quarantine, không auto failback.
- P3.2 tự khôi phục Panel/Control là tính năng quản trị phụ đã có, **không thay thế website failover**.
- Manual P3.3 hiện yêu cầu liên lạc cả hai máy để fence; P4 Lite phải có bài nghiệm thu old-node offline dựa trên self-fencing lease đã kiểm chứng, không chỉ xóa check old-online.
- Auto sau P3.3 vẫn **opt-in disabled by default** cho đến khi thử mất mạng, lease expiry, rejoin, public HTTPS và không hai managed writer trên hai Android. Không bật production.
- Chi tiết scope và DoD tại [HOSTING-PANEL-ROADMAP.md](HOSTING-PANEL-ROADMAP.md). Source/runtime PASS/NOT RUN theo [LIVE-PROGRESS.md](LIVE-PROGRESS.md).

## P4 — Auto Primary healthy + newest verified snapshot
- Heartbeat agent, active web probe, timestamp+hash verified backups, storage/capacity+online reliability scoring.
- Election cooldown, tie breaker deterministic, durable epoch, multiple health checks; không tự bầu nếu authority unavailable.
- Candidate có snapshot gần nhất, có thể stale so với node offline; hiển thị RPO/loss warning, không ép đồng bộ GTID trước khi bầu.
- Route cutover + old node quarantine; test mất kết nối, reboot, mạng chập chờn, crash giữa update route/record state; không auto failback.
- Production AUTO chỉ khi không thể có hai writers đồng thời (chặn direct paths) và đã test thực. Nếu chỉ có best effort, gắn nhãn rủi ro và giữ opt-in disabled by default.

## P5 — Unified production migration M51 + X7b (sau khi user duyệt)
- Đóng băng code version, audit các dịch vụ/domains/DB/sheet/static media của hệ cũ.
- Full backups (mã/hình ảnh/DB/Panel/Cloudflare config), checksum và dry-run trên Vsmart/môi trường phụ.
- Người dùng duyệt maintenance window, đổi tuyến có rollback, smoke-test TPP/WordPress, giám sát; node cũ giữ nguyên dự phòng cho tới khi qua hậu kiểm.
- Khi được phép, cài cùng một unified MHC source lên M51/X7b không xóa cấu hình cũ trước verify; tham gia cluster như standby với từng site đã restore.

## P6 — Sau MVP
- Replication liên tục GTID/file (tùy chọn), backup policy replicas N, node scoring v0.7, alerting, battery/network watchdog, Android process lifecycle, performance, production hardening.

### Definition of done
Đối với mỗi P: source + test tự động + bằng chứng **Android thật** + phiên bản ZIP/repo commit + changelog + rollback. Chỉ cần 1 release per milestone, không phát hành 5-10 bản nhỏ mà mục tiêu vẫn chưa usable.
