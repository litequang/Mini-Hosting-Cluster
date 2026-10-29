# Thêm điện thoại Android mới bằng một release MHC

Runbook cài đặt; trạng thái triển khai và PASS/FAIL/NOT RUN chỉ tại [LIVE-PROGRESS.md](LIVE-PROGRESS.md). Spec/DoD: [UNIFIED-NEW-NODE-INSTALLER.md](UNIFIED-NEW-NODE-INSTALLER.md).

## Điện thoại Termux sạch

Chuẩn bị Termux, Termux:Boot và Termux:API có chữ ký tương thích. Mở Termux:Boot một lần; cho ba ứng dụng chạy nền/battery unrestricted và bật tự khởi động nếu Android yêu cầu. Installer không thể tự cấp các quyền Android này bằng shell.

Release **MHC-N1-20261029-05** dùng đúng source **bd5bcfda59e3b26c944da3ffa14cd4a0c637cb14**,183file. Manifest SHA256: b9964183bb3dc1f497ba60893aef331515474505008a2462f346659cb59501f0. Lệnh dưới kiểm hash bootstrap trước khi thực thi, kể cả khi URL nhánh thay đổi; bootstrap ghim source và kiểm toàn bộ manifest. Không bỏ bước hash.

```sh
curl -fLsS 'https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/codex/m1-m2-foundation/releases/new-node/MHC-N1-20261029-05/bootstrap.sh' -o "$HOME/mhc-bootstrap-N1-05.sh" && printf '%s  %s\n' 'd4b43eb67320cebcd3e036270b3f6cbfd7cc876b3ef817341b7c773e6cd6b046' "$HOME/mhc-bootstrap-N1-05.sh" | sha256sum -c - && bash "$HOME/mhc-bootstrap-N1-05.sh" --install
```

Chỉ dùng cho ARM64 Termux sạch. Không chạy trên Vsmart/XZ3/11T đã cài, node production hoặc node có dữ liệu. Nếu đã có MHC/website/database khác, bộ cài từ chối thay vì xóa. Cài source cùng release, phần mềm nền, original Panel9090, identity/key/credentials riêng, runit SSH/Panel/SQL và Boot. PHP/Nginx là nền hosting; chưa có website thì không tự tạo site/writer. Cloudflared được cài, nhưng cài binary chưa có nghĩa Tunnel hoặc Control đã sẵn sàng.

Mở **http://127.0.0.1:9090** trên chính điện thoại. Admin password nằm riêng tại ~/.config/mhc-full-installer/panel-login-once; xem trực tiếp trên Termux khi cần, không gửi vào chat/log. Mật khẩu của node khác không được sao chép.

## Ghép Cluster bằng mã 10 phút

1. Trên Panel MHC đang hoạt động, vào Cluster → Thêm điện thoại mới → Tạo mã ghép10phút. Không đăng mã công khai.
2. Trên Termux mới chạy `~/mhc-full join`, rồi dán mã vào lời nhắc ẩn. Không dán mã vào argv/lịch sử shell. Automation có thể dùng stdin với `~/mhc-full join --stdin`.
3. Agent khởi chạy và gửi heartbeat/Monitor bằng credentials riêng; node tham gia Standby, không tự nhận writer lease. Mã hết hạn/replay bị từ chối; lỗi mạng giữ identity để retry.

Panel phân biệt cài hệ thống, ghép, Panel/Agent, Tunnel và thiếu website/database. Fresh install/join không phải bằng chứng Control hoặc Primary.

## Tunnel, Control và dữ liệu

Mỗi node phải có Tunnel token riêng0600, đúng Access/AUD/hostname và origin JWT; không copy token giữa các node, không đặt account API token trên phone. Control cần public-key/Tunnel registry được operator chấp nhận và proof quản trị mới. Kênh HTTPS Agent→Authority dùng role credentials/proof keys đã ghép; không mở SSH/MariaDB ra Internet. Legacy peer SSH nếu dùng vẫn phải có forced-command và host/proof pins.

Source self-service mới dùng Agent → cùng Worker/DO để tự cấp Tunnel và đăng ký ứng viên Control sau mã ghép. Release05 phía trên chứa luồng này; trạng thái triển khai/nghiệm thu thật và blocker xem LIVE-PROGRESS, không dùng kiểm hash thay cho fresh install thực. Mỗi node giữ public pin được mã ghép phê duyệt, token Tunnel riêng và origin Access; readiness quản trị đi qua Authority, không cần nhập SSH peer thủ công cho node mới. Không tự đổi DNS hoặc nhận Control đang phục vụ chỉ vì join. N1.3 dùng authenticated HTTPS relay qua Authority cho site/Manual readiness, không cần IP LAN hoặc SSH peer. Legacy P31/P32 vẫn giữ sandbox cũ.

### Cấp quyền Cloudflare một lần cho cả cluster

