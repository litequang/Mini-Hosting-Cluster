# MHC — trạng thái thực thi duy nhất

Checkpoint 27/10/2026 sau hậu kiểm hai Android. Đây là trạng thái hiện hành; checkpoint cũ tra Git history. Branch: codex/m1-m2-foundation, checkout: E:\CODE\MHC\MHC\.work\repository. Không sửa bốn phần clock-health ở workspace cha, M51/X7b hay Cloudflare production.

## P3.2 — source/config/test: DONE; nghiệm thu tuyến Internet: IN PROGRESS

- **Hai Android thật:** Vsmart và XZ3 cùng MHC-LAB-20261027-P32, source **d791938d3cc46dcf8ef71cf978ee19d599d773d6**, verify81/81 PASS. Vsmart tx-20261027093915331-6a0c14/package incoming/release.lCMt9J; XZ3 tx-20261027092914147-40363d/package incoming/release.viWeHb. Panel/Agent chạy; reload riêng supervisor preview tại Standby PASS, HTTP18131 đóng như dự kiến. Không reinstall/restore đè/reset password.
- **Bảo toàn:** trước cấu hình Access, config/admin/SQL hai node và toàn bộ website Vsmart so backup PASS; Vsmart / và /wp-login.php18080 HTTP200. Thêm LAB app giữ base Access panel.giaouoc.com/Team/AUD cũ; backup private tự động. Panel Vsmart đăng nhập mật khẩu cũ, signed readiness cả hai phiên bản P32 và CSRF denial PASS. XZ3 login tự động bằng password vẫn NOT RUN vì không có file test private; không đổi mật khẩu.
- **Cloudflare đã hoạt động thật qua CLI/API:** tạo riêng Tunnel **mhc-xz3-lab/b2841269-62bd-4680-9918-3b62cfad56e5**, token chỉ file0600 trên XZ3, connector service chạy PID22434. Vsmart Tunnel3d23199a-decb-4de9-87b4-81afd508db18 giữ nguyên. Merge đúng hai ingress LAB trên cả hai, giữ toàn bộ non-LAB rules; Access required/team/AUD LAB ở cloudflared, preview Host override127.0.0.1:18131.
- **Access/DNS LAB:** app **343f4bcd-5665-40ac-858c-32559e8fef9b**, AUD83ea59226e8457609f0a91c896474ef71ad25dcca1f08bebf78432d79764d227, hai hostname chính xác,1h, sao chép đúng email allow của app hiện có; không Everyone/Bypass. CNAME proxied ban đầu về Vsmart: panel-lab record9f7fbf3385bf9fb02da5fd61e410de24; preview-lab record3c7d763443e3b254c42840436f36a285. Hậu kiểm canonical API: original app/policy/DNS panel.giaouoc.com không đổi. Anonymous HTTPS cả hai LAB302 sang đúng Team Access; production Panel cũng302 như trước. User báo đã đăng nhập Panel LAB; chưa thay thế signed end-to-end confirmation.
- **Worker thật:** source d791938 deploy vào Worker hiện hữu, version **22644d7d-47a9-4b98-b860-751e098e9a24** (source-only version trước6bb09d0a-6b12-4d83-bb75-a0b2fecf3145; trước P32a616d65b-da3e-436b-a554-39751c11c5c9). Giữ namespace **c941ad9ddcaa4dfdbe474d429a37d8f8**, membership/cluster secret refs; sourceCommit/workerBuild đọc từ hai node khớp. Chỉ DNS-ONLY token được nạp MHC_P32_CF_TOKEN, CONTROL giữ Windows DPAPI. Allowlist exact hai hostname/record IDs và hai Tunnel khác nhau/public proof keys hai node khớp pin. Cron1phút đã deploy; **recovery vẫn tắt**.
- **Authority tại checkpoint:** revision7/epoch2, declaredPrimary/pending null, lease false; routeRevision0/journal null, cả hai LAB heartbeat/metrics recent. P32 bật read-only; legacy promote/route/complete giữ guard, không bật P4. Nguồn này có CAS/receipt/audit/routeRevision riêng, pinned Ed25519, DNS retry/rollback, Access origin proof, Panel-only recovery/no-failback; chưa coi source/fixture là nghiệm thu Cloudflare.
- **PASS Windows:** Access process/session host+JWT/CSRF/logout multi-host/AUD;18 candidate scenarios; P32 real Ed25519+DO/DNS fault/CAS/concurrency/replay/retry/rollback/recovery fixtures; GET-only audit/redaction/plan/OAuth bearer CRLF; authority/bridge/UI structural/syntax; Wrangler dry-run49.85KiB. Không phải test Android/Internet.
- **PASS Android fixtures riêng trên mỗi điện thoại:** full bin/self-test.sh FULL_SUITE_EXIT=0,22 candidate scenarios,57 Remote Panel assertions; archive SHA256 ab38748fd49b94d43ae0ad4b5ecfc858a870df2e5dee84e01abba7cc3ca4d1c1. Sau guard distinct keys/mapping, focused P32+audit rerun cả hai PASS. Full suite lần đầu FAIL126 vì Windows tar mất executable bits fixture; khôi phục đúng Git100755 rồi rerun PASS, không sửa assertions/runtime để lách test.
- **Helper credential Windows:** lỗi Set-Acl/SeSecurityPrivilege đã sửa sang persist DACL-only, verify chỉ user/SYSTEM. Kiểm thực **ADMIN_TOKEN=False**, ACL PASS và synthetic full input/save/DPAPI round-trip/no-overwrite PASS ngoài sandbox impersonation; không đọc token thật trong test. Sandbox ban đầu thiếu profile DPAPI/network/key access, rerun bằng execution context máy công ty đã được phép PASS; không yêu cầu user chạy Administrator. User đã lưu hai token và API Access/DNS GET thật PASS; 403 cũ đã hết là blocker.
- **NOT RUN/thiếu DoD:** signed public origin/preview verification; chuyển read-only hai chiều Vsmart→XZ3→Vsmart; HTTP/SQL/media qua Access khi đổi tuyến; rollback/recovery outage Cloudflare thật và no-failback; reboot/Doze. Connector process/anonymous302/user login không chứng minh các tiêu chí này. P3.3 safe writer/fencing vẫn BLOCKED do privileged/same UID writers ngoài gate; không cấp writer production.
- **SHA:** source node/Worker d791938; helper/audit nền f81e526397b4648940802fbfaeeb5e0431845900; SHA checkpoint này tra `git log -1 --format=%H -- docs/LIVE-PROGRESS.md`. Artifact manifest84c141eccca5e212898e30af9d87e3868bb4e0ec8d13aca0652dcce26bfc531d; tar SHA2565b977b6160987dc80816d4f5848af53d9ca67aae25ef442ec3568e296d1e6b3c, releases/MHC-LAB-20261027-P32.tar. Không suy ra đã deploy helper/docs SHA lên phones.
- **Blocker cần user:** tương tác đăng nhập Access thật khi xác minh public Panel; user vừa báo đã vào Panel LAB, không cần thêm API token/quyền Cloudflare ở checkpoint này. **Một việc tiếp theo:** chuẩn bị preview Vsmart rồi route ban đầu bằng journal và xác minh signed proof từ phiên Panel LAB thật; chưa bật recovery trước manual acceptance.
- Runbook/contract: [P32-CLOUDFLARE-LAB.md](P32-CLOUDFLARE-LAB.md). LIVE-PROGRESS là nguồn trạng thái duy nhất; phần P3.1 bên dưới là lịch sử, không chỉ dẫn dừng P3.2 hiện hành.


