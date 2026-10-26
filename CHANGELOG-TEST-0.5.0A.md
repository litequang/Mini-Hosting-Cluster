# MHC Full Installer TEST 0.5.0A — Changelog

Nền mã nguồn: `MHC-Full-Installer-TEST-0.4.0D.zip`. Bước roadmap: **v0.5A — Manual Switchover Rehearsal**, *chưa phải chuyển Primary thật*.

## Mới
- Công cụ `mhc-full switchover sample|plan|status|start|advance|abort` dùng riêng cho LAB.
- Kiểm chứng sơ đồ dữ liệu, nodeId/serverId khác nhau, độ mới của bằng chứng (5 phút), cờ ngừng ingress/DB read-only/drain, backup và restore drill, GTID source/target giống nhau, SHA256 filesystem giống nhau, witness/term và chốt độc lập do người dùng khai, tuyến LAB cách ly, và yêu cầu bằng chứng nghiệm thu v0.4 trên Android.
- Nhật ký riêng 0600, cập nhật qua temp + rename, hash-chain cho các bước mô phỏng quiesce → catchup → lease → route → postcheck; từ chối thao tác sai thứ tự, thay đổi evidence và ghi đè rehearsal cũ. Cho abort ngay cả khi evidence đã lỗi hoặc quá hạn.
- Giao diện **Hosting Panel gốc 9090** được bổ sung thông tin diễn tập chỉ đọc tại mục Cluster, qua API cần session login; cấm dùng báo cáo để kết luận quyền Primary/HA.
- Hỗ trợ `--upgrade` chỉ cập nhật mã từ TEST 0.4.0D và giữ lại cấu hình/website/DB trên Vsmart LAB. Không ARM, không gọi API Cloudflare, không đổi route, không cấp lease.

## Những điều chưa làm
- v0.4 GTID/file E2E **chưa nghiệm thu hai Android LAB thật**.
- Không có fencing toàn bộ đường ghi, lease/term được chứng thực tại edge, Cloudflare route switch, quyền Primary hay rollback runtime.
- Không có tự động failover. Các cờ trong worksheet đều **do người vận hành khai**, không phải bằng chứng được chứng thực; `simulatedGatePass` không cấp quyền nào.

## Triển khai
- Chỉ cài/nâng cấp TEST trên Vsmart LAB hoặc máy LAB sạch. Không dùng `--install`, `--upgrade`, `hosting-panel apply` trên M51/X7b production.
- Hướng dẫn: `docs/MANUAL-SWITCHOVER-LAB-0.5A.md` và `MHC-TEST-0.5.0A-HUONG-DAN.md`.
