# MHC — báo cáo tiếp nhận và kế hoạch đồng bộ hai LAB

Ngày 27/10/2026, kiểm tra trực tiếp bổ sung khoảng 08:40–08:49 Việt Nam. Branch `codex/m1-m2-foundation`; HEAD trước checkpoint tài liệu này `da7d67a545063770c08bf6b064d284170c029db8`. Đây là kiểm kê và thử nghiệm cách ly, không phải nghiệm thu P3. Không chạy install/updater/repair, restart dịch vụ đang dùng, restore DB, đổi DNS hoặc deploy Worker. Dữ liệu/config production và M51/X7b không được thao tác.

## A. GitHub và workspace

- Remote xác nhận `https://github.com/litequang/Mini-Hosting-Cluster.git`; fetch mới nhất cho kết quả local/upstream `0 ahead / 0 behind` tại `da7d67a`, một worktree, sạch trước sửa tài liệu. Hai commit `a6bfa55`, `da7d67a` là kiểm kê trước; runtime mới nhất vẫn ở snapshot `f73df611aa600e6f74a13690171fe8fe0a1f0c65`, updater phát hành `764ba5189d0ed89b6b83099a4eaf246ff4c4e32a`. Không mặc định SHA installer là SHA runtime đang cài.
- Source ChatGPT từ `0903b88` đến `055aab5`: 143 commit, 42 file thay đổi; thêm Monitor toàn cụm, SSO, pairing, bootstrap/boot/doctor, updater và P3 DNS/Panel recovery. Hai commit kiểm kê sau đó chỉ sửa docs.
- Git checkout thực: `E:\CODE\MHC\MHC\.work\repository`. Cây cha `E:\CODE\MHC\MHC` không có Git, còn giữ snapshot bàn giao cũ. Đối chiếu 245 file code có ở cả hai cây: 12 file khác HEAD; so với baseline `0903b88`, chỉ `bin/remote-panel.mjs` và `bin/self-test.sh` có sửa riêng. Hai file chỉ có ở cây cha là `bin/clock-health.mjs`, `tests/clock-health.mjs`. Bốn phần clock này được giữ nguyên ngoài branch, chưa gộp; không copy nguyên cây cha lên Git vì sẽ làm mất các cập nhật mới.
- Manifest updater gồm 13 đích (9 live/runtime, 4 managed Panel), tất cả blob SHA khớp pin `f73df61`. Script này chỉ cập nhật một phần source; không thể dùng marker `TEST 0.5.0C` để kết luận node đồng bộ toàn bộ repository.

## B. Hai Android thật

SSH dùng key có sẵn, BatchMode và StrictHostKeyChecking=yes; không thay known_hosts hoặc đọc key/token/password. Cả hai là Android 10, aarch64, Node v26.12.1. Node ID Vsmart `4ed4c025-62ae-4c2a-8d68-65dd76ecf550`; XZ3 `4a9672d1-bb62-4286-946a-a78b73e57b24`. Marker cả hai: `TEST 0.5.0C-REMOTE-PANEL installed on clean Termux`.

| Hạng mục trực tiếp | Vsmart `u0_a180@192.168.1.4:8022` | Sony XZ3 `u0_235@192.168.1.41:8022` |
|---|---|---|
| SSH key, Panel 9090 | PASS, HTTP 200 | PASS, HTTP 200 |
| Panel/Agent/nginx/mysqld | runit running | runit running |
| MariaDB `SELECT 1` | PASS | PASS; chưa nghiệm thu DB website |
| WordPress/static | `mhc-lab` WordPress + `demo` static còn đăng ký; HTTP 18080 và `/wp-login.php` 200; WP PHP/Nginx riêng running | `sites list` trống; 18080 không có HTTP; chưa cài WordPress LAB |
| Monitor/authority | Heartbeat và telemetry mới | Collector `MONITOR_V2_OK`, heartbeat/telemetry mới |
| Panel Tunnel | `mhc-panel-tunnel` running | Chưa cài service |
| Origin Access | configured cho `panel.giaouoc.com`, live JWT module mới | configured:false, live JWT module cũ |
| Public Host thiếu JWT | HTTP 403 | HTTP 403; chưa chứng minh Access được cấu hình |
| Boot/SSH supervision | Script và boot log có; supervised sshd running | Có cả `10-mhc-start` và `10-start-hosting`; runit sshd down/want up, daemon riêng PID 9663 PPID 1 đang phục vụ SSH; log lọc có `Address already in use` |
| Backup metadata | `snapshot-20261026`, recordedAt `2026-10-26T07:19:00.656Z`, collector `verified:false` | Không có snapshot được báo cáo/xác minh |

