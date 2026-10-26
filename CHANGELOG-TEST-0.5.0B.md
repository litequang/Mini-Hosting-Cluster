# MHC Full Installer TEST 0.5.0B — Fencing & Lease Fault Lab

Dựa trên TEST 0.5.0A, theo đúng roadmap **v0.5B.1** (chỉ mô hình offline).

- Bổ sung mô hình epoch/lease/fencing fail-closed trong `bin/fencing-lease-lab.mjs`, với 29 kịch bản lỗi, bước cấp term, renew, release, expire, independent fence ACK và chuyển term mới **chỉ trên trạng thái giả lập**.
- Bổ sung `~/mhc-full fencing plan|scenarios|status|rehearse` và ngăn rehearsals khi có dấu vết hệ thống production/HA, cài dở hoặc website đang đăng ký.
- Bản `rehearse` trên LAB độc lập chỉ ghi báo cáo ở `~/mhc-fencing-lab/report.json`, quyền 0600, không ghi đè; Panel 9090 đọc kết quả đã lọc, chỉ sau đăng nhập.
- 351 assertion trong test mới, bao gồm tổ hợp write gate bị lỗi, clock rollback, lease expiry, witness offline, stale term/replay, độc lập fencing, chưa bắt kịp dữ liệu và cấm promotion khi nguồn cũ chưa fence.
- Giữ Panel 9090, SSH/WordPress/Nginx/MariaDB/website/backup, không tạo Panel mới, không đổi Cloudflare, không ARM HA.
- Nâng cấp source-only từ TEST 0.5.0A với rollback mã; cập nhật nhãn version ở launcher, acceptance report, Panel. Vẫn không dùng trên M51/X7b.

**Chưa hoàn thành:** 2-device GTID/file E2E acceptance, lease service xuyên mạng/transactional witness, all-write-path fencing thật, automated production failover, chaos tests. Không có bằng chứng bảo đảm không split-brain trong môi trường Android thật.

Xem `docs/FENCING-LEASE-LAB-0.5B.md`.