## P3.1 — checkpoint trước: DONE trong phạm vi read-only

**P3 Manual Primary an toàn vẫn BLOCKED.** Không coi rehearsal read-only là chuyển Primary.

- Cả Vsmart và XZ3 chạy MHC-LAB-20261027-P31, source **774f7c97a10226bf33c1bc27e16504ad612f98d3**, verify **81/81** file live/managed/launcher/Boot PASS. Manifest SHA-256: b43178ca201767d8caa834ab4fa7bf5f8ce7426e6345383b1f451d3161060ce0.
- Đọc lại qua Panel Vsmart đăng nhập thật: authority **revision7 / epoch2**, declaredPrimary null, pending null, writeLeaseGranted false. Hai proof verified, previewReady true, websiteServing false, activation STANDBY_QUARANTINE. HTTP18131 đóng/P31_HTTP_UNAVAILABLE là trạng thái dự kiến sau thử nghiệm, không phải lỗi website Vsmart gốc. Không còn pending cần resume.
- Hoạt động thật: original Panel9090 và Agent/Monitor trên mỗi node; signed readiness hai node; begin/CAS → prepare → preview read-only → HTTP/SQL/media/static check → Standby → abort. Dedicated peer SSH chỉ forced-command, pinned host/proof keys; shell bị từ chối. Journal/receipt/lock cho retry; restart/rejoin luôn quarantine và giữ Panel/Agent/SSH.
- Proof Ed25519 gắn node/cluster/version/epoch/revision/operation, nonce ngẫu nhiên, TTL15s và authority đọc lại; không dùng heartbeat thay readiness. Scope ISOLATED_P31_DATASET_ONLY, nodeWritersFenced false.
- Promote luôn bị P31_UNPROVEN_WRITER_FENCING; route/route-resume/complete bị P31_CLOUDFLARE_AND_WRITER_CUTOVER_DISABLED trước Cloudflare mutation, dù đủ checkbox. Authority chưa có writer lease/commit Primary.