Boot log ngày 26/10 có `RUNSVDIR_RUNNING`, `MHC_BOOT_FINISHED`, Panel 200 trên cả hai; có thể là lần chạy repair, không chứng minh reboot tự phục hồi. Reboot/Doze, restore mới, browser đăng nhập và đồng thời thao tác từ hai Panel thật NOT RUN trong kiểm kê. M1 HTTP/SQL/upload/backup→restore PASS ngày 26/10 vẫn là bằng chứng lịch sử trong LIVE-PROGRESS, không tự chép sang nghiệm thu mới. `node-doctor` có thể in LOCAL_PASS dù sshd down/Tunnel chưa cài; cần đọc từng dòng dịch vụ.

Cả hai CLI đọc cùng authority cluster `2c1ea7c0-1d1f-4802-8336-0925a529c431`, revision 3, epoch 0, `declaredPrimary:null`, `pending:null`, `writeLeaseGranted:false`, `automaticFailover:false`. Có 3 node telemetry mới: Vsmart, XZ3 và F3216. User xác nhận F3216 là LAB ở nhà, không có SSH từ công ty; không dùng nó cho nghiệm thu hai LAB tại công ty. Đọc CLI cùng authority chưa phải bằng chứng hai Panel đã đăng nhập qua Access và thao tác end-to-end.

### So file cài thật với release

Giá trị trong bảng là tiền tố Git blob, không phải commit cài đặt.

| Đích updater | Expected `f73df61` | Vsmart | XZ3 |
|---|---|---|---|
| BIN/cluster-authority.mjs | `5c72ae1` | `aba5764` | `8718e95` |
| BIN/node-monitor.mjs | `e79689c` | khớp | khớp |
| BIN/node-boot.sh | `de0f6a0` | khớp | khớp |
| BIN/node-doctor.sh | `9243c99` | `7f0685f` | khớp |
| HOME/mhc-full | `3343a9d` | khớp | khớp |
| PANEL/src/mhc-integration.mjs | `33814da` | khớp | khớp |
| PANEL/src/server.mjs | `9cb4832` | khớp | khớp |
| PANEL/public/app.js | `694eac6` | `bdf48f3` | `bdf48f3` |
| PANEL/public/style.css | `dfff9b1` | khớp | khớp |
| SOURCE/src/mhc-integration.mjs | `33814da` | khớp | khớp |
| SOURCE/src/server.mjs | `9cb4832` | khớp | khớp |
| SOURCE/public/app.js | `694eac6` | `bdf48f3` | `bdf48f3` |
| SOURCE/public/style.css | `dfff9b1` | khớp | khớp |

Kết quả manifest: Vsmart **9/13 khớp**, XZ3 **10/13 khớp**. So thêm toàn bộ **67 file managed dưới bin** (launcher HOME kiểm riêng): Vsmart 57 khớp, 8 khác, 2 thiếu; XZ3 62 khớp, 5 khác, không thiếu. File khác trên cả hai gồm authority client, managed app.js, managed JWT module, legacy-panel.sh, self-test.sh. Vsmart còn khác managed index.html, node-doctor.sh, remote-panel.mjs và thiếu managed panel-tunnel-service.sh/prepare-panel-tunnel-token.sh; service Tunnel hiện tại vẫn chạy.

