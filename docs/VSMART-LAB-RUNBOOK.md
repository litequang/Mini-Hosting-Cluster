# Vsmart — Codex SSH / cài / test (người dùng đã cho phép)

> Vsmart được dùng làm LAB mới, nhưng **đã từng có MHC/web demo**. Không coi là máy trống. Codex được test/cài tại đây nhưng phải bảo vệ dữ liệu cũ.

## 1. Kết nối
Trên Windows tại máy công ty, dùng địa chỉ LAN gần nhất (xác minh IP hiện tại với user nếu khác):

```powershell
ssh -p 8022 u0_a180@192.168.100.27
```

Ưu tiên OpenSSH key và `%USERPROFILE%\.ssh\config`:

```sshconfig
Host mhc-vsmart-lab
  HostName 192.168.100.27
  User u0_a180
  Port 8022
  IdentityFile ~/.ssh/id_ed25519_mhc_lab
  StrictHostKeyChecking yes
```

**Điều kiện:** fingerprint host key phải do người dùng xác minh trên thiết bị trước khi tin cậy; không tự ghi danh known_hosts từ unverified ssh-keyscan. SSH user/IP có thể đổi khi reset Termux. `Codex Cloud` không trực tiếp tới LAN IP nếu không kết nối VPN/tunnel; ưu tiên VS Code local Codex đã được cài.

## 2. Preflight chỉ đọc đầu tiên

```sh
uname -m
printf 'PREFIX=%s\n' "$PREFIX"
command -v pkg node nginx php mariadb sv cloudflared || true
[ -x ~/mhc-full ] && ~/mhc-full doctor || true
[ -x ~/mhc-full ] && ~/mhc-full hosting-panel plan || true
[ -x ~/mhc-full ] && ~/mhc-full sites list || true
sv status nginx php-fpm mariadb amh-panel named-tunnel 2>/dev/null || true
```

Lưu kết quả đã lọc secrets, xác nhận footprint demo và dung lượng. Không chạy `cat ~/.env`, `env`, `cat` tokens, `mysqldump` lộ secrets ra stdout/chat.

## 3. Backup và restore rehearsal trước cài mới
- Backup current MHC source/marker/config, Panel admin.json, registered sites, test DB và manifests sang directory offline/recovery có chmod 0700. Giữ secrets trên máy người dùng/thiết bị, không commit.
- Xác minh checksum backup, thử giải nén/restore tại vùng LAB tách biệt; giữ SSH working.
- Nếu user muốn **reset sạch Termux trên Vsmart**, trình bày những gì sẽ xóa và hỏi xác nhận riêng; nếu không thì source-only upgrade / migration-in-place.

## 4. Triển khai
- Chỉ chạy `bash install.sh --upgrade` khi điều kiện version/marker và site thật cho phép; fresh install chỉ sau người dùng chấp thuận clear-install. Không bypass STOP bằng sửa marker/loại bỏ guard.
- Panel gốc dùng `hosting-panel plan`, `apply` và lưu `ROLLBACK_ID`, restart đúng `amh-panel`. Giữ nguyên password.
- Cài và test Node Agent/watchdog, boot persistence, Nginx + PHP-FPM + MariaDB. WordPress demo thật tại test hostname nội bộ; kiểm chứng file/upload, database insert, WP-CLI nếu đã cài.
- Sau đó triển khai shared authority (Cloudflare user tự thao tác), test panel login remote qua mạng ngoài do user thực hiện nếu Codex không có route Internet từ máy công ty.

## 5. Tình huống nghiệm thu
- Android offline/reboot, Termux runs under battery saver/Doze, service startup/recovery, test HTTP static/wp + SQL.
- Backup -> restore có kiểm checksum, site tồn tại không bị xóa.
- Manual selection (giai đoạn multi-node) từ Panel A và Panel B đều được authority xác minh, không split-brain.
- Auto mode dùng node LAB thứ hai khi được cấp; **Vsmart đơn độc không đủ chứng minh auto failover hai Android**. Không sử dụng M51/X7b production làm node thứ hai nếu chưa có phép user.

## 6. Phân công Cloudflare
Codex chuẩn bị source/config/README, xác định tài khoản yêu cầu Zone DNS edit / Tunnel / Access / Worker + Durable Object, đưa từng bước user click. User thao tác account, cung cấp kết quả an toàn (hostname, AUD, tunnel UUID có thể công khai sau cân nhắc; không gửi API key/token/private key). Codex sau đó test các endpoint được user mở quyền.
