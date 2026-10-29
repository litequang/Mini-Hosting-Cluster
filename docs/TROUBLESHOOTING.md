# TROUBLESHOOTING / an toàn vận hành

## N1 installer bị gián đoạn PC/SSH

Không suy ra script trên Android đã dừng khi PC restart. Kiểm metadata ~/.local/state/mhc-new-node-install/installer.pid, installer.exit, progress.json và install.lock; chỉ đọc các field stage/phase/completed/errorCode, không gửi log thô/credential. Trong bootstrap chưa có Node thì PID/log/source-commit vẫn là checkpoint, chưa có progress.json không tự có nghĩa chưa có process. Nếu launcher/lock còn chạy thì theo dõi, không chạy lại. Khi dừng, retry đúng pinned bootstrap/source ban đầu; changed source/manifest/output phải được điều tra, không xóa journal hoặc rotate identity. Cổng8022 từ chối thì cần mở Termux/chạy sshd cứu hộ; sau cài phải kiểm runit SSH + Boot, không xem standalone daemon là tự phục hồi.

## P3.3 Manual LAB: còn AWAITING_PUBLIC

P33_TRANSITION_PENDING nghĩa là chưa được bắt đầu một lượt chuyển khác. Đọc phase/journal và target thực: DNS/site/Control có thể đã đổi, lease có hiệu lực nhưng Primary chưa COMMITTED vì đang chờ signed Internet proof. Tải lại panel-lab.giaouoc.com rồi chỉ bấm **Hoàn tất kiểm tra Internet**; dropdown không quyết định target khi confirm. Khi COMMITTED/journal VERIFIED mới bắt đầu chuyển tiếp. Không xóa pending/lock, fake proof hoặc dùng localhost thay Access. Thông báo lỗi của lượt bấm begin lần hai không có nghĩa lượt chuyển đang chờ đã thất bại.

## P3.2 read-only LAB

- P32_WORKER_NOT_CONFIGURED/P32_NOT_ENABLED: kiểm Worker hiện hữu đã có source P3.2 và đúng vars/secret; không bật MHC_P3_LAB_ENABLED để lách guard P3.1. Có OAuth Wrangler không đồng nghĩa có DNS/Access permission.
- P32_EXACT_LAB_ALLOWLIST_REQUIRED/P32_TWO_SEPARATE_TUNNELS_REQUIRED: chỉ panel-lab.giaouoc.com và preview-lab.giaouoc.com, đúng2 node/tunnel khác nhau; không sửa allowlist thành hostname production.
- P32_PROOF_* hoặc P32_SIGNATURE_INVALID: refresh epoch/revision/challenge, public key pin; không đọc/copy private key hoặc tắt signature check. Client giữ bounded error code có chữ số để Panel hiển thị P32 cụ thể.
- P32_PUBLIC_ACCESS_ORIGIN_REQUIRED/P32_CONFIRM_FROM_PUBLIC_LAB_PANEL_REQUIRED: xác minh từ Panel LAB thật qua Access, localhost proof không chứng minh tuyến Internet. Không rewrite Panel Host thành127.0.0.1; preview Host override riêng18131 là cấu hình khác.
- AUTHORITY_P32_NO_CONFIRMABLE_ROUTE khi bấm xác minh lần nữa: đọc journal trước. Nếu VERIFIED/ROLLBACK_VERIFIED và httpVerified=true, lượt đầu đã hoàn tất, không cần chọn node hoặc chuyển DNS lại. Nếu journal chưa VERIFIED thì không suy thành PASS: kiểm trạng thái/fingerprint/cấu hình hiện hành. Nút xác minh dùng origin Panel LAB đang phục vụ; dropdown target chỉ dùng cho thao tác chuyển tuyến.
- P32_PUBLIC_PREVIEW_IDENTITY_MISMATCH/P32_PUBLIC_PREVIEW_UNREACHABLE: kiểm Access cùng AUD cho2 LAB hosts, cloudflared required JWT, header/node và body hash, cache bypass; giữ DNS_AWAITING_HTTP, không đánh dấu PASS từ CNAME.
- P32_ROUTE_PENDING: journal còn DNS_REQUESTED/DNS_AWAITING_HTTP, chưa cho begin/abort làm tắt preview khi đang đổi tuyến. Kiểm DNS, resume ≥60s hoặc rollback có điều kiện. ROLLBACK_DNS_AWAITING_HTTP cho phép chuẩn bị lại preview trên old node; DNS rollback không tự chứng minh HTTP/dữ liệu.
- P32_CONFIG_CHANGED_DURING_ROUTE/P32_SPLIT_ROUTE_ROLLBACK_REQUIRES_REVIEW: không ghi đè journal hoặc target tùy ý; đối chiếu route/site/Panel thực trước. Không xóa pending lock mù.
- Fixture tar đóng từ Windows có thể mất executable bits: khôi phục mode từ Git100755 **chỉ trong HOME/source fixture** trước test. Không đổi chmod live để sửa test. Package upgrade dùng explicit manifest modes nên kiểm riêng.