### Dữ liệu, backup và quyền ghi

- Website WordPress/static Vsmart gốc giữ nguyên. Backup private: ~/.local/state/mhc-p31-lab/backup.0PwO4C; pointer latest-backup-path. SQL thật đã checksum/gzip/restore DB riêng mhc_p31_restore_check và đối chiếu số bản ghi PASS. SQL/users/password hashes/wp-config/options/credentials không chuyển khỏi Vsmart.
- Hai node có dataset mới mhc-p31-synthetic-v1, thư mục ~/.local/share/mhc-p31-lab, DB mhc_p31_lab, user web mhc_p31_web, password/salts sinh riêng từng máy. Core/media/static từ LAB Vsmart, archive SHA-256 e36875944a676e19a7ff39c78cd27468ad09e6864ab2a7bda0aff2a31e21ecf0. **Không phải bản sao đầy đủ WordPress gốc.** SQL synthetic mỗi node đã checksum/gzip/restore vào DB mới mhc_p31_restore_probe PASS, không restore đè/drop DB.
- Đã chặn/kiểm thật trong dataset: HTTP chỉ GET/HEAD; POST/login/admin/cron/XML-RPC/REST/upload PHP bị chặn; WordPress cron/file modifications/outbound HTTP tắt; SQL SELECT-only, UPDATE bị từ chối. Manifest kiểm cấu hình private mà không xuất nội dung. PHP/Nginx riêng loopback19131/18131, không đụng WordPress gốc18080.
- **Chưa fence độc lập:** privileged/root SQL, shell/Node/PHP tùy ý, file ghi trực tiếp cùng Android UID, cron/job/service ngoài fixture và writer website gốc. Dừng nginx, mất heartbeat, SQL read_only hoặc nhãn Primary không chứng minh các đường này đã đóng. Safe Primary tiếp tục fail-closed; không cấp writer production.
- MariaDB PUBLIC từng thừa hưởng quyền ghi mặc định test/test-pattern. Preflight hai node xác minh schema mặc định rỗng, 0 bảng/explicit app grants; backup private rồi revoke đúng hai scope không dùng. Application grants/passwords giữ nguyên. Helper plan/apply từ chối schema đang dùng/grant lạ, restore nếu verify lỗi. Guard SELECT-only vẫn nghiêm ngặt.

### Test và bằng chứng

