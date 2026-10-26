# MHC TEST 0.5.0B2 — Cloudflare Durable Object Witness LAB

Tiếp tục v0.5B.1 offline fault model, thêm **v0.5B.2 witness bền vững theo từng cluster**; **không tích hợp quyền ghi sản xuất**.

- `reference/cloudflare-lab-witness/worker.mjs`: Cloudflare Worker + SQLite-backed Durable Object (`LabWitness`), trạng thái `EMPTY → LEASED → FROZEN` lưu qua `ctx.storage.kv`, `storage.sync()` trước phản hồi. `grant-initial` chỉ admin LAB, một lần; `renew` chỉ node đang sở hữu và epoch đúng; `verify` theo nonce; `freeze` vĩnh viễn; mất hạn/đồng hồ lùi → `FROZEN`. **Không có API promote/reset/failover**.
- Authorization ở Worker: mật khẩu node riêng từ `LAB_NODE_KEYS_JSON`, quản trị từ `LAB_ADMIN_TOKEN`; không trả token, node ID, host URL. Từ chối role sai, nonce sai, body lớn, hành động sai.
- `bin/lease-witness-lab.mjs`: `mhc-full witness plan|status|gate-check|bootstrap|renew|freeze`; token chỉ đọc từ file `0600` trong thư mục `0700`; HTTPS bắt buộc, không redirect, timeout 2.2 giây, nonce 128 bit, kiểm epoch/TTL phản hồi; **fail closed** nếu lỗi/timeout/witness offline.
- Hai lệnh thay đổi (`bootstrap`, `renew`, `freeze`) chặn node có dấu vết production/HA, website đăng ký; yêu cầu `--confirm=ISOLATED_WITNESS_LAB_ONLY`; mọi hành động chỉ trên service witness TEST độc lập.
- Panel gốc 9090 thêm `/api/mhc/witness` (đăng nhập mới xem) và phần `Witness LAB` ở Cluster; **chỉ kiểm tra file cấu hình có tồn tại, không đọc token hay gọi mạng**. Không thêm Panel khác.
- Mở rộng marker version để node enrollment, clone và readiness vẫn hoạt động trên các bản 0.4D/0.5/B2 (khắc phục bất nhất cũ).
- `tests/lab-witness-b2.mjs`: 61 kiểm tra với storage và mạng giả lập, bao gồm grant đồng thời, lease expiry, token sai, stale term, mất witness, replay nonce, gia hạn, freeze bền vững qua khởi động lại.

### Không có trong B2

- Không triển khai Worker vào tài khoản Cloudflare, không tạo Durable Object thực trên Internet; không có chi phí Cloudflare phát sinh từ file ZIP.
- Không tích hợp gate vào mọi đường ghi MariaDB/PHP/Nginx/file, chưa có host fencing, chưa kiểm chứng độc lập node nguồn dừng ghi, không chứng minh chống split-brain thực tế.
- Không nghiệm thu 2 Android LAB thật, không switchover/failover, không chạm M51/X7b/Cloudflare production.

Tiếp theo: **v0.5B.3 — Term Gate thực thi tại tất cả đường ghi + fencing độc lập**, chỉ sau khi có hai node LAB hoàn toàn cách ly và đã nghiệm thu GTID/file v0.4.
