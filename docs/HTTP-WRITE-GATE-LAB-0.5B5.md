# TEST 0.5.0B5 — Quy trình HTTP Write Gate LAB cách ly

**Yêu cầu:** Một môi trường TEST sạch, không phải M51/X7b, không phải Vsmart đã có site `demo`, không tồn tại marker production/HA hoặc website đã đăng ký. Không triển khai gateway qua Nginx, Cloudflare, Tunnel, LAN/WAN hoặc Internet.

## Mục đích

Kết nối một yêu cầu HTTP **thực** tới bộ ghi fixture (cùng các chốt witness hai lần đã có ở B4). Không chỉ mô phỏng tác vụ CLI. Gateway **chỉ** cho phép ghi 4 fixture vào `~/mhc-writegate-lab`, không chạm bất kỳ file website hay database nào.

## Cấu hình mẫu (chỉ trên LAB độc lập)

1. Dựng Cloudflare Durable Object witness **LAB** riêng theo `docs/CLOUDFLARE-WITNESS-LAB-0.5B2.md`, cấu hình `~/.config/mhc-witness-lab/client.json` và `node-token` với quyền 0600; không chia sẻ token trong chat hay log.
2. Khởi tạo fixture LAB: `~/mhc-full write-gate init --confirm=ISOLATED_CANARY_WRITE_ONLY`. Không khởi tạo nếu đã có nội dung website.
3. `~/mhc-full http-gate plan` kiểm giới hạn.
4. `~/mhc-full http-gate init --confirm=ISOLATED_HTTP_WRITE_GATE_LAB_ONLY`. Gateway tạo file `~/.config/mhc-lab-http-write-gate/http-token` với quyền 0600; **không in hoặc tải file token lên ChatGPT**.
5. Chạy thủ công trong terminal riêng: `~/mhc-full http-gate serve --confirm=ISOLATED_HTTP_WRITE_GATE_LAB_ONLY`. Listener chỉ có ở `127.0.0.1:19096`, không có dịch vụ tự chạy sau reboot.
6. Trong cùng Termux, gửi thử 1 file giả lập bằng curl:

```bash
TOKEN="$(cat "$HOME/.config/mhc-lab-http-write-gate/http-token")"
printf 'MHC LAB HTTP fixture only\n' | \
  curl --fail-with-body -sS --max-time 10 \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @- 'http://127.0.0.1:19096/v1/lab/preview'
unset TOKEN
```

Thành công trả HTTP 201 với sha256 và tên file ngẫu nhiên dưới `~/mhc-writegate-lab/static-preview/`. Không sử dụng dữ liệu khách hàng/Sheet thật. Nếu witness không xác minh được lease, trả 503 và không công bố file.

## Các route và giới hạn

| Route | Fixture | Giới hạn |
|---|---|---|
| POST `/v1/lab/canary` | Canary `.bin` | 64 KiB |
| POST `/v1/lab/preview` | Static preview `.html` | 64 KiB |
| POST `/v1/lab/upload-fixture` | Fake upload `.bin` | 256 KiB |
| POST `/v1/lab/job-receipt` | Offline job receipt `.json` | 8 KiB |
| GET `/v1/lab/health` | Thông tin LAB, **không verify lease** | Không ghi |

Mọi route cần Bearer token. Không có API cấp token, không có route SQL, `DELETE`, deploy, file path tùy ý hoặc promote. Từ chối `Origin` (browser), `Transfer-Encoding`, request sai kiểu và writer đồng thời. Dữ liệu được giới hạn dung lượng, tên file random, không ghi đè; không có `Access-Control-Allow-Origin`.

## Mất mạng / an toàn

- Witness chết, token sai, epoch đổi giữa 2 phép kiểm → HTTP 503, không có file mới (đã test với witness giả lập).
- Không in token trong biên nhận, Panel 9090 chỉ cho biết có file cấu hình hay chưa, không xác nhận gateway đang chạy.
- Đang chạy ứng dụng thật hoặc dịch vụ web trên node cũ? **Không chạy HTTP LAB gateway.** Presence of registered sites/production markers blocks operation.
- Kiểm tra preflight không thể ngăn mọi tác nhân khác ghi trực tiếp bằng root/Termux shell. Witness và gate HTTP **không thực hiện fencing MariaDB, Nginx, PHP, backup, SSH/shell hay Cloudflare**.
- Hai lần kiểm witness còn race sau lần kiểm cuối; chưa chứng minh atomic commit hay chống split-brain. Không dùng kết quả ở đây để cấp quyền Primary.

## Nghiệm thu tiếp theo để làm v0.5C

Cần dựng hai **Android LAB thật** độc lập, chạy v0.4 GTID+file replication và Cloudflare witness LAB có kiểm tra mất mạng, làm rõ fencing của mọi thực thể có thể ghi; sau đó mới xét chuyển vai trò thủ công. **Không áp dụng trên M51/X7b production.**
