# Audit tiếp quản dựa trên source REMOTE-PANEL

Ngày: 26/10/2026. Phương pháp: đọc mã và diff archive. **Không chạy tests ứng dụng, không SSH Android, không gọi Cloudflare.** Các vấn đề cần tái hiện bằng test trong phiên triển khai; tài liệu này không phải chứng nhận bảo mật hay nghiệm thu HA.

## A. Các khoảng trống đã thấy trực tiếp

| Ưu tiên | Vị trí | Hành vi hiện tại | Việc cần làm |
|---|---|---|---|
| P0 | `bin/manual-primary.mjs`, `inventory()` | Buộc `cfg.controllerNodeId === self.nodeId`, `inventory-only` | Thay local-only global state bằng authority dùng được từ mọi Panel |
| P0 | `bin/manual-primary.mjs`, `executeUnlocked()` | `complete` xác nhận các cờ rồi ghi `selection.json`; không thực thi remote actions | Triển khai manual cutover thực có candidate activation, route và health proof |
| P0 | `bin/auto-primary.mjs`, `controller()`, `tick()` | Chỉ controller local điều phối; không bầu nếu controller là Primary; loại controller khỏi candidates | Loại điểm chết ở Android controller; mọi Panel vẫn hoạt động khi Primary mất mạng |
| P0 | `bin/node-role-guard.mjs`, `decide()`, `check()` | Chỉ `sv down` services opt-in; khi được phép vẫn `NO_AUTO_START` | Có luồng khởi động candidate và boot role gate trước writers, tránh route vào máy vẫn tắt |
| P0 | `node-role-guard.mjs`, service allowlist | Cho hạ `named-tunnel`, `nginx`, PHP/DB/app, chưa tách tuyến quản trị | Giữ Panel/agent và ingress quản trị Standby; không tự cắt đường cứu hộ |
| P1 | `auto-primary.mjs`, `rankNodes()` | Dùng snapshot tên `snapshot-YYYYMMDD`, backup/report metadata; flags actualData/health đều false | Timestamp có độ phân giải đủ, provenance/restore readiness; không coi backup đang có là data đang phục vụ |
| P1 | `auto-primary.mjs`, `updateCloudflareRoute()` | PATCH/GET record đúng đích; `routeVerified` chỉ ở API | Kiểm HTTP từ ngoài, node identity có xác thực phù hợp, host/TLS/website health |
| P1 | `manual-primary.mjs` và `auto-primary.mjs`, local lock | `operation.lock` tạo exclusive, xóa trong finally; process bị kill có thể để lock | Test kill/crash, có cơ chế phục hồi lock an toàn; không xóa lock mù |
| P1 | `auto-primary.mjs`, pending route | Journal intent trước API, reconcile cùng target | Tái kiểm target readiness/quarantine/role lúc phục hồi; xử lý candidate chết giữa cutover |
| P1 | `node-role-guard.mjs`, `watch()` | Một số lỗi check được log rồi lặp; lỗi trước stop không chứng minh writer đã dừng | Phân loại lỗi, trạng thái lỗi cụ thể; test guard crash/config lỗi/startup ordering |
| P1 | `node-role-guard.mjs`, `safety()` | Whitelist installed marker theo tên các bản TEST | Chuẩn hóa version/schema upgrade; không đổi marker để bỏ guard |
| P1 | `bin/legacy-panel.sh` | Guard production, apply Panel riêng, bảo vệ admin data | Nâng cấp idempotent/rollback; test Panel gốc thực tế cùng build trên các node |
| P2 | `bin/mhc-full-wrapper` | Có case `remote-panel` lặp trong các sub-dispatch replication/file-sync/clone | Rà command routing/help, sửa có test cần thiết khi đụng CLI |

## B. State local hiện có — cần migration, không đồng bộ secrets

Dưới `~/.config/mhc-full-installer`:

- `node-identity.json`, `cluster.json`, `members.json`: identity và local controller inventory.
- `joined.json`, `node-auth.json`: thông tin join/auth của node; không đưa vào repo/chat.
- `manual-primary/selection.json`: declared Primary, pending manual, revision, retiredPrimaries.
- `manual-primary/operation.lock`: local mutual exclusion cho manual/auto, chưa là khóa phân tán.
- `manual-primary/auto-config.json`: cấu hình recommendation/best-effort route và tham chiếu token file.
- `manual-primary/route-pending.json`: pending route journal.
- `manual-primary/events.jsonl`, `auto-events.jsonl`: audit local.
- `node-role-guard/armed.json`, `last-check.json`: cấu hình/check guard.

Không copy nguyên thư mục config từ Primary sang node mới: sẽ có nguy cơ clone identity/token/role. Thiết kế migration phải giữ identity mỗi node riêng và state global có một authority/revision.

## C. Những gì chưa thể kết luận từ source

- Không biết node nào đang cài build nào, service nào thực sự chạy, pin/nhiệt/storage/DB hiện trạng.
- Không biết hostname/tunnel/access/token nào đã thiết lập trong tài khoản thật.
- Không có bằng chứng live HTTP/SQL cutover, mọi writer đã khóa, hoặc node cũ reboot không tự phục vụ.
- Không xác định độ mới giao dịch trên máy offline từ timestamp snapshot.
- Không chứng minh Node/Termux reboot recovery chỉ bằng test Linux/mock.

## D. Thứ tự sửa để tránh kéo dài

1. Chốt code đang dùng và lỗi ngăn hosting/Panel thực tế.
2. Dùng một authority/luồng cutover chung cho manual và auto, tận dụng module hiện có.
3. Hoàn thành một manual cutover có kích hoạt node đích và nhận diện HTTP đúng node.
4. Dùng lại luồng đó cho auto + rejoin, rồi chạy trên hai LAB.
5. Bổ sung replication/scoring sâu sau khi MVP dùng được.

Không mở thêm vòng audit 12 nhóm/drill ký số chỉ để trì hoãn bốn bước trên. Mọi tuyên bố guarantee phải giới hạn theo cơ chế và phép thử đã thực hiện.