## P3.1 candidate nội bộ

- `P31_UNPROVEN_WRITER_FENCING` / `P31_CLOUDFLARE_AND_WRITER_CUTOVER_DISABLED`: fail-closed có chủ đích, không sửa flags hoặc dùng checkboxes DNS-only cũ để bypass. Preview hoạt động không đồng nghĩa Primary đã chuyển.
- `P31_DATASET_CHANGED` / `P31_SQL_READ_ONLY_NOT_VERIFIED`: so manifest và SHOW GRANTS của DB LAB riêng; không mở quyền ghi để sửa lỗi preview. Site Vsmart gốc không thuộc service `mhc-lab-p31`.
- `P31_PROOF_*` / `P31_AUTHORITY_REVISION_EPOCH_CHANGED`: lấy challenge/proof mới, refresh pending/epoch từ authority; không tái dùng proof đã hết hạn. `P31_PEER_UNAVAILABLE`: kiểm dedicated forced-command key và pinned known_hosts bằng đường SSH cứu hộ bình thường; không tắt StrictHostKeyChecking.
- `P31_OPERATION_LOCKED_INSPECT_IF_CRASHED`: kiểm process/journal trước, không xóa lock mù. Restart supervisor đưa về quarantine; phải chuẩn bị mới. Cứu hộ/runbook ở P3-INTERNAL-CANDIDATE.md.

## Unified source upgrade 27/10

Entry hiện hành là update.sh trong package do scripts/build-node-upgrade.mjs tạo từ commit; xem NODE-SOURCE-UPGRADE.md. Không gọi raw updater 13 file cũ để chuẩn hóa version. --plan/--verify kiểm manifest, --apply có automatic rollback files + Panel/Agent processes; source release thật ghi ở ~/.local/state/mhc-source-upgrade/current.json, marker TEST legacy giữ nguyên. NODE_NOT_APPROVED_LAB/PRODUCTION_OR_INCOMPLETE_NODE/UNKNOWN_*_BOOT phải được điều tra, không sửa marker/identity để bypass. Rollback failure giữ backup/journal, cần cứu hộ SSH, không xóa lock mù.

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


## P3.2 Worker DNS network failed trước khi gửi API

Nếu Worker báo P3_CLOUDFLARE_NETWORK_FAILED nhưng DNS token GET bằng CLI vẫn PASS, kiểm fetch options trong workerd thật; Node mocks không đủ. Runtime workerd hiện từ chối redirect:error ngay khi tạo Request. Dùng redirect:manual và từ chối !response.ok, không follow Location vì request mang Authorization. Nguồn runtime: [Cloudflare workerd http.c++](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B). Local probe bằng cùng compatibility_date2026-10-01 tái hiện error rejected/manual accepted; regression phải kiểm manual và3xx fail-closed trước PATCH.

Sau lỗi, giữ journal DNS_REQUESTED; kiểm actual records, sửa/deploy Worker giữ DO/vars/secrets, đợi cooldown rồi p32-resume bằng readiness mới. Không abort pending P3.1 hoặc tự sửa DNS ngoài journal để làm test qua. DNS_AWAITING_HTTP chỉ là API PASS; vẫn cần Access origin proof qua Panel LAB thật trước khi đổi ứng viên.


Nếu API deployment báo version mới100% nhưng sharedStatus/sourceCommit từ Android vẫn cũ, không coi deploy là đã chạy code mới. Durable Object có thể còn chạy version cũ trong đợt rollout; dùng CLI versions deploy cùng version với --durable-objects-code-update-mode immediate khi LAB read-only, không đổi lifecycle/schema và cần giữ journal/storage. Hậu kiểm SHA từ cả node và revision/epoch/pending trước retry; không tạo namespace/cluster mới hoặc xóa state. P3.2 đã gặp đúng trường hợp này và giữ nguyên journal khi cập nhật.

