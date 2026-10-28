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

Mọi node có original Panel 9090 và node Agent. Authority chung độc lập điện thoại, dùng DO transaction/CAS và audit; không bầu riêng trên từng Android. Membership/heartbeat/Monitor dùng cùng authority. P3.2 có journal tuyến read-only và Cron recovery riêng Panel; trạng thái triển khai/nghiệm thu thực chỉ ở LIVE-PROGRESS. Sơ đồ không chứng nhận safe writer Primary hoặc chuyển production.

## Quyền và luồng điều khiển

- Local Panel chỉ loopback/SSH forwarding, giữ password khôi phục. Remote dùng Tunnel + Cloudflare Access Allow policy và origin RS256/JWKS/issuer/AUD/time; JWT đã xác minh tạo admin session SSO, binding với token, cookie Secure/HttpOnly/SameSite và CSRF/Origin cho mutation.
- Panel → shared authority bằng credential riêng vai panel; Agent heartbeat bằng credential agent. Status/history không cấp writer. Authority unreachable thì fail-closed, hiển thị lỗi cụ thể, không rơi về controller local tự bầu.
- Monitor bounded/sanitized, không CPU/SSID/IP/process args, history 12h. Metadata snapshot `recordedAt` là thông tin ghi nhận, `verified:false` không chứng minh restore hoặc độ mới giao dịch.
- Chuẩn bị `begin/abort` chỉ tạo/hủy pending qua revision/idempotency; P3 LAB `route/route-resume/complete` ghi journal, đổi DNS allowlist và nhận operator attestation. `declaredPrimary` là record LAB, không phải writer lease; `writeLeaseGranted:false`.

## Panel recovery và Primary

P3.1 bổ sung một nhánh nội bộ: original Panel → pinned forced-command SSH → signed readiness → read-only preview trên dataset riêng 18131. Quyết định chuẩn bị vẫn dùng begin/abort CAS/epoch của Shared Authority hiện có; không deploy Worker mới. Supervisor riêng dừng preview khi pending/Agent/authority không còn hợp lệ, boot/restart luôn quarantine. Dedicated SQL web account SELECT-only và HTTP mutation gates là enforcement có phạm vi, không bảo vệ privileged SQL/same-UID shell/files/jobs. Vì thế API promote và DNS/complete cũ bị chặn khi P3.1 được cấu hình; không diễn giải preview thành Primary an toàn. Xem P3-INTERNAL-CANDIDATE.md.

Website và Panel là hai route độc lập. Thông thường Panel chung theo node Primary đã xác minh; khi route Panel incumbent mất heartbeat đủ lâu, source Cron/DO có thể chọn standby có telemetry/Panel/Tunnel khỏe và đổi riêng CNAME Panel nếu được opt-in. Site/DB/quyền ghi không đổi, không tự failback. DNS GET đúng đích không chứng minh origin/Access/HTTP khả dụng; cần hậu kiểm từ Internet.

P3.2 tách riêng hai hostname LAB do user xác nhận, không dùng panel.giaouoc.com làm record thử. Cùng DO giữ key p32 với routeRevision/journal/receipt/audit riêng, để pending P3.1 không đổi revision/epoch trong khi preview còn phục vụ. Exact allowlist, public key pins, scoped signed readiness và HTTPS/Access origin challenge là gate; DNS xong vẫn chờ HTTP. Recovery opt-in chỉ đổi Panel LAB, không fake Primary hoặc writer lease. Origin hỗ trợ nhiều exact hostname/AUD, session gắn Host+JWT; application LAB riêng giữ policy production nguyên vẹn. Chi tiết contract/rollback và giới hạn ở P32-CLOUDFLARE-LAB.md; runtime PASS/NOT RUN chỉ ở LIVE-PROGRESS.

Luồng Primary hoàn chỉnh hướng đích: `intent → preflight/data warning → fence old writer → activate candidate → route → HTTP/site/DB proof → commit → quarantine rejoin`. Hiện chưa có executor kích hoạt toàn bộ candidate, fencing mọi đường ghi, signed HTTP node proof hoặc conditional rollback được nghiệm thu. Mất heartbeat có thể là partition; không suy ra writer đã tắt. Không bật automatic writer promotion khi chưa giải quyết các gate này.

Dữ liệu lệch được chấp nhận trong MVP với backup/restore thủ công và cảnh báo RPO. Snapshot khác nhau không thay thế fencing. Auto P4 phải dùng lại pipeline manual P3, health/snapshot đã xác minh/cooldown và rejoin standby; không triển khai trước P3 hai LAB đạt. M51/X7b production cần kế hoạch migration/backup/duyệt riêng.

## Release và domain automation

