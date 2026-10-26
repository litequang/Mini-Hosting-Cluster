# MHC Full Installer TEST 0.3.5 — v0.3C.2 Restore Lab & Node Readiness

24/10/2026 — **LAB/TEST SOURCE**, chưa nghiệm thu trên Android thật. Kế thừa trực tiếp TEST 0.3.4; toàn bộ ZIP là bộ cài đầy đủ, không phải patch rời.

## Tính năng bổ sung

1. `mhc-full clone stage` niêm phong manifest SHA256 từng file sau khi kiểm tra snapshot nhận qua SSH và giải nén thành công. Đây chỉ là dấu vết phục hồi file, không phải chứng chỉ quyền Primary hoặc GTID checkpoint.
2. `mhc-full clone reverify-stage --confirm=REVERIFY_OFFLINE_STAGE`: hỗ trợ stage từ TEST 0.3.4 chưa có dấu niêm phong. Tạo lại bản extract **từ snapshot gốc đã được kiểm tra**, so sánh từng file rồi mới cấp dấu. Không ghi đè stage cũ; từ chối nếu dữ liệu khác.
3. `mhc-full clone readiness`: kiểm tra receipt, snapshot checksum, dấu niêm phong, cấu hình website, file WordPress/Static, SQL dump và số file Sheet/Sheet+. Xuất JSON. Luôn ghi rõ `standbyReady=false`, `haEligible=false` và những điều kiện thực tế còn thiếu.
4. `mhc-full clone prepare-lab --confirm=OFFLINE_RESTORE_LAB`: sao chép dữ liệu stage vào private offline lab (`~/hosting-clones/mhc-full/labs/...`) với checksum kiểm tra lại từng file; không đụng thư mục website đang chạy, DB, `.env` thật, runit hoặc Tunnel.
5. `mhc-full clone smoke-static SLUG`: phục vụ duy nhất index.html của **static site thuộc lab** trên HTTP `127.0.0.1` với cổng ngẫu nhiên, probe và tự đóng. Không mở HTTP public hay chạy PHP từ bản sao.
6. `mhc-full clone import-sql-lab SLUG --confirm=CREATE_NEW_LAB_DB`: lựa chọn riêng cho WordPress thử nghiệm. Tạo schema `mhc_restore_<slug>_<random>` mới hoàn toàn, user MariaDB riêng được cấp quyền **chỉ trên schema đó**, giải nén SQL theo luồng và đếm bảng; tắt `LOCAL INFILE` và chế độ lệnh tương tác client. Lưu metadata `PARTIAL_OR_UNVERIFIED` nếu gián đoạn; **không tự DROP hoặc retry**, không sửa cấu hình WordPress để chạy live. Đã test với client MariaDB mô phỏng, chưa thử DB thật.
7. `mhc-full clone lab-status`: kiểm lại manifest lab, phát hiện chỉnh sửa và hiển thị trạng thái SQL lab; không quảng cáo site/replica/HA sẵn sàng.
8. `install.sh --upgrade` nhận TEST 0.3.4 và cập nhật source-only trên thiết bị LAB đủ điều kiện; không migrate DB/site, không restart service.

## Chốt an toàn & hạn chế

- Không sử dụng TEST 0.3.5 trên **M51 hoặc X7b đang phục vụ**. Cần preflight/backup/rollback và nghiệm thu riêng.
- Không có Cloudflare changes, HA ARM, failover, lease, GTID, DB replication, automatic restore into active site, automatic WordPress `.env` rewrite hoặc chuyển traffic.
- Kiểm tra file/SQL là phục hồi offline. `import-sql-lab` tạo DB thật trên **máy LAB**, không được chạy nếu máy có DB cần bảo toàn; SQL từ nguồn vẫn phải được coi là nội dung có thể chứa lệnh bất ngờ. Cần backup ngay cả đối với máy thử nghiệm.
- Bản sao có thể chứa thông tin bí mật từ WordPress/TPP. Thư mục lab/receipt đặt quyền riêng; **chưa có mã hóa dữ liệu at rest**.
- Đóng gói thành công + test Linux không chứng minh PHP-FPM, MariaDB, WordPress, Termux:Boot hay recover trên Android hoạt động.
- `restore.sh sql-lab` của các bản cũ là đường phục hồi độc lập và không phải bước bắt buộc của clone flow mới. Ưu tiên `clone import-sql-lab` có user DB phạm vi hẹp khi nghiệm thu LAB.
