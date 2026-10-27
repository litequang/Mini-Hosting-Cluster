# TROUBLESHOOTING / an toàn vận hành

## SSH Vsmart
- SSH LAB đã xác minh 27/10: Vsmart `u0_a180@192.168.1.4:8022`, XZ3 `u0_235@192.168.1.41:8022`; key auth và strict host key PASS. Địa chỉ 192.168.100.27 là lịch sử; IP có thể đổi. Không dùng `StrictHostKeyChecking=no`.
- Codex VS Code **chạy trên máy công ty cùng LAN/VPN** có thể SSH qua OpenSSH; Codex Cloud **không thể tự truy cập LAN** trừ khi có mạng riêng/tunnel được chuẩn bị. Nếu không thể truy cập, xuất bước kiểm tra cụ thể, không giả báo đã chạy.
- Dùng key riêng/cấu hình `%USERPROFILE%\.ssh\config`; **không chép private key vào repo/chat**.

## Vsmart đã có dữ liệu
- Kiểm tra `~/mhc-full doctor`, `sv status ...`, `ls ~/.config/mhc-full-installer`, `~/mhc-full sites list`, `~/mhc-full hosting-panel plan` chỉ đọc trước.
- `install.sh --install` dành cho Termux sạch. Trên Vsmart cũ phải xác minh `install.sh --upgrade` và snapshot/rollback, không xóa `demo` hay DB trước khi user duyệt.
- Mỗi thay đổi service cần health-check trước/sau và lệnh rollback đã được kiểm chứng; tránh restart toàn bộ.

## Panel 9090
- Kết nối từ LAN Windows có thể dùng `ssh -N -L 127.0.0.1:9090:127.0.0.1:9090 -p 8022 ...`; nếu local 9090 bận, cổng khác có thể đụng origin allowlist: khắc phục theo code, không disable CSRF/origin.
- Panel cũ lưu admin config `~/android-hosting-panel/data/admin.json`; nâng cấp Panel riêng bằng `hosting-panel plan/apply/rollback` theo output thực.
- Access 403 sau redirect: kiểm hostname, team/AUD/JWKS/JWT, Clock/CA, trust chain; không tắt kiểm JWT để sửa nhanh. Từ checkpoint 26/10, `mhc-remote-access.mjs` (nếu đã được triển khai) ghi private `MHC_REMOTE_ACCESS_DENIED <CODE>` tối đa mỗi reason/30 giây vào log dịch vụ Panel, không ghi token/host/claim. Xem **chỉ các dòng có prefix này** bằng `grep 'MHC_REMOTE_ACCESS_DENIED' "$PREFIX/var/log/sv/amh-panel/current" | tail -n 8`. Không gửi full log, JWT hoặc cookie. `JWT_MISSING` gợi ý header không đến origin; `HOST_MISMATCH` là Host ngoài whitelist; `JWT_AUDIENCE_MISMATCH` là ứng dụng Access sai; `JWKS_FETCH_FAILED` là truy xuất khóa lỗi; `JWT_SIGNATURE_INVALID` là chữ ký sai. 403 vẫn generic phía client; PATCH LAB bằng script trong `scripts/` có backup/rollback.

## Hosting và Cluster
- Đừng khẳng định web WordPress hoạt động chỉ vì `php-fpm` và MariaDB đang chạy. Cần bài test HTTP/DB/WordPress thật, quy trình cài WP-CLI và restore có rollback.
- SSH heartbeat stale không chứng minh máy offline. Dữ liệu mới nhất không thể biết nếu Primary mất kết nối mà có giao dịch chưa backup.
- Mất Cloudflare authority/witness phải dừng auto promotion. Controller ghi Primary mới không đồng nghĩa old primary đã ngừng DB write.
- Node cũ quay lại: mặc định quarantine/standby; không auto restart writer; cảnh báo snapshot diverged.
- Cloudflare Tunnel DNS có thể tiếp tục trỏ Tunnel offline -> 1016. Nếu muốn tự route phải có adapter thực sự cập nhật đích, xác minh và rollback.

## Nghiệm thu
- Unit/integration: chạy lần lượt `node tests/auto-primary.mjs .`, `node tests/manual-primary.mjs .`, `node tests/remote-panel.mjs .` (các file test nhận đường dẫn root qua tham số). Không gọi trực tiếp `node --test` cho ba script này vì chúng tự kiểm thử và cần argv[2].
- Shell test: `bash bin/self-test.sh` trên WSL/Linux hoặc thiết bị Termux, không trộn với cấu hình production.
- Cần log thật từ Vsmart, HTTP status, healthchecks và trạng thái sau reboot. Không xuất secrets/full dump/log cá nhân.

