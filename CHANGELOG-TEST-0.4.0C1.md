# MHC Full Installer — TEST 0.4.0C1

**Bước roadmap:** v0.4C.1, delta file LAB, sau B4 (v0.4B GTID LAB chưa nghiệm thu Android thật).

- Thêm CLI `mhc-full file-sync manifest source|replica`, `bundle BASELINE_FILE`, `verify BUNDLE_ID`, `stage BUNDLE_ID`, `status`.
- Tạo manifest SHA256 và bundle chỉ gồm file mới/sửa. File xóa được ghi là tombstone, xử lý **chỉ trong candidate offline**.
- Chặn symlink, special file, dotfile, tên nhạy cảm, manifest không hợp lệ, data divergence; hạn mức file, kích thước và đường dẫn. 0600 metadata, 0700 thư mục.
- Candidate kiểm lại SHA256 của toàn bộ tập file sau khi dựng; không ghi đè replica cũ; từ chối sử dụng lại ID.
- Hosting Panel gốc 9090 (Cluster) hiển thị tổng số manifest/bundle/candidate từ metadata chỉ đọc, không lộ file path hoặc SHA.
- Giữ các chức năng B4/WordPress/Monitor/backup từ source cũ; cập nhật marker/điều kiện chấp nhận version của node enrollment/clone/restore đã bị bỏ sót ở phiên bản trước.
- Không thay đổi M51/X7b hoặc Vsmart runtime, không bật replication write, không tự chuyển file qua SSH, không tự apply tới website, không HA.

**Giới hạn:** Gói delta có SHA256 nhưng chưa có chữ ký/mã hóa tầng ứng dụng. Phải chuyển qua SSH host key đã ghim. Không giữ đầy đủ metadata executable/ACL và chưa gắn GTID/checkpoint. Đừng dùng cho production.
