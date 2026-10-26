# MHC TEST 0.5.0C-PHYSICAL

Kế thừa toàn bộ TEST 0.5.0C-INTEGRATION; bổ sung **Physical LAB Signed Evidence**.

- `~/mhc-full physical-accept plan|challenge|keygen|capture|verify`.
- Ghi nhận GTID MariaDB thực và SHA-256 fixture từ từng Android LAB độc lập, ký Ed25519 với khóa riêng giữ trên node; kiểm tra public key fingerprint ghim ngoài băng, nonce chung, freshness 15 phút, hai phiên boot, server_id khác nhau, replica IO/SQL và dữ liệu mẫu.
- Không dùng chính chữ ký để cấp Primary: `canSwitchPrimary`, `canArmHA`, `canModifyRouting` luôn `false`. Chứng cứ không kết luận fencing, dữ liệu nghiệp vụ hoặc tính nguyên tử của DB + files.
- Guard: chặn production footprint, HA, partial install, website đã đăng ký, sai Termux/aarch64 khi thu thực tế; chặn symlink/path traversal trong fixture và file JSON.
- Installer source-only và launcher nhận phiên bản C-PHYSICAL; giữ nguyên dịch vụ và Panel gốc 9090, không thay đổi DNS/Cloudflare.
- Bổ sung test giả mạo chữ ký, thay thế public key, trùng boot, trùng danh tính/DB server ID, GTID không khớp, replica IO down, thiếu read-only, symlink và checksum dữ liệu.

**Chưa thực thi trên hai Android LAB thật**. Không có live switchover executor. M51/X7b production không được sửa.
