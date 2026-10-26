# Quy trình triển khai MHC v1.0 (an toàn, hai giai đoạn)

## Sơ đồ

```
                   pro.thophuong.com
                         |
             Cloudflare routing Worker
               /                    \
   x7b-origin.<domain>        m51-origin.<domain>
         |                             |
   distinct Cloudflare Tunnel   distinct Cloudflare Tunnel
         |                             |
 X7b nginx:8080 -> gate:3070 -> Node:3000 <- gate:3070 <- nginx:8080 M51
                     ^                 ^
        Termux MHC agents ---> Durable Object arbiter <--- Termux MHC agents
                                 (lease/term)
```

At most one lease is issued at a time by the Durable Object. A separate gate on each phone rejects unleased requests. The M51 and X7b origin hostnames MUST NOT be the public `pro` hostname and must require the secret header; otherwise access can bypass fencing.

## Giai đoạn A: tạo control plane (KHÔNG đổi production)

PC Windows PowerShell với Node.js, npm, có tài khoản Cloudflare quản lý domain:

```powershell
cd "$env:USERPROFILE\Downloads\MHC-v1.0\coordinator"
npm install
npx wrangler login
npx wrangler deploy  # deploy lần đầu để tạo Durable Object, CHƯA gắn public route
npx wrangler secret put MHC_ADMIN_TOKEN
npx wrangler secret put MHC_NODE_TOKENS
npx wrangler secret put MHC_EDGE_SECRET
npx wrangler secret put MHC_ORIGINS_JSON
npx wrangler deploy
```

Tokens tự tạo ngẫu nhiên độc lập, tối thiểu 32 bytes, bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Đừng gửi lên chat, đừng commit mã bí mật.**

`MHC_NODE_TOKENS` secret phải là JSON có **Node IDs thực tế**. Ví dụ (giá trị minh hoạ, thay toàn bộ):

```json
{"M51_NODE_UUID":"TOKEN_M51","534d051b-b9c2-46bb-bbc1-94e4f9328bb1":"TOKEN_X7B"}
```

`MHC_ORIGINS_JSON` là JSON, hostname nguồn **riêng biệt, không phải `pro.thophuong.com`**:

```json
{"M51_NODE_UUID":"https://m51-origin.thophuong.com","534d051b-b9c2-46bb-bbc1-94e4f9328bb1":"https://x7b-origin.thophuong.com"}
```

Cấu hình `MHC_PUBLIC_HOST` trong `[vars]` ở `wrangler.toml` CHỈ sau khi cả hai source Tunnel được bảo vệ và kiểm tra. Đường dẫn Cloudflare Worker route đến `pro.thophuong.com/*` phải được cấu hình trong Cloudflare Dashboard. Đường `/__mhc/admin` phải truy cập qua địa chỉ Worker kiểm soát riêng, không phải domain phục vụ app. Nếu chưa làm xong, **chưa cho chuyển public ingress**.

Cluster ID đã điền sẵn từ MHC hiện tại: `ee3ce620-43ae-43a8-907b-c69602802a1a`. Đây là **trạng thái Durable Object mới**; không tự động đọc state trên hai node MHC v0.2. Cần bootstrap một lần. Node ID X7b đã biết, nhưng ID đầy đủ của M51 cần lấy từ `~/mhc status --remote` trên M51, không đoán.

Sau khi deploy Worker, kiểm tra `https://<worker>.workers.dev/__mhc/healthz`; kiểm tra `/__mhc/admin` hiện giao diện; API yêu cầu ADMIN token. Để chạy control CLI trên PC:

```powershell
$env:MHC_CONTROL_URL = "https://<worker>.workers.dev"
$env:MHC_ADMIN_TOKEN = "<ADMIN_TOKEN>"
node ..\tools\control.mjs status
node ..\tools\control.mjs bootstrap "<M51_NODE_UUID>"
node ..\tools\control.mjs prefer "<M51_NODE_UUID>"
```

## Giai đoạn B: cài agent vào cả hai điện thoại (shadow mode)