| Kiểm tra | Windows mock/source | Vsmart Android | XZ3 Android / nhiều Android |
|---|---|---|---|
| Candidate protocol | PASS17 scenarios + setup adoption/error redaction | PASS21 scenarios + setup, HOME fixture cách ly, source cuối | PASS21 scenarios + setup, HOME fixture cách ly, source cuối |
| Full bin/self-test.sh | NOT RUN toàn suite; focused/syntax PASS | PASS snapshot nền P3.1, FULL_SUITE_EXIT=0 | PASS cùng snapshot nền P3.1, FULL_SUITE_EXIT=0 |
| Source cuối774f7c9 | PASS focused/syntax; updater20 và SSO/bridge/UI/P3 route liên quan PASS ở nền | PASS focused candidate/setup + verify81/81 + live | PASS focused candidate/setup + verify81/81 + live; full suite không chạy lại ở SHA cuối |
| HTTP/PHP/SQL/static/media | Không coi mock là hosting thật | PASS dataset riêng; site gốc / và /wp-login.php HTTP200 | PASS dataset riêng, media/static bytes khớp, SELECT/UPDATE denied/HTTP403 |
| Auth/CSRF/peer | PASS fixture401/403 | PASS mật khẩu hiện có, readiness chưa login401, POST thiếu CSRF403 | PASS signed peer và dedicated key từ chối shell hai chiều; login chính Panel XZ3 NOT RUN |
| Rehearsal hai hướng | Không áp dụng | PASS chọn/preview target XZ3 rồi target Vsmart qua API Panel Vsmart thật | PASS hai target Android thật; thao tác từ hai Panel đã login/browser click NOT RUN |
| Hai request đồng thời | PASS fixture CAS | PASS hai client cùng Panel Vsmart, đúng1 accepted/1 REVISION_CONFLICT | NOT RUN concurrency từ hai Panel vật lý |
| Agent loss/restart/SIGKILL | PASS fixture, stale/replay/epoch/tamper/retry/concurrency | Management/Standby giữ khỏe | PASS fault live XZ3: dừng preview/quarantine, không auto resume, giữ Panel/SSH; SIGKILL reap child groups |
| Authority outage | PASS fail-closed fixture | PASS process fixture trên Android | NOT RUN outage mạng authority live; không cắt endpoint đang dùng |
| Heartbeat ổn định | PASS boundary future>2s/stale>90s | Guard cùng chính sách | PASS live37s, 14 HTTP200 qua2 heartbeat mới; age -533ms đã sửa bằng dung sai2s, không nới stale90s |
| Source rollback/reapply | PASS updater fault fixture | Backup/verify PASS, không rollback live | PASS rollback thật rồi áp lại cùng artifact; rev4/epoch1 giữ nguyên lúc thử, không rollback DB/route |
| Reboot/Doze/cold boot | Không áp dụng | NOT RUN | NOT RUN; Doctor LOCAL_PASS/Boot READY không thay nghiệm thu reboot |
| Safe writer Primary/Internet cutover | BLOCKED | BLOCKED | BLOCKED; không đổi DNS/Worker/Access/secrets hoặc cấp lease |

Full-suite snapshot archive SHA-256: 2429107dad06022cc0cc9d1c9da294e2c68d29c8a1e98cb031e405ee0f4840f9. Chỉ focused và live checks chạy lại trên source cuối. Đã dọn riêng fixture PREFIX/tmp do phiên này tạo; full logs giữ private tại ~/.local/state/mhc-p31-lab/test-evidence/. Backup/package/dataset giữ nguyên, không đưa raw logs/SQL/credentials lên Git.

Rehearsal thật: target XZ3 operation bb9ad49e-07a2-40c5-be1e-206b65b7284d, rev4/epoch1 → abort rev5; target Vsmart operation 0acffbd4-0c50-4f90-bf61-002b8d8b6dee, rev6/epoch2 → preview/Standby → abort rev7. Mỗi target HTTP200/PHP/static/media và signed proof PASS, writer luôn false. Website gốc Vsmart phục vụ suốt, chưa hạ writer gốc thành Standby.

Hậu kiểm cuối: config/admin/remote-access bytes cả hai không đổi; toàn bộ website Vsmart khớp backup; SQL SELECT1 PASS cả hai. Vsmart Panel/Agent PID13942/13949; Tunnel10536, SSH10518, nginx10524, MariaDB10514, WP PHP10516/nginx10513 giữ nguyên qua rollout. XZ3 Panel/Agent PID31406/31408 sau reapply, SSH22197 giữ nguyên. XZ3 không có site gốc18080/Tunnel/WP services là đúng phạm vi, không phải regression. Doctor LOCAL_PASS hai node.

### Commit, artifact và phục hồi

- Đã push: **f0c6d00** dataset/backup; **0a43313** candidate/proof/Panel; **a1fa578** SVDIR cho setup SSH; **774f7c9** PUBLIC guard, runit adoption, clock skew có giới hạn, lỗi peer an toàn và acceptance client.
- SHA checkpoint tài liệu này: tra git log -1 --format=%H -- docs/LIVE-PROGRESS.md. Source cài trên node vẫn774f7c9; docs commit không có nghĩa đã deploy lại.
- Artifact: E:\CODE\MHC\MHC\releases\MHC-LAB-20261027-P31.tar; SHA-256 **35d9ecf8e3ab546502c632d295dec97b8d31b07acc0bf29e693876c92bd7dbd9**. Thư mục package và .tar.sha256 cùng nơi; build từ immutable Git blobs774f7c9, không có dữ liệu/credentials thiết bị.
- XZ3 package: ~/.local/state/mhc-source-upgrade/incoming/release.8pQbE4; final APPLIED tx-20261027081210263-fe1d24, rollback đã thử tx-20261027080516885-be58fc. Vsmart package: incoming/release.MKen4O; APPLIED tx-20261027080711222-b6c4da. Mỗi package có preflight-path tới backup private; current.json chỉ version/transaction trên node. Không chọn rollback theo mtime hoặc dùng updater cũ.
- Truy cập/preview/rollback: [CONTINUE-MHC.md](CONTINUE-MHC.md), [P3-INTERNAL-CANDIDATE.md](P3-INTERNAL-CANDIDATE.md), [NODE-SOURCE-UPGRADE.md](NODE-SOURCE-UPGRADE.md). Không reset mật khẩu; file test password XZ3 vẫn ABSENT ở hậu kiểm cuối.

