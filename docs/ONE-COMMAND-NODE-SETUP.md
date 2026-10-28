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

Luồng tự động cấp Tunnel/peer sau join đang được hoàn thiện; pilot dùng CLI/API có kiểm tra và backup. `control-configure.mjs` prepare/configure xử lý public pins theo N-node, yêu cầu UUID và confirmation rõ; không cấp writer hoặc tự đổi DNS. Operator dùng cùng Worker/DO hiện có, không tạo authority khác hoặc reset cluster.

Node chưa có bản website/DB đã restore và kiểm guard không được làm Primary. Việc chuẩn bị dữ liệu là backup/restore có checksum/probe được chỉ định riêng; dữ liệu có thể cũ, không yêu cầu GTID hay đồng bộ100%.

## Gián đoạn và nâng cấp

Đọc progress.json/installer.pid/installer.exit và kiểm lock trước retry. Nếu installer còn chạy, theo dõi; không chạy bản thứ hai. Nếu dừng, retry đúng lệnh **release ban đầu**; không đổi manifest/source, xóa journal hoặc rotate keys để vượt guard. Một node đã cài release01 không resume bằng02.

Node hiện hữu dùng [source-only package updater](NODE-SOURCE-UPGRADE.md), có backup/verify/rollback và guard writer/transition. Không dùng fresh installer để sửa SSH hoặc nâng Panel; không dùng lại lệnh13patch cũ26/10. Reboot/Doze cần nghiệm thu thực tế, Boot entry chạy được chưa thay cho kiểm đó.
