# N1 — Unified New Node Installer (MHC self-hosting / Android Termux)

> Quyết định 28/10/2026. Đây là **spec/next milestone**, không phải tính năng đang chạy. Không ngắt P3.3 Manual Primary + Control đang Codex triển khai. N1 thực hiện **sau khi P3.3 LAB hai chiều đã nghiệm thu**, **trước P4 Lite Auto Primary** để tháo hardcode hai node. Trạng thái runtime thực tế chỉ tại [LIVE-PROGRESS.md](LIVE-PROGRESS.md).

## Mục tiêu sử dụng

Với điện thoại Android mới, người vận hành:
1. Cài Termux + Termux:Boot + Termux:API (nguồn/chữ ký tương thích), cấp quyền Android/battery một lần.
2. Chạy **một lệnh bootstrap đáng tin cậy** đã ghim immutable release/hash. Bộ cài tự phát hiện thiết bị và cài bộ nền MHC phù hợp (không hỏi user phải liệt kê cấu hình CPU/RAM trước).
3. Đăng nhập original Panel 9090 của bất kỳ node đang hoạt động → Cluster → Thêm node → tạo mã ghép một lần 10 phút.
4. Trên điện thoại mới nhập mã ghép, không dán token vào log/CLI history. Node có ID/key riêng, nối vào **Shared Authority hiện có**, Panel và Agent trên chính node, Monitor hiện heartbeat thật, mặc định **Standby / không cấp quyền ghi**.
5. Trong Panel thấy khả năng thiết bị, tiến độ cài/đăng ký dịch vụ, các thiếu sót và lựa chọn **Chuẩn bị phục vụ website**. Khi có bản sao dữ liệu/restore đã kiểm, Tunnel/Access và scoped writer gates thì mới đánh dấu **Eligible Primary**. Không có dữ liệu thì chỉ là node quản trị và hosting chưa sẵn sàng.

**Ưu tiên một quy trình kết quả cuối, tối thiểu thao tác:** Install → Join → Verify → Standby. Các bước không thể tự động do Android OS hoặc Cloudflare permission phải báo rõ một lần, không vòng audit thủ công dài.

## Giữ lại / tái sử dụng code hiện có

- scripts/bootstrap-new-android-node.sh và docs/ONE-COMMAND-NODE-SETUP.md hiện ghim source cũ 2f14deb, là fresh-only.
- bin/cluster-authority.mjs đã có sharedInvite()/joinWithCode(), dùng Worker/DO hiện tại; mã một lần và agent heartbeat; node mới không tự nhận Primary.
- Original Panel 9090, Node Agent, Termux:Boot, node doctor/monitor, source package transactional updater, Cloudflare origin JWT và Cloudflare worker/DO hiện hữu.
- Bỏ giả định **chỉ hai node** trong các đường onboarding; source-upgrade.mjs LAB_NODES hardcoded, p31-configure.mjs yêu cầu đúng 2 peer và LAN IP 192.168.1.x, p32-lab.mjs proof/routes cố định 2 LAB, P3.3 current scoped MHC_MANAGED_WORDPRESS_LAB chỉ Vsmart/XZ3. **Không thay guards bằng cho phép toàn bộ node không xác thực; chuyển sang membership/allowlist/pinned proof keys có kiểm chứng từ authority/admin, không cho node mới tự được writer.**
- Phân biệt **node enrolled** (có identity + Panel/Agent/heartbeat) với **node route-ready** (Tunnel/Access) và **site-ready** (bản website/DB đúng site + guard/restore kiểm chứng). Chức năng manual/auto chỉ được chọn node đạt đúng cấp eligibility.

## Gói công việc N1 — tối giản thành các kết quả thực

### N1.1 Fresh setup và nhận diện thiết bị
- Một entry chuẩn cài Termux sạch ARM64, kiểm môi trường Android/Termux/ABI, dung lượng, RAM, battery/API permissions, quyền chạy nền, trạng thái boot; đề xuất vai trò/cài service hợp lý, không yêu cầu user nhập cấu hình trước.
- Cài Node.js, Nginx, PHP-FPM, MariaDB, SSH, runit, Python/công cụ backup, original Panel và Agent bằng installer chính thống; kiểm dịch vụ thực và loopback 9090. Không mặc định cài site hoặc ghi DB sản xuất.
- Source/bootstrap cùng **một release ghim SHA/manifest** được nghiệm thu, không dùng bộ 2026-10-26 cổ hoặc chắp nhiều patch. Không tải và chạy trực tiếp một nhánh đang thay đổi mà không kiểm manifest.
- Fresh-only guard và preflight nhận diện existing MHC/website/DB; cấm install đè và tự reset. Nếu bị gián đoạn, resume idempotent theo journal/progress; không bắt đầu từ đầu hoặc xóa trạng thái khác khi retry.
- Khởi tạo identity/node keys riêng trên điện thoại; không copy admin.json/passwords, authority credentials, SSH private keys, DB users/salts, Tunnel token của Vsmart/XZ3.