PowerShell, chuyển ZIP đến **cả hai máy**:

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-v1.0-staged-upgrade.zip" u0_a288@192.168.1.43:~/
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-v1.0-staged-upgrade.zip" u0_a210@192.168.1.35:~/
```

**Trên từng Termux** (chạy một máy một lần). Trước khi cài, kiểm tra có MHC cũ nào đang chủ động bật/tắt `mini-web` và Tunnel hay không; phải loại bỏ khả năng hai agent cùng điều khiển trước khi ARM:

```bash
unzip -n ~/MHC-v1.0-staged-upgrade.zip -d ~
bash ~/MHC-v1.0/tools/install-agent.sh
sv-enable mhc-v1-agent
sv-enable mhc-v1-gateway
sv up mhc-v1-agent
sv up mhc-v1-gateway
sv status mhc-v1-agent mhc-v1-gateway
bash ~/MHC-v1.0/tools/health-check.sh
curl -s http://127.0.0.1:3070/__mhc/healthz
```

Bộ cài hỏi Node ID, Worker URL, node token riêng của máy và shared edge secret. Chúng nằm trong `~/mhc-v1/config.json` quyền 0600. **Mặc định `armed:false`**, không thay đổi website đang chạy, không thay đổi existing `~/mhc`.

**LƯU Ý quan trọng:** phiên bản v1 dùng cổng 3070; nếu đã có dịch vụ tại cổng này, phải giải quyết xung đột trước khi kích hoạt.

Trên cả M51 và X7b kiểm tra GTID **không thay đổi DB**:

```bash
bash ~/MHC-v1.0/tools/replication-preflight.sh
```

Đối chiếu server_id, log_bin, read_only, show slave status, GTID. Nếu chỉ có snapshot, không được bật auto failover có ghi.

## Giai đoạn C: cấu hình routing, cutover có bảo trì

Các điều kiện BẮT BUỘC:

- Tạo **hai Cloudflare Named Tunnels độc lập** với hai ingress hostnames `m51-origin...` và `x7b-origin...`; mỗi Tunnel gọi `http://127.0.0.1:8080` trên máy tương ứng. Không tái dùng một token Tunnel cho cả hai.
- Nginx trên mỗi máy vẫn dùng upstream cũ `127.0.0.1:3000` cho tới thời điểm cutover. Gateway 3070 đã khởi chạy và từ chối khi chưa có lease.
- Mỗi request production bắt buộc đi qua Worker -> origin Tunnel -> Nginx -> gateway, không phải direct Node hoặc direct legacy Tunnel.
- Phải thử Worker HTTP, app login, cookies, API auth, upload Sheet, websocket và redirect trên môi trường staging. Cấu hình X-Forwarded-Host theo ứng dụng thực tế.
- Bản backup off-device có checksum, kế hoạch rollback, dữ liệu X7b đồng bộ theo chiều đúng, máy M51 vẫn có dữ liệu chính.

Tạo file candidate Nginx, chỉ kiểm tra cú pháp:

```bash
bash ~/MHC-v1.0/tools/prepare-nginx.sh
```

**Chỉ khi cutover có bảo trì**, và routing Worker + Tunnels đã sẵn sàng:

```bash
MHC_CONFIRM_CUTOVER=PUBLIC_WORKER_ROUTING_READY bash ~/MHC-v1.0/tools/prepare-nginx.sh --apply
node ~/MHC-v1.0/tools/set-armed.mjs arm CUTOVER_CONFIRMED
```

Sau đó từ PC xác minh M51 là primary với lease term và healthy; X7b là standby. Chỉ chính M51 được trả HTTP 200 qua Worker. Không bật cả `mini-web` và raw named-tunnel công khai song song ngoài gate.

**Rollback**: Dừng routing Worker, quay route/tunnel cũ về M51 và bản backup Nginx cũ sau khi chắc chắn X7b không phục vụ viết; disarm mỗi agent bằng `node .../tools/set-armed.mjs disarm`. Không tự rollback DB sau khi X7b từng phục vụ writes mà chưa đối chiếu dữ liệu.

## Điều khiển sau khi cutover

```powershell
node ..\tools\control.mjs status
node ..\tools\control.mjs mode manual
node ..\tools\control.mjs prefer "<M51_NODE_UUID>"
node ..\tools\control.mjs handoff "<X7B_NODE_UUID>" DATA_VERIFIED
node ..\tools\control.mjs mode auto
node ..\tools\control.mjs strategy preferred   # default: M51 ưu tiên
# Hoặc sau khi đã thu đủ telemetry cả 2 máy: node ..\tools\control.mjs strategy score
# Auto will STOP unless the recipient proves GTID readiness and risky mode is explicitly acknowledged.
node ..\tools\control.mjs risky on I_ACCEPT_POSSIBLE_DATA_LOSS
node ..\tools\control.mjs risky off I_ACCEPT_POSSIBLE_DATA_LOSS
# Only after old-primary data resynchronized:
node ..\tools\control.mjs rejoin "<M51_NODE_UUID>" DATA_REJOIN_VERIFIED
node ..\tools\control.mjs failback on
```

**Warning:** `risky on` permits possible data loss on async replication. For zero-data-loss requirement, keep risky OFF, use strict/manual with validated GTID handoff. `handoff DATA_VERIFIED` is a human assertion, not an automated correctness proof.

## Điều tra khi lỗi

```bash
sv status amh-panel nginx mysqld mini-web named-tunnel mhc-v1-agent mhc-v1-gateway
tail -n 40 "$PREFIX/var/log/sv/mhc-v1-agent/current"
tail -n 40 "$PREFIX/var/log/sv/mhc-v1-gateway/current"
cat ~/mhc-v1/lease.json
curl -s http://127.0.0.1:3070/__mhc/healthz
```

If cloud service cannot be contacted, HTTP 503 and stopped app are **intended safety behavior**, not a successful automatic failover. Fix network/replication and verify lease state before manual force recovery.

## An toàn khi đồng tồn tại MHC v0.2

`~/mhc` và trạng thái cluster cũ không bị ghi đè, nhưng nếu v0.2 có dịch vụ đổi vai trò thật, **KHÔNG arm v1.0 đồng thời**. Kiểm tra runit/cron/boot scripts và vô hiệu hoá tác nhân điều khiển vai trò cũ trong cửa sổ bảo trì, sau khi đã xác định đúng tên dịch vụ (không xoá dữ liệu cũ). MHC v1.0 không tự suy diễn rằng nhãn `primary/standby` từ v0.2 là bảo đảm fencing.
