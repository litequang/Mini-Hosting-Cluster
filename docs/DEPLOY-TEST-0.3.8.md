# MHC Full Installer TEST 0.3.8 — Hướng dẫn triển khai LAB

## 1. Phạm vi và cảnh báo

Chỉ cài trên **máy Android Termux mới, sạch, dùng để thử nghiệm**, hoặc nâng cấp mã MHC Full từ bản TEST 0.3.x trên thiết bị LAB đã sao lưu. Không chạy installer/upgrader này trên M51 (`192.168.1.43`) hay X7b (`192.168.1.35`) đang giữ dữ liệu thực.

Không chép `.env`, token, SSH private key, SQL production hoặc cấu hình Cloudflare vào ZIP hay cuộc trò chuyện. Không mở Panel cổng 19090 ra LAN/WAN. **Chỉ controller inventory, không phải Primary điều khiển HA.**

## 2. Cài sạch (chỉ Termux mới)

Đưa `MHC-Full-Installer-TEST-0.3.8.zip` vào thư mục Home của Termux:

```bash
pkg update -y
pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.8.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
~/mhc-full doctor
```

Installer phải dừng khi gặp dấu vết cài đặt cũ hoặc production; mọi yêu cầu nhập xác nhận là có chủ đích. Kết quả cài sạch trên Termux vẫn cần kiểm thử thực tế.

## 3. Nâng cấp code từ LAB TEST 0.3.x

Trước khi nâng cấp: sao lưu dữ liệu LAB và kiểm tra rằng không có backup đang chạy. Giải nén TEST 0.3.8 thành thư mục mới, chạy `bash install.sh --plan`, `bash bin/self-test.sh`, rồi `bash install.sh --upgrade` và nhập xác nhận. Quy trình chỉ thay mã MHC, không đụng database, website hay Tunnel; có thư mục rollback trong `~/.local/share/mhc-full-installer/rollback/`. Đây chưa phải bảo đảm rollback production.

Sau nâng cấp, **khởi động lại Panel trên máy LAB nếu đang chạy** để nó nạp mã mới (sử dụng `~/mhc-full panel stop`, `~/mhc-full panel start` trên thiết bị test). Kiểm tra lại `~/mhc-full cluster status`.

## 4. Cấu hình enrollment và heartbeat (tùy chọn, không tự bật)

Làm trên **hai thiết bị LAB đã cài bộ cài, xác minh SSH public key và host fingerprint**. Trên máy làm controller:

```bash
~/mhc-full node init 'Lab Controller'
~/mhc-full node cluster-init
~/mhc-full node invite 10
```

Giữ mã mời dùng một lần trong môi trường riêng (không gửi qua chat). Trên node mới:

```bash
~/mhc-full node init 'Lab Member'
~/mhc-full node join CONTROLLER_LAN_IP TERMUX_SSH_USER 8022
```

Lệnh `join` yêu cầu người dùng nhập mã mời kín từ terminal. Nếu SSH host key chưa pin hoặc pairing không thành công, dừng và kiểm tra; **không tắt `StrictHostKeyChecking`**.

Kiểm tra lần đầu bằng lệnh trên node thành viên:

```bash
~/mhc-full node heartbeat
```

Hoặc, chỉ trên node LAB sau khi người quản trị xác nhận, bật heartbeat mỗi khoảng 60 giây:

```bash
~/mhc-full node service start
```

Service mặc định tắt. Khi dừng: `~/mhc-full node service stop`. Android có thể dừng Termux vì tiết kiệm pin, khiến báo cáo quá hạn; đó không phải bằng chứng failover.

## 5. Xem trạng thái cụm

Trên controller:

```bash
~/mhc-full cluster status
~/mhc-full panel start
```

Dùng SSH port forwarding tới `127.0.0.1:19090`, đăng nhập Panel rồi mở `/cluster`. Trang hiện thông tin node, heartbeat, snapshot, stage, Restore Lab, SQL lab/WordPress preview record counts và cảnh báo, **không chứa quyền chọn Primary**. JSON dành cho chẩn đoán là `/api/cluster-summary` sau khi đăng nhập.

Hiểu trạng thái:

- `RECENT_AUTHENTICATED_REPORT`: controller mới **nhận** bản báo cáo được xác thực qua SSH; không phải xác minh nội dung backup/DB.
- `MEMBER_REPORT_NOT_RECENT`: node chưa báo cáo hoặc báo cáo quá cũ, cần kiểm tra SSH/Termux và tiến trình.
- `LAB_PREPARED_NOT_LIVE`: node tự ghi nhận Restore Lab trong vùng offline, **không phải** website standby production.
- `RECORDED_NOT_REVERIFIED`: con trỏ snapshot có metadata; chưa kiểm SHA256 lại trong lần xem Panel.
- Các trường `haEligible`, `primaryVerified` và `standbyReady` vẫn là `false`.

## 6. Phạm vi kiểm thử và rollback

Kiểm tra bộ mã trước khi dùng: `bash bin/self-test.sh`. Kiểm thử này dùng SSH giả lập và filesystem tạm, **không chạm vào M51/X7b**. Chưa đủ để công nhận Nginx/PHP-FPM/MariaDB/Cloudflare đã chạy thật.

Nếu sau nâng cấp TEST Panel lỗi: ngừng service Panel trên thiết bị LAB, đọc log và dùng thư mục rollback mà installer lưu, không tự ghi đè mã/dữ liệu production. Nếu controller nhận báo cáo không hợp lệ, xác minh version TEST hai đầu, xem log **đã loại bỏ secret**, không gửi token heartbeat cho người khác.
