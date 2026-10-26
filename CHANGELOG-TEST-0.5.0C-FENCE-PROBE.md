# MHC TEST 0.5.0C-FENCE-PROBE

- Kế thừa toàn bộ code TEST 0.5.0C-DRILL (GTID, file delta, SSH field coordinator, 3-phase drill, witness, PHP/MariaDB/HTTP LAB, Panel 9090).
- `mhc-full fence-probe plan|capture|verify`: active localhost HTTP canary POST, 3 pha: source-denied, replica-allowed, witness-denied; chủ động chặn thành viên không thuộc LAB, website đang phục vụ và file token không an toàn.
- Yêu cầu đáp ứng thực HTTP 503 (explicit denial) / 201 (đúng checksum) / 503. Không coi timeout hoặc cổng đóng là fencing thành công.
- Mỗi pha tạo envelope Ed25519, kèm nonce, body hash, timestamp, boot fingerprint, cùng challenge, ghi bằng chế độ `wx`, quyền `0600`. Verifier áp dụng khóa public pin ngoài băng, chống sửa chữ ký, replay, phase sai, đồng hồ và thứ tự.
- Bổ sung nhóm test HTTP thực trên loopback (mock witness/response), thêm kiểm tra tương thích marker mới ở installer/enrollment/clone/readiness.
- Bổ sung mô tả Fence Probe vào Panel **gốc 9090** ở chế độ chỉ đọc. Không tạo Panel khác hoặc endpoint ghi mới trên Panel.
- Không triển khai witness Cloudflare, không ghi DB production, không đổi route/Primary hoặc HA; **chưa nghiệm thu hai Android thật**.
