# v0.5B.2 — LAB witness deployment and write-gate preflight

## Phạm vi & điều kiện cứng

- Chỉ dùng 1 Cloudflare LAB Worker riêng, 1 SQLite-backed Durable Object namespace LAB, **không dùng zone/workers/route sản xuất** và **không gắn `monitor.thophuong.com`**.
- Chưa có kết nối với `mysqli`/MariaDB/Nginx/PHP/Thờ Phượng Pro, không có quyền cấp write token cho ứng dụng thật. `gate-check` là chốt kiểm tra *tại CLI LAB*, không phải enforce tại hệ thống web.
- Không chạy trên M51/X7b production hoặc Vsmart có website `demo`. Với Vsmart chỉ cập nhật source để đọc tài liệu/UI.
- Chỉ sau khi cả hai Android LAB độc lập nghiệm thu thật v0.4 mới triển khai all-write-path guard và fencing độc lập. DO lease một mình không chứng minh single writer.

## 1. Tạo Witness LAB riêng trên Cloudflare

Đọc mã và config: `reference/cloudflare-lab-witness/{worker.mjs,wrangler.toml}`. Chạy Wrangler trong thư mục này từ máy tính LAB. Không có lệnh tạo tài nguyên Cloudflare nào tự chạy từ bộ cài Termux.

```bash
cd reference/cloudflare-lab-witness
npx wrangler login
npx wrangler secret put LAB_ADMIN_TOKEN
npx wrangler secret put LAB_NODE_KEYS_JSON
npx wrangler deploy
```

`LAB_ADMIN_TOKEN`: chuỗi ngẫu nhiên dài ít nhất 32 ký tự, KHÁC mọi node token; không gửi vào chat/log. `LAB_NODE_KEYS_JSON`: JSON object ví dụ `{ "lab_A": "<random-48-chars>", "lab_B": "<different-random-48-chars>" }`, KHÔNG chèn token thực vào source repo. Chỉ cấp token cho thiết bị LAB tương ứng. Ràng buộc domain bằng Access/firewall nếu áp dụng; chú ý CLI phải hỗ trợ cơ chế xác thực đó. Không bật route tự động cho website production.

`wrangler.toml` sử dụng `[[migrations]] new_sqlite_classes`, tạo namespace riêng. Không sửa/đổi binding cũ. Với quyền dùng Worker phát sinh chi phí, kiểm tra hạn mức trước khi deploy.

Cloudflare DO `storage.kv` có đồng bộ đọc/ghi trên SQLite backend. Không có `await` giữa đọc–quyết định–ghi lease; `sync()` được gọi trước khi trả kết quả. Nếu restart, trạng thái trong storage vẫn được dùng. Đây là model code đã kiểm thử bằng store giả, **chưa kiểm chứng trên Cloudflare triển khai thật**.

## 2. Cấu hình CLI trên hai Android LAB *chuyên dụng*

Làm ở Termux node LAB đã cài TEST 0.5.0B2 và không có website production:

```bash
mkdir -p ~/.config/mhc-witness-lab
chmod 700 ~/.config/mhc-witness-lab
cat > ~/.config/mhc-witness-lab/client.json <<'JSON'
{"url":"https://YOUR-ISOLATED-LAB-WORKER.workers.dev/","clusterId":"lab-cluster","nodeId":"lab_A"}
JSON
chmod 600 ~/.config/mhc-witness-lab/client.json
# Đưa token từ secret manager vào node-token, tuyệt đối không chia sẻ giá trị token
chmod 600 ~/.config/mhc-witness-lab/node-token
~/mhc-full witness plan
~/mhc-full witness status
~/mhc-full witness gate-check
```

Trên node còn lại thay `nodeId=lab_B`, token khác. Dữ liệu file token **phải tồn tại trước khi chmod**, được tạo qua trình soạn thảo/secret manager an toàn, không qua history shell. Dùng `admin-token` chỉ trên node quản trị LAB độc lập cần bootstrap/freeze và giữ permission `0600`.

`status` đọc witness qua HTTPS; `gate-check` chỉ ra `labGatePass` cho **yêu cầu kiểm tra LAB cụ thể**, luôn trả `realWriteGateInstalled:false`. Không diễn giải `labGatePass` thành có quyền ghi MariaDB.

## 3. Lifecycle cố tình một chiều

- Admin (trên thiết bị LAB trống có admin token): `~/mhc-full witness bootstrap --confirm=ISOLATED_WITNESS_LAB_ONLY` — cấp **duy nhất lần đầu** cho node trong config, term=1, TTL 12 giây.
- Node chủ: `~/mhc-full witness renew --confirm=ISOLATED_WITNESS_LAB_ONLY` — trước tiên kiểm tra current lease rồi mới gia hạn cùng term. Không có daemon auto-renew. Sau 12 giây không gia hạn, lease tự chuyển FROZEN ở lần truy cập tiếp theo.
- Admin: `~/mhc-full witness freeze --confirm=ISOLATED_WITNESS_LAB_ONLY` — đóng băng vĩnh viễn, không có `unfreeze`, `promote`, `handoff`.
- Muốn một LAB run mới, **tạo cluster ID thử nghiệm mới** trong cùng LAB Worker thay vì xóa/ghi đè tình trạng lease đã đóng băng. Không dùng cách này để thay thế fencing của node cũ.

Các câu trả lời `UNAVAILABLE`/`DENIED`/`labGatePass:false` là **chặn**, không retry để vượt. Cố tình không cho takeover khi witness lỗi, mất mạng hoặc lease hết hạn mà fencing chưa được chứng thực.

## 4. API/UI và bảo mật

Panel **gốc localhost:9090** hiển thị metadata cấu hình client, không gọi mạng hay tiết lộ URL/node token; route `/api/mhc/witness` đòi session đăng nhập. Chỉ CLI gọi witness. Mỗi `verify` sử dụng nonce ngẫu nhiên và yêu cầu phản hồi trùng nonce; TTL phải nằm trong khoảng an toàn, request timeout 2.2s, TLS HTTPS, cấm redirect.

Một witness bền vững **không giải quyết** all-write-path fencing: ứng dụng, privileged DB connections, PHP, scheduled jobs, file sync, SSH hay truy cập LAN bỏ qua gate vẫn có thể ghi. Cloudflare outage cũng phải khiến từng đường ghi thật fail-closed; B2 chưa cài bất kỳ middleware/enforcement nào lên chúng.

## 5. Kiểm thử và chốt nghiệm thu

`node tests/lab-witness-b2.mjs .` chạy storage giả và worker fetch trong Node, **không tạo Cloudflare resources**. Tiếp theo cần kiểm thử trên DO thật trong tài khoản LAB, hai Android LAB riêng, mất Wi-Fi, token bị thu hồi, đồng hồ lệch, Worker restart, đường ghi bypass, watch-dog process chết và ingress fail-open. Không thể xác nhận `v0.5B` hoàn tất ở mức thực tế khi thiếu bằng chứng này.
