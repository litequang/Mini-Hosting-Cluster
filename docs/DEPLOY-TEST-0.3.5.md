# MHC TEST 0.3.5 — Hướng dẫn Restore Lab & Node Readiness

**Chỉ dùng trên điện thoại Android/Termux TEST hoàn toàn mới hoặc TEST 0.3.x đã hoàn tất cài đặt. Không dùng trên M51/X7b đang có dữ liệu thật.** Controller inventory không phải Primary HA.

## A. Máy mới — một bộ ZIP All-in-One

1. Chuyển `MHC-Full-Installer-TEST-0.3.5.zip` vào HOME Termux, có >=3 GiB dung lượng, aarch64.
2. Chạy:

```bash
pkg update -y
pkg install -y nodejs unzip python
unzip MHC-Full-Installer-TEST-0.3.5.zip
cd MHC-Full-Installer
bash install.sh --plan
bash bin/self-test.sh
bash install.sh --install
~/mhc-full doctor
```

Installer yêu cầu nhập `TEST_NEW_DEVICE_INSTALL` và có marker cài dở để ngăn chạy lại bừa bãi. Chưa được nghiệm thu trên Android vật lý.

## B. Nâng cấp máy LAB từ TEST 0.3/0.3.1/0.3.2/0.3.3/0.3.4

Backup/kiểm chứng bản hiện tại trước khi cập nhật. Giải nén bản 0.3.5 ở thư mục riêng, `bash install.sh --plan`, `bash bin/self-test.sh`, rồi `bash install.sh --upgrade` và nhập `TEST_SOURCE_ONLY_UPGRADE`. Chỉ nâng cấp file lệnh/công cụ do Full Installer quản lý; không migrate dữ liệu, không động runtime. **Không chạy upgrade trên M51/X7b.**

## C. Điều kiện trước khi restore LAB

Phải có enrollment qua SSH kiểm tra host key, `clone offer` từ controller, `clone fetch` và `clone stage` trên candidate như hướng dẫn TEST 0.3.4. Snapshot không được chứa node identities, invite/token/Panel secret. Node candidate phải không có `~/websites` đang dùng, không có `.config/mini-hosting-cluster/ha.json` hoặc ứng dụng production. Clone/Restore Lab không làm tăng quyền Primary.

```bash
~/mhc-full clone status
~/mhc-full clone stage         # chỉ nếu snapshot vừa fetch và chưa stage
~/mhc-full clone readiness
```

`clone stage` của TEST 0.3.5 tự niêm phong danh sách file. Nếu trước đó đã `stage` bằng TEST 0.3.4, không `stage` lại đè. Chạy:

```bash
~/mhc-full clone reverify-stage --confirm=REVERIFY_OFFLINE_STAGE
~/mhc-full clone readiness
```

Lệnh này giải nén mới **vào chỗ tạm**, so toàn bộ từng file với stage cũ và từ chối nếu khác. Khi gặp lỗi **không** xóa bừa stage hoặc dữ liệu đã xác minh; tìm nguyên nhân và lên kế hoạch phục hồi.

## D. Tạo một bản Restore Lab khác biệt hoàn toàn website thật

```bash
~/mhc-full clone prepare-lab --confirm=OFFLINE_RESTORE_LAB
~/mhc-full clone lab-status
```

Lab nằm tại `~/hosting-clones/mhc-full/labs/<SOURCE_UUID>/snapshot-YYYYMMDD/` chứa `payload/`, `manifest.json`, `readiness.json`. Không tự copy dữ liệu vào `~/websites`, không gán tên miền, không nhập DB sản xuất, không cấu hình dịch vụ.

Để thử riêng một website tĩnh đã có trong snapshot:

```bash
~/mhc-full clone smoke-static demo
```

Kết quả có `httpStatus:200` nghĩa là **index của static site ở LAB** đã qua probe localhost, không phải Nginx/WordPress production thành công.

## E. Nhập DB WordPress vào schema thử nghiệm mới (tùy chọn, có tác động DB của máy LAB)

**Chỉ trên máy LAB có MariaDB mới và sẵn sàng.** Sau khi đã tạo lab và kiểm tra nội dung SQL dump của WordPress:

```bash
~/mhc-full clone import-sql-lab blog --confirm=CREATE_NEW_LAB_DB
~/mhc-full clone lab-status
```

- Tạo một DB tên mới `mhc_restore_blog_<suffix>`, với một MariaDB account riêng chỉ có quyền DB đó. Không nhập bằng root và không cấp quyền lên database khác. SQL dump được truyền qua stream, không lưu trong command-line arguments.
- Nếu lỗi, DB có thể **đã tồn tại một phần**. Chương trình để lại metadata `PARTIAL_OR_UNVERIFIED` và không tự chạy lại hoặc DROP; điều tra thủ công.
- **Không tự chạy WordPress/PHP-FPM hoặc chỉnh sửa wp-config.php.** Cần kiểm tra MariaDB thực, tạo cấu hình cách ly, URL localhost, HTTP/admin/media/permalink/update và version PHP trên Android riêng ở bước nghiệm thu.
- Đây không phải đồng bộ GTID hoặc chứng minh dữ liệu mới nhất, tuyệt đối không dùng làm bằng chứng đổi Primary.

## F. Điều kiện cần trước khi hoàn thành v0.3C/v0.4

- WordPress: SQL imported and tables valid, isolated PHP-FPM/Nginx/PHP extensions/vhost, admin login, upload, permalinks, plugins, restore reload.
- TPP: canonical DB, bảng, Sheet/Sheet+ counts và liên kết dữ liệu, app release/.env được tạo mới phù hợp node, bản copy đủ và truy cập localhost OK.
- Node: SSH fingerprint, battery/Doze/reboot, transfer interruption/disk-full/corrupted archive, snapshot consistency, restore end-to-end.
- HA: GTID + file incremental catch-up, verified lease and write-path fencing, Cloudflare traffic cutover, chaos test. **Các bước HA này chưa triển khai/không ARM**.

**Không đính kèm token, `wp-config.php`, SQL thật, `.env` hoặc SSH private key vào cuộc trò chuyện.**
