# MHC v0.5B.1 — Fencing & Lease Fault Lab (OFFLINE ONLY)

**Phân loại: mã thử nghiệm và mô hình lỗi — KHÔNG PHẢI hệ thống cấp lease sản xuất.**

## Kết quả có thể chứng minh

- `fencing plan`: xem các thao tác, không thay đổi hệ thống.
- `fencing scenarios`: chạy 29 tình huống giả lập tất định không đòi MariaDB, Cloudflare hay SSH. Không ghi dữ liệu, phù hợp để thử trên Vsmart LAB đang phục vụ website demo.
- `fencing status`: đọc trạng thái mô phỏng riêng của máy. Khi chưa chạy, `NOT_RUN` là bình thường.
- `fencing rehearse --confirm=OFFLINE_FAULT_MODEL_NO_REAL_AUTHORITY`: trên **Termux LAB độc lập không đăng ký website**, xuất `~/mhc-fencing-lab/report.json` (chmod 0600), không ghi đè biên bản cũ.
- Hosting Panel **gốc** 9090: trang Cluster đọc trạng thái mô phỏng qua API đăng nhập `/api/mhc/fencing`; không cung cấp POST/ARM/HA.

## Nguyên tắc được kiểm thử trong mô hình

1. Khởi tạo term=1 cần witness và tất cả write gates *trong mô hình* hoạt động.
2. Không cấp term thứ hai khi term cũ còn lease hoặc chưa có fence ack.
3. Lease hết hạn đặt trạng thái `UNCERTAIN`, **không** coi là bằng chứng writer cũ đã chết.
4. Đòi khóa ingress/DB/drain khi mô phỏng voluntary release và đòi independent fence, edge revocation, origin block, DB read-only khi xác nhận fence.
5. Reject stale term, replay, expired renewal, backward clock, double-grant, missing GTID/file checkpoint và takeover tự động khi mất witness.
6. Mô hình write gate từ chối khi không đạt bất kỳ witness, edge term gate, watchdog, origin gate nào.
7. Sau term mới, mọi token term cũ bị từ chối bởi **hàm gate giả lập**, không phải gateway thật.

## Đang thiếu để tiến tới chuyển Primary thật

- 2 Android LAB tách biệt, đã nghiệm thu GTID và file replication v0.4 với dữ liệu phát sinh trong khi mất mạng.
- Witness độc lập có persistence/atomic epoch (ví dụ Durable Objects SQLite), kiểm tra cấp lease xuyên kết nối và bất thường sau restart.
- Thực thi term bắt buộc trên **mọi đường ghi**: request ingress/edge, app, DB, background jobs, upload; watchdog fail-closed khi runit/agent chết hoặc thiết bị phân vùng mạng.
- Cơ chế independent fencing **thật**, không chỉ một cờ JSON; kiểm tra người dùng đặc quyền DB (read_only riêng không đầy đủ).
- Cloudflare route/ingress phải chỉ nhận node đang giữ term; diễn tập lỗi mạng, nguồn, Termux killed, 2 tunnel, witness down và phục hồi với bằng chứng.
- Đánh giá rollback sau release/route và cơ chế old-primary rejoin chỉ dưới dạng Standby đã reseed, không tự failback.

**Lưu ý giới hạn:** Một mô hình giả lập có thể vượt qua 100% bài test mà hệ thống ngoài đời vẫn có split-brain vì MariaDB user có quyền vượt read_only, app có đường ghi ngoài gate, hoặc node mất mạng không nhận lệnh fence. KHÔNG dùng biên bản này làm bằng chứng cấp quyền Primary.

## Các lệnh an toàn trên Vsmart đã có website demo

```bash
~/mhc-full fencing plan
~/mhc-full fencing scenarios
~/mhc-full fencing status
~/mhc-full serve probe-static demo local.test
```

Không chạy `fencing rehearse` trên Vsmart đang phục vụ demo; guard phải từ chối. Không chạy bất kỳ bản TEST trên M51/X7b production.

## Hướng dẫn nâng cấp code LAB

Trên PowerShell Windows, sau khi tải ZIP vào `Downloads`:

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.5.0B.zip" "u0_a180@192.168.100.27:~/"
```

Trên Termux Vsmart:

```bash
mkdir -p ~/mhc-test-050b
unzip -q ~/MHC-Full-Installer-TEST-0.5.0B.zip -d ~/mhc-test-050b
cd ~/mhc-test-050b/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Nhập `TEST_SOURCE_ONLY_UPGRADE` **chỉ khi self-test và các preflight đạt**. Lệnh không cập nhật giao diện gốc 9090 tự động. Nếu muốn hiển thị mục mới:

```bash
~/mhc-full hosting-panel plan
~/mhc-full hosting-panel apply
# lưu ROLLBACK_ID từ output, rồi
sv restart amh-panel
```

Rollback Panel: `~/mhc-full hosting-panel rollback ROLLBACK_ID` rồi `sv restart amh-panel` (nhập mã xác nhận). Rollback mã MHC: giữ đường dẫn bản code trước trong `~/.local/share/mhc-full-installer/rollback/`; không tự xóa marker hay phục hồi database. Không mở cổng 9090 trên Internet.