### N1.2 Ghép node và Panel/Monitor chung
- Dùng **Worker/DO cluster hiện có**, một mã join hết hạn 10 phút, one-use. UI hiển thị tiến độ và kết quả; tránh lộ secret trong screenshot/log/shell history (ví dụ đọc stdin/TTY).
- Sau join, mỗi node có original Panel9090 + Agent/runit/boot recovery; Monitor thấy node mới với fresh heartbeat; Control không nằm cố định tại Vsmart.
- Cấu hình theo shared authority revision/epoch và role mặc định Standby. Cần RBAC/admin confirmation và proof key pin để chấp nhận node mới như peer tin cậy. Nếu invite hết hạn hoặc join bị replay thì báo cụ thể; retry join có khóa trạng thái an toàn.
- Không restart/rotate Worker/DO/secrets của cluster đang chạy. Không tự thêm node mới vào allowlist writer chỉ vì join thành công.

### N1.3 Tunnel và chuẩn bị site Standby
- Tự kiểm tra khả năng cấu hình named Cloudflare Tunnel riêng từng node trong exact zone/hostname allowlist bằng quyền đã có; nếu thiếu quyền, hiển thị **một bước cụ thể** user cần thao tác. Tunnel token riêng lưu file 0600 trên node, không cho vào Git/chat/args/log; giữ Access JWT/SSO/CSRF.
- Không để nhiều Tunnel connector cạnh tranh cùng hostname production; Shared Authority điều khiển site/Panel routes có journal, origin proof; node mới không đổi DNS nếu chưa được operator chỉ định và verify.
- Panel có hành động **Chuẩn bị node phục vụ website**: chọn site đã có, kiểm files/SQL/snapshot, cho phép backup/copy hoặc restore tường minh với checksum/probe, không yêu cầu dữ liệu bằng nhau 100%, không tự xóa hoặc restore đè DB. Nếu dữ liệu chưa có thì báo NOT_READY; không đánh dấu có khả năng Primary.
- Cấu hình peer qua signed enrollment/SSH forced-command và allowlist dynamic được admin chấp thuận; loại bỏ IPv4 LAN-only khi thật sự dùng được relay tin cậy qua các mạng khác nhau. Chưa có đường peer an toàn cross-network thì báo PEER_UNAVAILABLE; không tự mở SSH ra Internet hoặc bỏ host pinning.

### N1.4 Eligibility, UX và nghiệm thu
- Panel phân biệt: INSTALLED → JOINED → MANAGEMENT_READY → ROUTE_READY → SITE_READY → ELIGIBLE_PRIMARY, kèm blockers hữu ích. Đây là trạng thái quan sát/verification chứ không phải cấp quyền.
- Xử lý battery restrictions/reboot/Termux startup, offline join, thiếu package, lỗi checksum, hết disk, thiếu token, source rollback, mất Worker, retry lỗi giữa install. Hiện progress và nút Tiếp tục, không reset node nếu lỗi.
- Nghiệm thu một **Android thứ ba thực sự sạch** nếu có thiết bị được phép; nếu không có chỉ báo TESTED_FIXTURE / PHYSICAL_NOT_RUN rõ ràng, không tự động đụng M51/X7b/F3216. Có thể giả lập phần protocol/installer trong HOME fixture nhưng không gọi là Android thực.
- Kiểm Vsmart + XZ3 Panel/Agent/Tunnel/site và shared authority phiên bản cũ không bị thay đổi; dùng canary + backups và rollback trước mọi mutation. Không bật writer/auto trong N1.
- Output: 1 câu lệnh cài pinned an toàn, 1 luồng join Panel, status/doctor, release SHA/manifest, rollback, báo cáo PASS/FAIL/NOT RUN và giới hạn cross-LAN; cập nhật AGENTS/CODEMAP/ARCHITECTURE/DECISIONS/TROUBLESHOOTING/ROADMAP/LIVE-PROGRESS ở nơi liên quan.

## Ranh giới N1 so với P4 Lite
- N1 đưa **n node** vào cluster và cung cấp eligibility thực theo từng site. Không làm auto election hoặc grant writer tự động.
- P4 Lite dùng lại P3.3 pipeline và eligibility để tự failover với MHC-managed site khi old node offline; old managed writer phải tự fence khi authority/lease mất, chờ lease hết hạn/safety margin, không auto failback; không bắt buộc replication/GTID 100%, nhưng không được có hai managed writers.
- Không mở rộng quyền tự động sang website Thờ Phượng Pro/M51/X7b production khi chưa nghiệm thu scope/backup và user phê duyệt riêng.