Managed source và live Panel là hai cây riêng; package source-only thống nhất lấy toàn bộ managed bin cùng 7 live Panel assets, JWT/bridge/index/helpers, launcher và một canonical Boot entry từ một commit. Manifest SHA-256 và syntax được kiểm trước dừng management process. Transaction giữ file/mode/absence, service/boot backup, journal/version record; apply và rollback restart/health cả Panel lẫn Agent, kiểm PID mới/fresh heartbeat/asset SHA. Identity/secrets/admin/database/website nằm ngoài write allowlist. Gói này thay updater 13 file cập nhật một phần; trạng thái rollout thực tế ở LIVE-PROGRESS. Boot log/marker không thay test reboot thực.

P2.5 hướng đích: zone read allowlist → chọn hostname → tạo local site/nginx → DNS/Tunnel ingress → HTTPS health/audit/rollback, token quyền tối thiểu ở control plane. Nút tạo website hiện chưa tự publish Cloudflare. Không cần Android IP tĩnh hoặc mua Load Balancing để bắt đầu; chọn route adapter theo quyền/giới hạn thực tế, giữ các hostname production ngoài allowlist.

## N1 fresh node: cùng một release, resume không cấp writer

Bootstrap phát hành chứa SHA immutable và manifest/hash của tất cả runtime/vendor files. Nó kiểm fresh footprints trước package install, fetch đúng commit, kiểm từng file trước chạy code. Node installer ghi progress/receipt hash riêng theo stage dưới ~/.local/state/mhc-new-node-install, lock bằng flock; retry cùng release kiểm outputs đã hoàn tất, giữ identity/keys/password riêng và từ chối changed release/tampered output. Cài original Panel trực tiếp từ baseline dependencies + managed assets cùng commit, không cài bản nền cũ rồi chắp updater. MariaDB chỉ Unix socket, PHP/Nginx là prerequisites chưa có website; Agent chờ ghép và không writer/route. Runit + canonical Boot entry quản lý dịch vụ. Metadata cài đặt không đồng nghĩa site eligibility hoặc Android reboot đã được kiểm.

N1 progress là observation, không là chứng cứ cấp quyền: report từ Agent được sanitize ở Worker; routeVerified/siteVerified/eligiblePrimary luôn false cho onboarding cho tới protocol readiness riêng. Cluster hiển thị nguồn và độ mới. New-node join CLI đọc hidden TTY hoặc --stdin, không nhận mã trong argv; pairing cũ vẫn dùng joinWithCode nội bộ. Nâng source N1 dùng updater transactional cũ, UUID operator pin + journal completed + authenticated membership; node có managed site/writer/transition vẫn bị chặn theo guard. Không thay P33 ownership từ telemetry.

Control N1 dùng cùng P33 journal/route/CAS/public confirmation, nhưng proof scope MHC_CONTROL_ONLY không giả dataset. DNS adapter chỉ ghép additional management nodes vào panel nodeTargets, site mapping/fence set không đổi. Node N1 gửi site commands qua pinned forced-command SSH hiện có tới các site-ready nodes; kênh management-only không có writer command. Peer-unavailable fail-closed, không mở SSH ra Internet.

## N1 tự cấp management Tunnel sau ghép

Mã ghép một lần hiện có phê duyệt public proof key Ed25519 kèm proof-of-possession trên node mới. DO giữ pin trong membership; Agent không tự thêm pin bằng telemetry hoặc đổi pin cũ. Worker dùng secret MHC_N1_CF_TOKEN (Account Cloudflare Tunnel Edit, account MHC) cho named remotely-managed Tunnel của đúng node; chỉ hai chiều API account đã allowlist, không có DNS mutation trong onboarding. Intent/name riêng ghi trước POST; mất phản hồi thì reconcile chính journal name, không tự nhận Tunnel tùy ý. Token connector chỉ trả cho Agent của chính node và lưu0600, không nằm status/audit/Panel/Git.

Sau origin Access và runit sẵn sàng, Worker kiểm cấu hình/connector rồi thêm public key + Tunnel vào registry Control durable. Registry mở rộng chỉ Panel adapter, không thay fingerprint của site lease hoặc tập writer. Node N1 mới ký READY scope MHC_CONTROL_ONLY mỗi5giây; Authority kiểm signature/membership/TTL15s/revision rồi relay proof cho Panel được xác thực. Đây là transport riêng cho readiness quản trị, không là remote shell/job queue. Control trên các node legacy vẫn có đường SSH pinned cũ. Chọn Control tiếp tục dùng journal P33/CAS và public Access proof; ghép node không tự chuyển tuyến. Scope writer/site vẫn giữ guard riêng và không thêm theo onboarding.

MHC_N1_ENABLED=LAB_SELF_SERVICE và MHC_N1_CONFIG_JSON giới hạn đúng account/panel-lab/team/AUD; thiếu quyền trả N1_CF_TUNNEL_PERMISSION_REQUIRED, giữ journal/identity để retry. Cấu hình/token/service đã có khác pin thì dừng, không ghi đè. Agent trên N1 reconcile trong nền; reboot/Doze và fresh physical acceptance vẫn cần bằng chứng riêng.