## Các milestone còn lại

| Milestone | Trạng thái | Hoạt động thật / source và SHA | Thiếu DoD / blocker cần user | Một việc tiếp theo |
|---|---|---|---|---|
| P0 kiểm kê/bảo vệ, đồng bộ hai LAB | DONE theo phạm vi | Git/SSH/backup/upgrade+rollback canary thật PASS; baseline5cce13c, hiện774f7c9 | Không phải audit production | Giữ backup, đọc current.json trước thay đổi |
| M1/P1 hosting | IN PROGRESS | Vsmart WP/PHP/SQL/upload/backup/restore thật PASS26/10, source889786e; hậu kiểm mới PASS; XZ3 dataset riêng PASS774f7c9 | Reboot/Doze NOT RUN, cần operator/đường cứu hộ | Hẹn reboot canary XZ3 có người mở Termux nếu cần |
| M2/P2 Panel và authority | IN PROGRESS | Hai Android9090+Agent/Monitor/shared authority/proof thật PASS774f7c9; login Vsmart PASS | Login/browser XZ3, AccessJWT hợp lệ Internet và Panel dự phòng NOT RUN | Kiểm login Panel XZ3 bằng mật khẩu hiện có |
| P2.5 website/subdomain tự động | NOT STARTED runtime | Tạo site cục bộ có source; chưa tích hợp publishing Cloudflare vào nút tạo; route fixture PASS ở baseline5cce13c | Cần account/zone allowlist khi được giao P3.2 | Chốt domain/route cần quyền LAB trong P3.2 |
| M3/P3 Manual Primary | BLOCKED; nền P3.1 DONE | Hai target read-only rehearsal thật PASS774f7c9; chưa writer lease/Primary commit/Internet route | Fencing mọi writer chưa có; Tunnel/Access XZ3 và public recovery NOT RUN | Chốt giới hạn writer/lease trước mở promote |
| M4/P4 Auto Primary | NOT STARTED runtime | Legacy recommendation/source route có, không là auto mới; nền774f7c9 chặn promote | Manual chưa đạt DoD, chưa nghiệm thu reboot/partition/recovery | Tái dùng luồng Manual khi đạt DoD |
| P5 migration M51/X7b | NOT STARTED | Không truy cập/sửa production, chưa test migration | Backup độc lập và user duyệt từng mốc | Giữ nguyên production đến khi LAB đạt DoD |

**Blocker cần user:** chưa nhập file private test password Panel XZ3; reboot cần người/đường cứu hộ. Fencing và writer lease là phần kỹ thuật còn thiếu, không yêu cầu user tự chạy test thay. F3216 là LAB ở nhà, không dùng thay hai LAB công ty và không thao tác.

**Chỉ dẫn lịch sử P3.1 (đã được P3.2 hiện hành phía trên thay thế):** user đăng nhập Cloudflare tạo named Tunnel riêng XZ3, nhập token trực tiếp private; cùng issuer/AUD/policy Access cho Panel, ingress đúng localhost9090; kiểm Worker/DO hiện có và allowlist zone/hostname/Tunnel UUID. Sau đó nghiệm thu website/Panel route độc lập, Panel recovery khi incumbent mất, journal và rollback có điều kiện dữ liệu. Checklist ở P3-INTERNAL-CANDIDATE. Không tự đổi DNS/deploy Worker/nạp secrets/bật auto recovery trong P3.1. HTTP302 trước login không chứng minh Access/JWT end-to-end.

**Việc tiếp theo tại checkpoint P3.1 cũ (không còn là việc hiện hành):** kiểm login/API từ original Panel XZ3 sau khi có file private, rồi bố trí reboot canary có cứu hộ. Bàn giao tại Standby, dừng trước P3.2/Cloudflare/Internet cutover theo prompt.
