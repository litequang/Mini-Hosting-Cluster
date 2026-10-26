# TEST 0.3.7 — Cài mới / nâng cấp LAB / Cluster Panel (chỉ đọc)

## Đối tượng và ranh giới

Chỉ dùng trên **Android Termux aarch64 mới hoặc máy LAB đã cài TEST 0.3.x**. KHÔNG cài/upgrade lên M51 hoặc X7b có ứng dụng, dữ liệu, tunnel và DB production. Không ARM HA, không chạy restore live hoặc mở port 19090 công khai. Controller là bộ đăng ký node, không phải Primary HA.

## Máy LAB Termux sạch

Chép ZIP vào Termux HOME, sau đó chạy:

```sh
pkg update -y
pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.7.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
~/mhc-full doctor
```

Cần Internet, không gian trống tối thiểu 3 GiB và quyền cài Termux package. Installer có câu xác nhận tường minh. Nếu dở dang, sẽ giữ marker `install-incomplete` để ngăn tự động ghi đè.

## Máy LAB đã cài TEST 0.3–0.3.6

Tạo backup và chạy `~/mhc-full backup verify` (nếu có snapshot); ghi lại hiện trạng `~/mhc-full doctor`, `~/mhc-full node status` và các file/tài liệu quan trọng. Từ thư mục giải nén 0.3.7:

```sh
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --upgrade
~/mhc-full cluster status
```

`--upgrade` chỉ thay code MHC managed, có thư mục rollback code ở `~/.local/share/mhc-full-installer/rollback/`; không thay các tệp `.env`, DB, website hoặc Cloudflare. Phiên Panel đang mở không tự reload vì các runtime service không được restart. Chủ động `~/mhc-full panel stop` rồi `~/mhc-full panel start` trên máy LAB khi phù hợp, kiểm tra phiên SSH/tunnel trước khi đóng phiên cũ. Không làm vậy trên production.

## Panel và CLI

```sh
~/mhc-full cluster status
~/mhc-full panel start
~/mhc-full panel token   # SECRET: không gửi vào chat/log
```

Trên PC, truy cập Panel qua SSH forwarding (ví dụ máy LAB `192.168.1.50`, SSH 8022; thay bằng IP thực của máy LAB):

```sh
ssh -L 19090:127.0.0.1:19090 -p 8022 TERMUX_USER@LAB_DEVICE_IP
```

Mở `http://127.0.0.1:19090/cluster`. Không NAT/port-forward TCP 19090 trực tiếp ra Internet; không dùng Cloudflare để mở Panel TEST. Panel đăng nhập bằng secret cục bộ và hiển thị trang trạng thái chỉ đọc, API JSON tại `/api/cluster-summary` (cũng bắt buộc session).

Thông tin controller hiển thị: danh sách node đã enrollment, thiết bị/RAM quan sát, heartbeat `RECENT_AUTHENTICATED` (lần báo gần nhất dưới 180 giây), `STALE`, hoặc `NOT_RECENTLY_VERIFIED`; snapshot clone được **cấp phép** và thời hạn; dấu backup gần nhất. Giới hạn tối đa 200 hàng UI, tổng số đếm giữ nguyên.

Máy member hiển thị dữ liệu **riêng của chính member đó**: snapshot receipt, stage seal và Restore Lab metadata (nếu có). Controller **chưa biết** LAB readiness của member từ xa; không suy diễn chỉ từ heartbeat. Những trường trạng thái có chữ `RECORDED_NOT_REVERIFIED` không chứng minh dữ liệu còn nguyên ở thời điểm xem.

## Cách đối soát và rollback

Nếu bảng trạng thái báo backup marker, chạy `~/mhc-full backup verify`; nếu có clone thì chạy các bước verify/readiness CLI có trong hướng dẫn TEST 0.3.6 trước khi tin vào file. Tuyệt đối không dùng Panel để quyết định HA.

Nếu `--upgrade` gặp sự cố, **không tự xóa DB hay thư mục site**. Đọc `~/.local/share/mhc-full-installer/rollback/<stamp>/` để xem bản code/launcher/marker trước đó. Quá trình phục hồi code cần được thực hiện tại máy LAB sau khi đã tắt Panel để tránh chạy code nửa cũ nửa mới.

## Chưa nghiệm thu

- WordPress/PHP-FPM, MariaDB restore trên điện thoại Android thật;
- heartbeat thực qua SSH giữa nhiều điện thoại;
- live GTID, Sheet+ incremental replication, Cloudflare control-plane lease/fence;
- remote member readiness; manual/automatic role switch.