### Access 403 `JWT_HEADER_INVALID` trên Vsmart LAB (26/10/2026)
User log 12:17–12:18 UTC cho thấy browser request đến origin có JWT nhưng bị từ chối trước check issuer/aud/signature. Strict `header.typ==='JWT'` không theo RFC 7519 §5.1: typ optional. Patch cho phép typ vắng, typ JWT không phân biệt hoa/thường; vẫn bắt buộc RS256, kid có giá trị, JWKS RSA RS256, signature, issuer, aud, exp. Khi bị từ chối, log từng mã: `JWT_ALG_UNSUPPORTED`, `JWT_TYP_UNSUPPORTED`, `JWT_KID_INVALID`. Không bao giờ in JWT / claims / kid / token. Đây là source fix; chỉ coi 403 được giải quyết khi đăng nhập công khai thành công sau deploy.


## XZ3 reboot không phục hồi Panel/Agent (26/10)
- Sau lệnh thống nhất `scripts/update-existing-android-node.sh --apply`, chạy `~/mhc-full node-doctor --check` và `bash ~/.local/share/mhc-full-installer/bin/node-boot.sh --status`.
- `boot-last.log` không có dấu thời gian từ lần reboot gần nhất: Termux:Boot chưa được Android kích hoạt; mở app một lần, cấp autostart, không hạn chế pin cho Termux/Termux:Boot/Termux:API, Sony STAMINA OFF. Không thể cấp quyền này qua Shell không root. Không giải thích Android kill bằng giả định bug Cloudflare.
- Log `RUNSVDIR_MISSING`: `~/mhc-full node-doctor --repair`, kiểm tra `$PREFIX/etc/profile.d/start-services.sh`, `sv status ...`, và log runit; boot script cũ được backup trước khi thay.
- Agent RUNNING nhưng Monitor không có node: chẩn đoán `WORKER_NEEDS_MONITOR_DEPLOY` vs `MONITOR_SCHEMA_V2`, xác minh Worker đã deploy đúng `mhc-cluster-authority-lab`, Agent có private authority config, và heartbeat. Nếu chỉ dữ liệu cũ, đợi heartbeat mới; không đánh đồng máy offline.
- `termux-battery-status` không có JSON dù đã cài `pkg termux-api`: xác minh ứng dụng Termux:API từ nguồn ký tương thích, chạy mở ứng dụng, cấp quyền/battery unrestricted, kiểm tra lại. Không in secrets/tokens hay xóa dữ liệu.


## Node hiển thị CHƯA CÓ MONITOR V2 (2026-10-26)
- UI chỉ có heartbeat, chưa có `node.telemetry` trong phản hồi Shared Authority. Có thể do Worker còn schema M2 cũ, Agent còn mã cũ, Agent không chạy, hoặc collector bị lỗi; không chứng minh điện thoại offline.
- Trên điện thoại: `~/mhc-full node-doctor --check`. Bản chuẩn từ GitHub `e36b804a237b34c5042c853fc87656df10b801e9` phân biệt `Local Monitor v2: MONITOR_V2_OK` / COLLECT_FAILED / TIMEOUT, `Cloudflare shared Monitor: MONITOR_SCHEMA_V2` / WORKER_NEEDS_MONITOR_DEPLOY, và trạng thái `mhc-authority-agent`.
- Nếu `WORKER_NEEDS_MONITOR_DEPLOY`: triển khai `reference/cluster-authority/worker.mjs` của nhánh đúng vào Worker **hiện có** `mhc-cluster-authority-lab`; giữ nguyên DO/secrets. Không cài Termux:API lại để sửa lỗi Worker.
- Nếu local collector OK, Worker V2, nhưng node vẫn thiếu telemetry: kiểm tra service `sv status "$PREFIX/var/service/mhc-authority-agent"`, boot và `node "$HOME/.local/share/mhc-full-installer/bin/cluster-authority.mjs" status` (không cần in secret). Agent đã được cập nhật ghi log dạng `MHC_MONITOR_V2_COLLECT_FAILED <error-class>` tối đa 1 lần/5 phút.
- Có pin phần trăm `unknown` nhưng `MONITOR_V2_OK` nghĩa là API pin lỗi riêng, **không** phải lý do thiếu toàn bộ telemetry v2. Chỉ xử lý Termux:API sau khi kiểm tra collector/Worker.


