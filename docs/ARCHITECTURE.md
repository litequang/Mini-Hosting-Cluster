# ARCHITECTURE — MHC

Kiến trúc hướng đích và ranh giới source/runtime đối chiếu 27/10/2026. Bằng chứng triển khai nằm ở [LIVE-PROGRESS.md](LIVE-PROGRESS.md); [audit tiếp nhận](CODEX-RESUME-AUDIT-2026-10-27.md) ghi các khoảng trống.

```text
Internet: panel.giaouoc.com           Website LAB được allowlist
           | Access + Tunnel                  | Tunnel
           v                                  v
       Panel 9090 trên node đang nhận route    Web/DB node phục vụ
           |                                  |
           +---- Cloudflare Worker / DO -------+
                revision/epoch/membership
                Monitor/pending/DNS journal
                     ^       ^       ^
                  Agent A  Agent B  Agent N
                  Panel A  Panel B  Panel N
```

Mọi node có original Panel 9090 và node Agent. Authority chung độc lập điện thoại, dùng DO transaction/CAS và audit; không bầu riêng trên từng Android. Membership/heartbeat/Monitor chung đã quan sát trên Vsmart và XZ3. P3 DNS journal/Panel recovery có source, bản Cloudflare P3/Cron chưa xác minh. Sơ đồ không chứng nhận website/Panel đã tự chuyển giữa hai node.

## Quyền và luồng điều khiển

- Local Panel chỉ loopback/SSH forwarding, giữ password khôi phục. Remote dùng Tunnel + Cloudflare Access Allow policy và origin RS256/JWKS/issuer/AUD/time; JWT đã xác minh tạo admin session SSO, binding với token, cookie Secure/HttpOnly/SameSite và CSRF/Origin cho mutation.
- Panel → shared authority bằng credential riêng vai panel; Agent heartbeat bằng credential agent. Status/history không cấp writer. Authority unreachable thì fail-closed, hiển thị lỗi cụ thể, không rơi về controller local tự bầu.
- Monitor bounded/sanitized, không CPU/SSID/IP/process args, history 12h. Metadata snapshot `recordedAt` là thông tin ghi nhận, `verified:false` không chứng minh restore hoặc độ mới giao dịch.
- Chuẩn bị `begin/abort` chỉ tạo/hủy pending qua revision/idempotency; P3 LAB `route/route-resume/complete` ghi journal, đổi DNS allowlist và nhận operator attestation. `declaredPrimary` là record LAB, không phải writer lease; `writeLeaseGranted:false`.

## Panel recovery và Primary

Website và Panel là hai route độc lập. Thông thường Panel chung theo node Primary đã xác minh; khi route Panel incumbent mất heartbeat đủ lâu, source Cron/DO có thể chọn standby có telemetry/Panel/Tunnel khỏe và đổi riêng CNAME Panel nếu được opt-in. Site/DB/quyền ghi không đổi, không tự failback. DNS GET đúng đích không chứng minh origin/Access/HTTP khả dụng; cần hậu kiểm từ Internet.

Luồng Primary hoàn chỉnh hướng đích: `intent → preflight/data warning → fence old writer → activate candidate → route → HTTP/site/DB proof → commit → quarantine rejoin`. Hiện chưa có executor kích hoạt toàn bộ candidate, fencing mọi đường ghi, signed HTTP node proof hoặc conditional rollback được nghiệm thu. Mất heartbeat có thể là partition; không suy ra writer đã tắt. Không bật automatic writer promotion khi chưa giải quyết các gate này.

Dữ liệu lệch được chấp nhận trong MVP với backup/restore thủ công và cảnh báo RPO. Snapshot khác nhau không thay thế fencing. Auto P4 phải dùng lại pipeline manual P3, health/snapshot đã xác minh/cooldown và rejoin standby; không triển khai trước P3 hai LAB đạt. M51/X7b production cần kế hoạch migration/backup/duyệt riêng.

## Release và domain automation

Managed source và live Panel là hai cây riêng; package source-only thống nhất lấy toàn bộ managed bin cùng 7 live Panel assets, JWT/bridge/index/helpers, launcher và một canonical Boot entry từ một commit. Manifest SHA-256 và syntax được kiểm trước dừng management process. Transaction giữ file/mode/absence, service/boot backup, journal/version record; apply và rollback restart/health cả Panel lẫn Agent, kiểm PID mới/fresh heartbeat/asset SHA. Identity/secrets/admin/database/website nằm ngoài write allowlist. Gói này thay updater 13 file cập nhật một phần; trạng thái rollout thực tế ở LIVE-PROGRESS. Boot log/marker không thay test reboot thực.

P2.5 hướng đích: zone read allowlist → chọn hostname → tạo local site/nginx → DNS/Tunnel ingress → HTTPS health/audit/rollback, token quyền tối thiểu ở control plane. Nút tạo website hiện chưa tự publish Cloudflare. Không cần Android IP tĩnh hoặc mua Load Balancing để bắt đầu; chọn route adapter theo quyền/giới hạn thực tế, giữ các hostname production ngoài allowlist.