**JWT drift ngoài manifest:** expected/live mới `ee4ce2b`; Vsmart live khớp nhưng managed source còn `e19d603`; XZ3 cả live và managed đều `e19d603`. Bản cũ đòi `typ:'JWT'`, thiếu sửa typ optional và diagnostics. Updater 13 file không cập nhật module JWT. `hosting-panel apply` lấy module từ managed source, nên có thể đưa Vsmart về code JWT cũ nếu apply trước khi đồng bộ đầy đủ managed source.

## C. Cloudflare

Đã xác minh từ thiết bị: authority trả schema Monitor v2 với heartbeat/telemetry mới; Vsmart connector đang chạy; HTTPS `panel.giaouoc.com` từ cả hai Android trả **302** vào cổng Access. Kết quả 302 chưa chứng minh origin sau đăng nhập, node đang phục vụ hoặc chính sách email. Lỗi schannel HTTP 000 của Windows ở lượt trước không chứng minh public Panel bị hỏng.

**CHƯA XÁC MINH:** Worker deployment/version hash, pairing live, Cron đã deploy/chạy, P3 opt-in và allowlist, DNS CNAME đích, tài khoản Tunnel, Access AUD/policy trên Cloudflare và browser authenticated. CLI Wrangler không có cache (`npm exec --offline ...` ENOTCACHED); không tải/cài CLI mới. Browser connector không có browser khả dụng; công cụ native UI dừng do không xác định chắc URL để áp dụng chính sách, không tiếp tục UI. Không đọc token, không đổi DNS/secret/policy/deployment. Thiếu quyền kiểm tài khoản được ghi là giới hạn, không suy đoán deployed/disabled từ source.

## D. Test và trạng thái phát triển

Source kiểm: runtime snapshot `f73df61` nằm trong HEAD `da7d67a`. Windows Node v22.22.2: **16 JS file thay đổi syntax PASS**, **32 shell script syntax PASS** bằng Git Bash có sẵn (WSL bash trước đó bị từ chối). Manifest 13 SHA PASS. Cả hai máy có git/curl/sv/node/bash/tar/openssl/nginx/php/mariadb/cloudflared trên PATH; presence không phải toàn bộ package compatibility acceptance.

Đã gửi archive **code Git** vào private temporary directory trên từng Android, HOME fixture cách ly, không chứa `.env` thật/token/DB. Mỗi máy chạy cùng 10 runner; sau chạy đã xóa đúng thư mục fixture và kiểm dịch vụ thật vẫn giữ nguyên PID Panel/Agent.

| Runner | Vsmart fixture | XZ3 fixture | Phạm vi |
|---|---|---|---|
| p3-route | PASS | PASS | DNS API mock, không gọi Cloudflare thật |
| p3-panel-recovery | PASS | PASS | Cron/DO/selection/DNS mock, không chuyển writer |
| cluster-pairing | PASS | PASS | Invite/join/role/replay mock |
| monitor-all-nodes | PASS | PASS | Collector/schema/history/privacy fixture |
| remote-panel | PASS | PASS | 45 assertion JWT/CLI/localhost fixture |
| authority-panel | PASS | PASS | Panel bridge/fail-closed fixture |
| cluster-authority | PASS | PASS | Concurrency/CAS/replay/storage fixture |
| authority-http-panels | PASS | PASS | Hai process Panel + TLS/DO fixture trên từng máy |
| access-sso-panel | PASS | PASS | Signed JWT mock, session/local password/CSRF/logout |
| manual-candidate-ui | FAIL | FAIL | Test structural cũ đòi literal `declaredPrimary:null` đã đổi |

