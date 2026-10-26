# MHC Full Installer TEST 0.4.0B4 — v0.4B.4 GTID Acceptance LAB

**Nền:** TEST 0.4.0B3. Bộ cài All-in-One và Hosting Panel gốc 9090 được giữ lại.

## Tính năng bổ sung

- `bin/gtid-acceptance.mjs` và CLI `mhc-full replication source-plan LAB_DB`: kiểm tra instance MariaDB dành riêng cho LAB (chỉ chứa DB `mhc_lab_*`, không có website đã đăng ký, không có footprint TPP/HA, GTID/binlog/ROW, read-only phù hợp vai trò).
- `source-probe LAB_DB --confirm=WRITE_DEDICATED_GTID_LAB_PROBE`: **có ghi DB** trên SOURCE LAB: tạo bảng kiểm chứng riêng `mhc_b4_replication_probe` và thêm một dòng ngẫu nhiên. Đọc lại dòng và so sánh GTID trước/sau; lưu `proof-*.json` riêng tư (0600). Không đụng website/DB production.
- `replica-check PROOF`: đọc trạng thái replica, `gtid_slave_pos` và bản ghi kiểm chứng đã áp dụng. Kiểm tra một nguồn GTID cụ thể có xuất hiện và dữ liệu kiểm chứng khớp. Không suy ra tất cả bảng/file đã trùng nhau.
- `outage-sample baseline|disconnected|reconnected PROOF` và `outage-report`: lưu mẫu quan sát về việc IO ngắt và nối lại; không dừng/kích hoạt SSH, MariaDB hoặc Tunnel.
- Hosting Panel 9090 trang Cluster bổ sung mục v0.4B.4, chỉ xem metadata tổng hợp, không hiển thị proof payload/GTID/đường dẫn nội bộ.
- Giữ chế độ upgrade chỉ mã và rollback từ các bản LAB trước, không nâng cấp tự động Panel runtime.

## Giới hạn và điều kiện chặn

- Mã nguồn chạy test trên Linux mock. **Chưa có hai MariaDB Android LAB chạy replication thực và được nghiệm thu.**
- Lệnh ghi chỉ dành cho instance MariaDB SOURCE LAB cách ly, khi đã có backup và có xác nhận, không chạy trên Vsmart đang có website `demo`, M51 hoặc X7b.
- Outage samples ghi lại quan sát tại một thời điểm, có thể bị stale hoặc chỉnh sửa bởi người có quyền trên máy; không phải chứng thư độc lập.
- Không tự tạo replication user, không nhập seed, không thiết lập GTID, không đổi read-only hoặc writer lease, không mở database qua LAN, không chuyển Primary.
- `lagSeconds=0` không chứng minh bắt kịp, GTID/row probe match không chứng minh toàn bộ dữ liệu hoặc an toàn split-brain.