N1: JOIN_RUN_WITHOUT_CODE_ARGUMENT_OR_USE_STDIN nghĩa là chạy ~/mhc-full join, dán mã vào lời nhắc ẩn; không đưa mã vào argv/chat. JOIN_INPUT_TIMEOUT/CANCELLED không ghi mã. N1_SUPERVISOR_NOT_READY_RETRY_SAME_RELEASE: giữ journal, chạy lại đúng bootstrap/hash ban đầu; không xóa state. NODE_NOT_APPROVED_LAB trên node N1 khi source upgrade cần --node-id đúng identity đã join; membership/telemetry lỗi thì khôi phục Agent, không bỏ gate. AUTHORITY_TRANSITION_BLOCKS_UPGRADE cần hoàn tất/khôi phục journal hiện có. Onboarding có Tunnel running vẫn cần signed Control proof; có site metadata vẫn cần restore/guard được xác minh.

## N1 self-service Tunnel/Control

N1_CF_TUNNEL_PERMISSION_REQUIRED: grant một lần Account → Cloudflare Tunnel → Edit, chỉ account35b2468610cfa060d5d02865b7996a74; chạy tools/configure-cloudflare-n1.ps1 nhập token ẩn vào Worker Secret. OAuth Wrangler trên PC không thay token bền vững này. Không thêm DNS/Access/Workers permission hoặc gửi token chat. Agent tự retry, không cần tạo token từng node.

N1_PROVISION_IN_PROGRESS: intent/API trước còn cửa sổ phục hồi; đợi Agent retry, không xóa journal hoặc tự tạo Tunnel cùng tên. N1_EXISTING_TUNNEL_CONFIG_CHANGED/N1_SETUP_EXISTING_*_DIFFERS: cấu hình khác bản đã duyệt, dừng để kiểm tra; không ghi đè config/token/service hay reset identity. N1_CONTROL_PROOF_PENDING/CONTROL_PROOF_STALE_OR_MISMATCH: cần Agent/Tunnel online và proof mới sau revision thay đổi; Panel có retry ngắn, tải lại nếu có tác vụ đồng thời. N1_APPROVED_FRESH_MEMBERSHIP_REQUIRED: node cũ chỉ joined không tự được Control; cần public pin đã được invite phê duyệt hoặc registry operator hiện có. N1 không giải quyết site restore hoặc writer guards bằng một checkbox.

N1_WORKER_SECRET_INSTALL_FAILED từ bản helper CLI cũ: token đã qua Tunnel permission check nhưng CLI secret put lỗi; giữ token, dùng helper hiện hành với API PUT named secret bằng OAuth riêng. PowerShell hiện capture stdout/stderr và chỉ hiện mã N1_, không echo raw output/credential. Không thêm Workers permission vào token Tunnel để vượt lỗi. Sau user báo thành công vẫn phải đọc metadata binding + actual Agent reconcile; settings/version mới nhưng DO source cũ chưa là deploy PASS, kiểm versions deploy/DO code update và đọc lại actual source trước nghiệm thu.

### N1.3: probe HTTP301 hoặc recorded Primary không nâng source được

- Node26 Android fetch có thể không gửi Host tùy chọn như HTTP proxy. Probe Standby dùng node:http, Host preview-lab.giaouoc.com, loopback18135/PHP19135, có timeout/cleanup và SQL SELECT-only; không sửa WP_HOME/database chỉ để qua probe.
- Recorded Primary với lease hết hạn không chứng minh writer đã dừng. Upgrader yêu cầu proof FENCED mới15s ký đúng pin và khớp epoch/revision/operation, SQL denied/zero connections/HTTP+children stopped, local Standby; lease/role active hoặc proof thiếu vẫn từ chối. Không đổi Authority/DNS để vượt gate.
- Restore báo SITE_EXISTING_DATA_REFUSED_USE_VERIFY: giữ nguyên site/schema/user; dùng Kiểm tra lại. Retry phải giữ cùng job/journal, không chạy install.sh hoặc xóa DB để tiếp tục.