SSO FAIL trên Windows đã chẩn đoán là `ERR_UNSUPPORTED_ESM_URL_SCHEME` (`--import` nhận path C: thay vì file URL), không tái hiện trên Android. Lần đầu authority-http fixture bị guard `OUTPUT_MUST_BE_OUTSIDE_SOURCE` vì TMPDIR đặt trong source; chạy lại với TMPDIR ngoài source PASS, không sửa guard. Full self-test/upgrade rollback, current installed Panel authenticated integration, physical multi-node CAS/cutover, Internet browser và reboot **NOT RUN**. Hai process fixture trên một máy, dù lặp trên hai Android, không tương đương cutover giữa hai Android thật.

| Mốc | Trạng thái thực thi | Thiếu DoD |
|---|---|---|
| P0 kiểm kê/bảo vệ | DONE phạm vi kiểm kê này | Giới hạn Cloudflare được ghi rõ; remediation thuộc mốc tiếp theo |
| P1 hosting Vsmart | IN PROGRESS | Reboot/Doze và hậu kiểm backup/restore hiện hành |
| P2 mọi Panel + authority | IN PROGRESS | Đồng bộ full source, XZ3 JWT/Tunnel/boot, browser hai origin, CAS thật |
| P2.5 publish domain | NOT STARTED runtime | Nút tạo site chưa tự cấu hình Cloudflare |
| P3 manual | IN PROGRESS source LAB; live NOT RUN | Activation, fencing, HTTP identity, conditional rollback + hai LAB |
| P4 auto Primary | NOT STARTED runtime | Dùng chung pipeline P3 an toàn, snapshot/health/cooldown/rejoin |
| P5 production migration | NOT STARTED | LAB đạt và user duyệt riêng |

P3 DNS/journal/attestation và Panel-only recovery Cron có source; `declaredPrimary` LAB/DNS GET không cấp writer lease. Recovery Panel không đổi website/DB. Không dùng mất heartbeat làm bằng chứng writer cũ đã dừng.

## E. Lỗi và gate trước nâng cấp

1. **Cao — upgrade package chưa đủ:** JWT live/managed bị lệch, 13-file updater bỏ qua module này; managed bridge/index/helpers cũng có drift. UI đã có nút route P3 nhưng client Vsmart blob `aba5764` chỉ chấp nhận begin/abort, nên thao tác mới có thể bị `AUTHORITY_ACTION_INVALID` ngay tại client (kết luận source, không thử mutation thật). Chưa dùng updater hiện tại làm cách đồng bộ hoàn chỉnh, chưa apply Panel từ source managed cũ.
2. **Cao — XZ3 chưa có đường quản trị dự phòng:** chưa Tunnel/Access; sshd runit lỗi bind, hai boot script cần xem thứ tự trước khi sửa. Không kill daemon hiện tại hoặc reboot trong kiểm kê.
3. **Cao — rollback updater chỉ một phần:** `restore()` chép lại source và restart Panel, không restart Agent sau khi hồi phục client; `sv restart Agent || true` có thể bị bỏ qua; `rollback_needed=no` đặt trước `node-doctor --repair`, nên tác động boot/service ở repair không nằm trong rollback 13 file. Đây là phát hiện source, chưa chạy fault injection updater; cần test trước rollout.
4. **Trung bình — test integration thiếu:** self-test có p3-route/pairing/Monitor nhưng chưa gọi p3-panel-recovery, access-sso-panel, manual-candidate-ui; assertion UI cũ và fixture SSO Windows cần sửa theo hành vi, không bỏ guard. node-doctor LOCAL_PASS chưa phản ánh hết dịch vụ thiếu/hỏng.
5. **Gate P3:** XZ3 chưa có site/snapshot đã restore; chưa writer fencing, candidate service executor, origin HTTP identity và rollback có điều kiện. Cloudflare deploy/allowlist/cron chưa có bằng chứng tài khoản. Không đưa production vào để lấp bằng chứng LAB.

## F. Kế hoạch đưa hai node về cùng bản trước P3