## P3 LAB route failures
- `P3_NOT_ENABLED`: default. Only an administrator authorizes LAB with private Worker config and exact DNS/Tunnel allowlist; never disable fail-close for production.
- `P3_ROUTE_CONFLICT_MANUAL_REVIEW`: existing CNAME is neither old nor candidate target; stop, check DNS/other operators; never overwrite arbitrarily.
- `P3_CLOUDFLARE_NETWORK_FAILED`, `P3_DNS_VERIFY_FAILED`, `P3_CLOUDFLARE_API_FAILED`: leave `ROUTING_REQUESTED`; inspect existing DNS, then use P3 UI resume after 30s. No blind abort/rollback once route may have changed.
- `P3_TARGET_NOT_READY`: candidate Agent is missing recent v2 metrics or Panel/Nginx not RUNNING. Confirm local host and app/DB before trying again. Unfenced writers mean unsafe production failover.
- `P3_FINAL_CONFIRMATIONS_REQUIRED`: operator must test external website and protected Panel and verify old writer stopped before recording LAB state; recorded state is not a writer lease.
## Kiểm kê 27/10/2026: Sony SSH và nguồn dữ liệu Monitor

- Sony XZ3 `u0_235@192.168.1.41:8022` đã nhận public key, SSH trực tiếp PASS. Không nhầm lỗi auth trước đó với trạng thái hiện tại; chi tiết source/live xem audit 27/10.
- Vsmart `sv status amh-panel` từ SSH remote trả “service directory does not exist” nếu không có `SVDIR`; dùng `sv status "$PREFIX/var/service/amh-panel"` và các đường dẫn đầy đủ để kiểm. `node-doctor`/telemetry của Sony có thể báo `sshd:stopped` dù SSH tới được màn xác thực: kiểm collector/runit trực tiếp trước khi kết luận.
- Probe `panel.giaouoc.com` từ Windows lần này bị TLS schannel HTTP 000; không dùng nó để kết luận Cloudflare origin hỏng hoặc P3 recovery đang chạy. Cloudflare account/Worker/Cron/P3 opt-in cần xác minh bằng quyền read-only hợp lệ.
- Trên Windows, `tests/manual-candidate-ui.mjs` FAIL ở literal `declaredPrimary:null` cũ và `tests/access-sso-panel.mjs` FAIL khi spawn Panel; bốn test fixture M2/P3 khác PASS. Không đánh dấu full regression PASS hay tự sửa test trong nhiệm vụ kiểm kê.
### Kết quả SSH XZ3 sau khi thêm public key (27/10)

Key auth và strict host key đã PASS. `sv status "$PREFIX/var/service/sshd"` trả **down, normally up**, nhưng có daemon `sshd` PID 9663 với PPID 1 và phiên SSH mới vào được. Log lọc có `Address already in use`; kiểm tra bind conflict/boot scripts trước khi sửa, giữ phiên SSH dự phòng và cứu hộ Termux. Không coi daemon ngoài runit là bằng chứng tự phục hồi sau reboot. Chưa restart/sửa service. XZ3 chưa có Panel Tunnel, remote Access hoặc site/snapshot LAB. node-doctor LOCAL_PASS không thay các kiểm tra chi tiết này.

### Gate đồng bộ source và test 27/10

- Vsmart managed JWT và XZ3 live/managed JWT còn blob `e19d603`, release cần `ee4ce2b` (typ optional). Updater 13 file không cập nhật JWT; không chạy hosting-panel apply từ source cũ vì có thể đưa lỗi Access 403 trở lại Vsmart. Dùng package đầy đủ đã diễn tập; giữ admin/config/identity riêng mỗi máy.
- Updater rollback chỉ restart Panel, không restart Agent khi hồi client; repair boot nằm sau khi tắt cờ rollback. Đây là gate cần test/fix trước rollout, không gọi rollback đã nghiệm thu từ static review.
- `access-sso-panel` trên Windows lỗi `ERR_UNSUPPORTED_ESM_URL_SCHEME`: preload `--import` cần file URL. Test source hiện tại PASS trên hai Android trong fixture cách ly. `authority-http-panels` cần TMPDIR ngoài source/Git để guard prepare-secrets không chặn fixture; không bỏ guard. `manual-candidate-ui` còn assertion cũ, FAIL trên cả hai Android. Self-test chưa gọi cả ba runner mới liên quan.
- Git Bash `C:\Program Files\Git\bin\bash.exe` có sẵn, 32 shell syntax checks PASS; WSL bash bị từ chối không có nghĩa không thể tự kiểm Shell trên Windows. Public Panel từ cả hai Android trả 302 Access; lỗi schannel Windows trước đó không xác định origin hỏng.
