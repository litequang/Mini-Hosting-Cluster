# TEST 0.3.9.2 — Nâng cấp Panel Vsmart LAB (an toàn)

**Đã có log thực tế** trên Vsmart `u0_a180@192.168.100.27:8022`: MariaDB/Nginx và MHC Panel chạy qua runit, static site `demo` trên localhost:18080 trả HTTP 200. Mục đích hotfix này là sửa màn hình đăng nhập bị thiếu đường dẫn, **không** cài lại máy và **không** khởi động Tunnel hay HA. TEST 0.3.9.2 chưa có kiểm thử trực tiếp trên Android sau khi phát hành.

## 1. Tải ZIP và gửi qua PowerShell Windows

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.3.9.2.zip" "u0_a180@192.168.100.27:~/"
ssh -p 8022 u0_a180@192.168.100.27
```

Nếu SSH daemon độc lập đang chạy, **không** `pkill sshd`, không khởi động lại SSH khi truy cập từ xa. Lệnh chuyển cổng SSH để xem Panel phải chạy trên **Windows**, không phải Termux.

## 2. Trong Termux Vsmart (thiết bị LAB có cài hoàn chỉnh 0.3.9.1)

```bash
mkdir -p ~/mhc-test-0392
unzip -q ~/MHC-Full-Installer-TEST-0.3.9.2.zip -d ~/mhc-test-0392
cd ~/mhc-test-0392/MHC-Full-Installer
bash install.sh --plan        # chỉ xem thông tin; 'STOP flag: installed' là bình thường đối với máy đã cài
bash install.sh --upgrade     # chỉ cho LAB đã cài thành công; ĐỪNG dùng --install
```

Khi chương trình yêu cầu, nhập `TEST_SOURCE_ONLY_UPGRADE`. Lệnh này chạy toàn bộ self-test trong thư mục tải về **trước khi ghi đè mã MHC**, có thể dùng CPU đáng kể. Nếu báo lỗi: **dừng lại**, giữ nguyên bản cũ, không xóa marker, không sử dụng `--recover-lab`. Quá trình nâng cấp để lại rollback trong `~/.local/share/mhc-full-installer/rollback/`.

## 3. Sau khi upgrade thành công, khởi động lại riêng Panel

```bash
~/mhc-full doctor
sv status mhc-full-panel
sv restart mhc-full-panel
sv status mhc-full-panel
curl --noproxy '*' -sS -I --max-time 5 http://127.0.0.1:19090/login
~/mhc-full serve probe-static demo local.test
```

Không restart `nginx`, `mysqld`, `sshd`, `named-tunnel` hoặc `mhc-ha`. Nếu Panel không chạy sau restart, kiểm tra log runit và thư mục rollback trước khi thay đổi thêm. HTTP 200 của site `demo` là mốc nghiệm thu không hồi quy.

## 4. Trên Windows, mở một PowerShell khác

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 19090:127.0.0.1:19090 -p 8022 u0_a180@192.168.100.27
```

Giữ cửa sổ này mở. Trong Chrome Windows truy cập `http://127.0.0.1:19090/cluster`; nếu chưa có session, nó chuyển đến `/login?next=%2Fcluster`. Dùng token từ **Termux Vsmart**: `~/mhc-full panel token`. Không chụp màn hình, gửi token vào chat hay lưu token trong URL.

Sau khi đăng nhập, Panel sẽ trở về `/cluster`. Thanh tiêu đề phải hiện `TEST 0.3.9.2`; nếu vẫn thấy 0.3.8, kiểm tra `sv restart mhc-full-panel` và refresh trình duyệt (không cần xóa mã nguồn hay database).

## 5. Lệnh chỉ đọc để báo cáo nếu gặp lỗi

```bash
~/mhc-full accept check
sv status mhc-full-panel mhc-full-wp-nginx mhc-full-wp-php
curl --noproxy '*' -sS -D - -o /dev/null --max-time 5 http://127.0.0.1:19090/cluster
```

Đối với `/cluster` chưa đăng nhập, kết quả mong đợi là `HTTP/1.1 303 See Other` và `Location: /login?next=%2Fcluster`. Chỉ gửi mã trạng thái, không gửi cookies, `Set-Cookie`, token, `.env` hoặc DB thật.

**Giới hạn:** Hotfix không thiết lập WP-CLI, WordPress production, nhiều node đồng bộ GTID, split-brain fencing hoặc Cloudflare routing.