1. Giao diện Account API tokens mới: Manage account → Account API tokens → Create token, tên MHC-N1-TUNNEL → Permission policies → **Start from scratch**. Giao diện token cá nhân cũ: My Profile → API Tokens → Create Token → Custom/Get started.
2. Tìm `cloudflared`; chọn **Cloudflare One Connector: cloudflared → Write**. Tên cũ **Cloudflare Tunnel → Edit/Write** cũng được API chấp nhận. Chỉ cần một Write permission; chọn thêm Read vẫn dùng được. Với account token, tạo trong đúng account chứa giaouoc.com, ID35b2468610cfa060d5d02865b7996a74; có thể không có Specific account. Với user token, Include → Specific account đúng account này. Không chọn full account/write all/DNS/Access/Workers hoặc quyền tạo token.
3. Lưu/Add policy nếu màn hình yêu cầu, chọn thời hạn theo chính sách; để trống Client IP filtering vì Worker dùng token. Review token → Create token. Tạo token xong chưa đủ: phải chạy đúng lệnh PowerShell dưới và dán token tại lời nhắc ẩn để đưa vào Worker. Khi hết hạn cần token thay thế. Không dán token vào chat/lệnh/screenshot.

```powershell
& 'E:\CODE\MHC\MHC\.work\repository\tools\configure-cloudflare-n1.ps1'
```

Helper kiểm quyền đọc Tunnel trong đúng account rồi dùng phiên Wrangler đã đăng nhập lưu MHC_N1_CF_TOKEN trực tiếp vào Worker Secret. Không ghi token xuống PC/phone; API write thực được kiểm khi provision. Các giá trị public MHC_N1_ENABLED/MHC_N1_CONFIG_JSON được deployment LAB cấu hình riêng đúng existing Access team/AUD, không tạo app/policy hoặc sửa production. Nếu chưa deploy source/vars phù hợp thì cấp secret chưa có nghĩa self-service đã chạy. Sau thiết lập ban đầu, thêm điện thoại không cần PC hoặc CLI Cloudflare. Panel hiển thị blocker nếu thiếu quyền/connector/approval, node vẫn Standby.

Node chưa có bản website/DB đã restore và kiểm guard không được làm Primary. Việc chuẩn bị dữ liệu là backup/restore có checksum/probe được chỉ định riêng; dữ liệu có thể cũ, không yêu cầu GTID hay đồng bộ100%.

## Gián đoạn và nâng cấp

Đọc progress.json/installer.pid/installer.exit và kiểm lock trước retry. Nếu installer còn chạy, theo dõi; không chạy bản thứ hai. Nếu dừng, retry đúng lệnh **release ban đầu**; không đổi manifest/source, xóa journal hoặc rotate keys để vượt guard. Một node đang cài dở release01/02/03/04 phải resume đúng release ban đầu, không dùng05.

Node hiện hữu dùng [source-only package updater](NODE-SOURCE-UPGRADE.md), có backup/verify/rollback và guard writer/transition. Không dùng fresh installer để sửa SSH hoặc nâng Panel; không dùng lại lệnh13patch cũ26/10. Reboot/Doze cần nghiệm thu thực tế, Boot entry chạy được chưa thay cho kiểm đó.

## Chuẩn bị website dự phòng trong original Panel

1. Mở **https://panel-lab.giaouoc.com → Cluster → node đích → Chuẩn bị website dự phòng**. Chọn site MHC WordPress LAB; kiểm sáu readiness và lý do thiếu trước.
2. Chọn node nguồn **đang Standby có dữ liệu LAB**, bấm Tạo backup có checksum và xác nhận. Agent thực hiện tiếp ngay cả khi PC đóng; làm mới danh sách sau khi backup DONE.
3. Chọn backup đã xác minh, đánh dấu xác nhận giữ dữ liệu hiện có rồi bấm Phục hồi vào node đã chọn. Chỉ đích trống mới được phục hồi. Có site/schema/user sẵn thì bị từ chối; chọn Kiểm tra lại thay vì xóa hoặc restore đè.
4. Theo dõi tải/checksum/giải nén/tạo credentials riêng/restore SQL/kiểm site. Lỗi có thể Thử lại đúng tác vụ/journal. Chỉ sau proof HTTP/PHP/SQL/files/Standby và own Tunnel hợp lệ, SITE_READY rồi ELIGIBLE_PRIMARY mới xanh; đây là ứng viên, chưa được cấp lease/đổi Primary.

N1.3 hiện chỉ chuyển content/core/theme/media và8bảng nội dung LAB, không WP users/usermeta/options/wp-config/credentials/salts/keys; đích có admin/DB credentials riêng. Giới hạn64MiB, hai backup/24h. Đây chưa là full-site WordPress production restore. Chuẩn bị không tự đổi DNS/Control/lease. Thêm node sau cấp quyền Cloudflare một lần không cần PC cấp token riêng; mỗi node tự nhận own Tunnel token. Thiếu quyền hiển thị blocker, không giả ROUTE_READY.

Release05 đã kiểm native hash183/183/bootstrap/PHP; **fresh05 trên Termux sạch PHYSICAL_NOT_RUN**, không cài đè11T/XZ3/Vsmart để thử. Trạng thái hiện hành, clock/reboot/Doze và bằng chứng Android chỉ ở LIVE-PROGRESS.
