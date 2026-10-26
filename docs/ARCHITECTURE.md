# ARCHITECTURE — MHC hướng đích

```text
                                Internet
                 panel.thophuong.com   web.thophuong.com
                          |                 |
              Cloudflare Tunnel/Access + route manager
                          |                 |
                +---------v-----------------v-------+
                | Durable Object cluster authority   |
                | atomic epoch/revision, Primary,    |
                | membership, routing intent, audit  |
                +------------------+----------------+
                        ^           ^           ^
                agent + panel  agent + panel  agent + panel
                    Node A       Node B        Node N
                   9090         9090          9090
                Nginx/PHP/DB   Nginx/PHP/DB   Nginx/PHP/DB
```

Hình là **kiến trúc đề xuất, chưa triển khai**. Không ép tính năng route phải mua Cloudflare Load Balancing: Codex phải thẩm định các lựa chọn (Worker router, DNS/tunnel route, LB có phí), chi phí, độ trễ, tính đơn giản, chính sách truy cập trước khi quyết định.

## Cấp quyền và luồng nghiệp vụ
- Mỗi node cài cùng build, Panel 9090, agent, dịch vụ hosting phù hợp và local state. Thống kê không đồng nghĩa vai trò Primary.
- Control plane là một authority chung bền vững, không nằm duy nhất trên Primary. Các lệnh bắt đầu từ Panel A/B/N đều gửi tới authority này, RBAC + CSRF + Cloudflare Access nếu remote.
- Authority cập nhật epoch/revision nguyên tử; mỗi tác vụ chuyển Primary ghi `intent -> preflight -> (fence old) -> route -> verify -> commit -> rejoin/quarantine` và có idempotency key/crash replay.
- Node agent định kỳ nhận role, theo dõi web/DB/SSH/storage, báo backup manifest và dữ liệu mới nhất **được kiểm chứng**; không tin heartbeat đơn lẻ để suy đoán node offline.
- Auto election chọn trong các node có sức khỏe và dữ liệu chấp nhận được; node cũ rejoin mặc định standby/quarantine, phải được reprovision/restore/checksum trước khi phục vụ. Không bao giờ tự failback.
- Nếu không thể ngăn hai node ghi đồng thời, không gắn nhãn safe HA. Chế độ best-effort mất dữ liệu/partition là opt-in LAB với cảnh báo rõ; production phải chặn đường ghi/route trực tiếp và có authority.
- Panel public và website public là **hai kênh khác nhau**; Panel chung phải sống khi Primary chết. Panel local trên mỗi node truy cập LAN/SSH tunnel, remote qua Cloudflare Access/JWT + Panel password.
- Có thể bỏ node-specific hostnames trong bản MVP; chỉ thêm tùy chọn sau để cứu hộ/debug, cùng Access.
- Dữ liệu giữa node có thể lệch và không cần replication liên tục trong bản đầu. Backup và restore là trách nhiệm người dùng; hệ thống ghi rõ thời điểm xác minh được.

## Giới hạn hiện tại
Checkpoint hiện hành **không** có multi-panel authority. local manual-primary/auto-primary đã có source nhưng còn dựa trên controller đơn, các bài test giả lập không tương đương nghiệm thu hai Android thật.


## Bổ sung P2.5 — Cloudflare domain automation và Panel resilience (26/10/2026)
- `Zone discovery (read-only)` từ token theo allowlist account/zone -> chọn `subdomain + base domain` -> verify không trùng -> tạo site/Nginx + test localhost -> cập nhật DNS CNAME/Tunnel ingress đúng hostname -> HTTPS healthcheck và audit/rollback. URL/Zone ID đã được xác minh trước khi mutation, không giữ DNS edit token trên các node Standby. Nếu nhiều zone/token, phải cô lập quyền theo profile.
- Named Tunnel đưa HTTP tới Nginx trên node; không dùng public Android IP. Cập nhật CNAME/ingress cấu hình của **Tunnel hiện có**, không thay tràn lan chính sách Access hoặc bản ghi đã tồn tại. Wildcard là opt-in, tránh xung đột.
- `panel.giaouoc.com` là admin ingress khác website, có tuyến hồi phục vào một node Standby đủ quyền nếu Primary offline. Shared Authority độc lập giữ node-role và route intent; redirect Panel không tự mở writer. Phần routing/activation vẫn chưa triển khai.