1. **Chốt một checkpoint nâng cấp đầy đủ:** runtime tham chiếu `f73df61`, source branch đã audit `da7d67a`. Trong nhiệm vụ sửa tiếp theo, sửa test drift/Windows file URL và gom test mới vào runner; hoàn thiện rollback Panel+Agent/boot, hash mọi file managed/live cần cập nhật, gồm JWT, bridge/index và helpers. Dùng cơ chế source-only hiện có hoặc package đầy đủ đã test, tránh thêm chuỗi installer nhỏ. Chưa chạy bước này trong kiểm kê.
2. **Preflight + rollback riêng từng máy:** snapshot code/marker/launcher, Panel live + managed, service/boot và config private tại node (0700/0600), backup site/SQL độc lập có checksum/restore rehearsal khi phù hợp. Giữ admin/password/identity/cluster/member keys, không copy config Vsmart sang XZ3. Ghi hash trước/sau, rollback path và process restart cần thiết.
3. **XZ3 làm canary:** cập nhật toàn bộ managed source bằng upgrade source-only có guard rồi original Panel apply đã sửa packaging; xác minh live/managed hashes, localhost login/CSRF, Agent/Monitor; chưa cấp Primary. Sửa SSH supervision trong cửa sổ có hai phiên SSH và cứu hộ Termux; giải quyết bind conflict/boot duplication trước reboot có phối hợp. Không dừng daemon SSH duy nhất một cách mù quáng.
4. **Vsmart sau khi canary đạt:** cùng pin/source và Panel package, bảo vệ demo/WordPress/MariaDB config; chỉ restart service quản trị cần thiết trong nhiệm vụ rollout sau. Kiểm WordPress HTTP/SQL/upload và Panel password/SSO theo baseline; lỗi thì restore source và restart cả process bị ảnh hưởng. Không restore DB chỉ để rollback code.
5. **Cloudflare là mốc riêng sau khi có quyền:** đọc deployment/DNS/Tunnel/Access hiện hành trước. Chuẩn bị Tunnel riêng XZ3, cùng issuer/AUD đúng cho origin Panel, Access allowlist admin. Nâng existing Worker/DO binding và membership, không tạo cluster mới/rotate credentials. Giữ P3 DNS/recovery opt-in tắt cho tới khi origin và allowlist đã được chứng minh. Đây chỉ là kế hoạch, chưa đổi Cloudflare.
6. **DoD đồng bộ:** live/managed hashes cùng checkpoint, SSH supervised + Panel/Agent/Monitor khỏe, hai Panel đăng nhập đọc cùng authority, remote JWT/Host/CSRF đúng, reboot từng máy trở lại dịch vụ; website Vsmart còn nguyên. Cần bằng chứng trực tiếp, không dựa trên LOCAL_PASS hoặc marker.
7. **Mới tiếp tục P3:** restore website LAB riêng lên XZ3, xác minh snapshot/DB/media; hoàn thiện kích hoạt candidate, ngăn writer cũ, HTTP node proof và rollback chỉ khi dữ liệu cho phép; manual A→B và B→A cùng outage/rejoin trên hai LAB. Backup/restore thủ công đủ cho MVP; GTID/file replication và scoring sâu không chặn mốc này. P4 dùng lại cơ chế chuyển đổi sau P3.

## G. Tài liệu và checkpoint

Checkpoint này chỉ cập nhật `LIVE-PROGRESS.md`, báo cáo này, CODEMAP, ARCHITECTURE, DECISIONS, TROUBLESHOOTING và ROADMAP. LIVE-PROGRESS là nguồn trạng thái thực thi; các checkpoint cũ giữ thời điểm/bằng chứng cũ. Bốn phần clock-health ở workspace cha được bảo vệ. SHA docs mới được báo trong phản hồi và tra bằng `git log -1 -- docs/CODEX-RESUME-AUDIT-2026-10-27.md`. **Dừng sau báo cáo/kế hoạch; không tự triển khai hoặc tiếp tục P3.**
