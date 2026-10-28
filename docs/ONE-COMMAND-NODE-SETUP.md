# Thêm điện thoại Android mới bằng một release MHC

Runbook cài đặt; trạng thái triển khai và PASS/FAIL/NOT RUN chỉ tại [LIVE-PROGRESS.md](LIVE-PROGRESS.md). Spec/DoD: [UNIFIED-NEW-NODE-INSTALLER.md](UNIFIED-NEW-NODE-INSTALLER.md).

## Điện thoại Termux sạch

Chuẩn bị Termux, Termux:Boot và Termux:API có chữ ký tương thích. Mở Termux:Boot một lần; cho ba ứng dụng chạy nền/battery unrestricted và bật tự khởi động nếu Android yêu cầu. Installer không thể tự cấp các quyền Android này bằng shell.

Release **MHC-N1-20261028-02** dùng đúng source **90001f223028cfcf3cb8cf2fb381bbb0cd861b62**,179file. Manifest SHA256: ebce273bc816adc0a69f9f942f53212c715607b0c668259f906ef53da27e7b22. Lệnh dưới kiểm hash bootstrap trước khi thực thi, kể cả khi URL nhánh thay đổi; bootstrap ghim source và kiểm toàn bộ manifest. Không bỏ bước hash.

```sh
curl -fLsS 'https://raw.githubusercontent.com/litequang/Mini-Hosting-Cluster/codex/m1-m2-foundation/releases/new-node/MHC-N1-20261028-02/bootstrap.sh' -o "$HOME/mhc-bootstrap-N1-02.sh" && printf '%s  %s\n' '370ea05c6e095b17c31e06e59235bfc9aff5aad8d5d8f7ba24a44e3786686f44' "$HOME/mhc-bootstrap-N1-02.sh" | sha256sum -c - && bash "$HOME/mhc-bootstrap-N1-02.sh" --install
```

Chỉ dùng cho ARM64 Termux sạch. Không chạy trên Vsmart/XZ3/11T đã cài, node production hoặc node có dữ liệu. Nếu đã có MHC/website/database khác, bộ cài từ chối thay vì xóa. Cài source cùng release, phần mềm nền, original Panel9090, identity/key/credentials riêng, runit SSH/Panel/SQL và Boot. PHP/Nginx là nền hosting; chưa có website thì không tự tạo site/writer. Cloudflared được cài, nhưng cài binary chưa có nghĩa Tunnel hoặc Control đã sẵn sàng.

Mở **http://127.0.0.1:9090** trên chính điện thoại. Admin password nằm riêng tại ~/.config/mhc-full-installer/panel-login-once; xem trực tiếp trên Termux khi cần, không gửi vào chat/log. Mật khẩu của node khác không được sao chép.

## Ghép Cluster bằng mã 10 phút

1. Trên Panel MHC đang hoạt động, vào Cluster → Thêm điện thoại mới → Tạo mã ghép10phút. Không đăng mã công khai.
2. Trên Termux mới chạy `~/mhc-full join`, rồi dán mã vào lời nhắc ẩn. Không dán mã vào argv/lịch sử shell. Automation có thể dùng stdin với `~/mhc-full join --stdin`.
3. Agent khởi chạy và gửi heartbeat/Monitor bằng credentials riêng; node tham gia Standby, không tự nhận writer lease. Mã hết hạn/replay bị từ chối; lỗi mạng giữ identity để retry.

Panel phân biệt cài hệ thống, ghép, Panel/Agent, Tunnel và thiếu website/database. Fresh install/join không phải bằng chứng Control hoặc Primary.

## Tunnel, Control và dữ liệu

Mỗi node phải có Tunnel token riêng0600, đúng Access/AUD/hostname và origin JWT; không copy token giữa các node, không đặt account API token trên phone. Control cần public-key/Tunnel registry được operator chấp nhận và proof quản trị mới. Peer SSH dùng forced-command và host/proof pins; thiếu đường peer thì báo unavailable, không mở SSH Internet.

Source self-service mới dùng Agent → cùng Worker/DO để tự cấp Tunnel và đăng ký ứng viên Control sau mã ghép. Release02 phía trên chưa chứa luồng này; chỉ dùng release mới khi được công bố có checksum. Mỗi node giữ public pin được mã ghép phê duyệt, token Tunnel riêng và origin Access; readiness quản trị đi qua Authority, không cần nhập SSH peer thủ công cho node mới. Không tự đổi DNS hoặc nhận Control đang phục vụ chỉ vì join. Peer SSH cũ vẫn dùng cho managed writer/site trên hai LAB hiện có.

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

Đọc progress.json/installer.pid/installer.exit và kiểm lock trước retry. Nếu installer còn chạy, theo dõi; không chạy bản thứ hai. Nếu dừng, retry đúng lệnh **release ban đầu**; không đổi manifest/source, xóa journal hoặc rotate keys để vượt guard. Một node đã cài release01 không resume bằng02.

Node hiện hữu dùng [source-only package updater](NODE-SOURCE-UPGRADE.md), có backup/verify/rollback và guard writer/transition. Không dùng fresh installer để sửa SSH hoặc nâng Panel; không dùng lại lệnh13patch cũ26/10. Reboot/Doze cần nghiệm thu thực tế, Boot entry chạy được chưa thay cho kiểm đó.
