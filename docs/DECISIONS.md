# DECISIONS — quyết định đã thống nhất

## 29/10/2026 — Chốt P4 Lite: dữ liệu đã áp dụng, một cặp máy trước

**DESIGN/PLANNED**, không phải Auto runtime đã nghiệm thu. Hoàn tất N1.3 hiện hành trước; sau đó P4.0 → P4 Lite → HP1 → HP2 → HP3. Không đưa scheduler hay Auto vào N1.3.

- **NEWEST_VERIFIED_DATA là mặc định.** Lọc node online, đúng site, build/schema tương thích, snapshot **APPLIED + VERIFIED**, HTTP/API/PHP/SQL và managed writer gates đạt, Tunnel/route khả dụng, đủ điều kiện Authority. Sau đó xếp theo **thời điểm snapshot nguồn đã restore thành công**, mới nhất trước. Không dùng heartbeat, mtime ZIP, lúc truyền xong hoặc restoreAt thay độ mới dữ liệu. Bằng nhau: ưu tiên cấu hình của website rồi Node ID để phân xử ổn định.
- **FIXED_PRIORITY là tùy chọn theo website**: thử theo thứ tự cấu hình, bỏ qua node không đủ điều kiện. Không vượt readiness/fencing vì ưu tiên cao; hiển thị tuổi dữ liệu/RPO và từ chối tự chọn nếu quá giới hạn tuổi dữ liệu của website. Hai chính sách cùng dùng một bộ lọc an toàn.
- **MVP một WordPress LAB, một Primary + một Standby.** Hoàn thành tự chuyển một cặp đã kiểm trước; mở rộng nhiều Standby và UI chọn hai chính sách sau nghiệm thu MVP. Contract có thể mở rộng nhưng không xây scoring CPU/RAM/pin, election, Controller hoặc Authority thứ hai.
- P4.0 mặc định60phút, Đồng bộ ngay, ON/OFF theo website; chỉ thành công sau created → transferred → restored → verified. Lưu Site ID, source/target Node ID, source snapshotAt, restoreAt, checksum, build/schema khi có, verification và RPO thực. Lỗi giữ bản Standby đã xác minh trước; không ghi đè dữ liệu đang phục vụ hoặc đích chưa được xác nhận an toàn.
- Auto dùng heartbeat + website/Tunnel, chứng minh lease cũ hết và self-fencing các đường ghi managed, lọc/chọn candidate rồi **tái dùng P3.3 CAS/epoch/lease/activation/route**, hậu kiểm public HTTPS/app/DB và ghi journal/RPO. Không chứng minh được fencing hoặc mất Authority thì fail-closed. Node cũ rejoin Standby/quarantine, không giành Primary/ghi đè DB; phải sync lại trước khi đủ điều kiện dự phòng.
- Không GTID/binlog/CDC/đồng bộ hai chiều/file realtime. Không giảm bảo vệ chống hai managed writers. UI per-site đầy đủ là mở rộng, không chặn MVP. Contract tại [PERIODIC-SNAPSHOT-SYNC-LITE.md](PERIODIC-SNAPSHOT-SYNC-LITE.md); bằng chứng IMPLEMENTED/PASS chỉ ở LIVE-PROGRESS.

## 29/10/2026 — GIỚI HẠN MVP: sync định kỳ đơn giản, không replication realtime

- Quyết định mới nhất có ưu tiên cao hơn roadmap cũ: P3.3 Manual LAB đã DONE; Codex **hoàn tất N1.3 hiện hành trước, không ngắt**; tiếp đến **P4.0 Periodic Snapshot Sync Lite**, rồi **P4 Lite Auto Primary+Control**, HP1 Core/Restore, HP2 Cloudflare một zone, HP3 bảo trì nâng cao chỉ khi cần. Spec: [PERIODIC-SNAPSHOT-SYNC-LITE.md](PERIODIC-SNAPSHOT-SYNC-LITE.md).
- Snapshot backup→relay→restore có checksum/health; lịch mặc định 60 phút, một site nguồn–một Standby + Đồng bộ ngay, hiển thị Last Verified Applied/RPO. Dữ liệu có thể cũ, không đòi đồng nhất 100%, không merge dữ liệu hai chiều.
- **Không làm trong MVP:** MariaDB/MySQL GTID/binlog live replication, CDC/change streams, Galera/master-master, filesystem watcher realtime, Raft/quorum mới, distributed filesystem, consensus phức tạp, scoring nhiều cấp, file/delta replication tự thiết kế, backup enterprise, cPanel mới, website source build trên Android mặc định.
- P4 Lite chỉ một MHC-managed WordPress LAB và một cặp node đã được kiểm trước; tái sử dụng P3.3 Manual/Authority. Tuyệt đối giữ scoped writer self-fencing/lease expiry/CAS/signed public proof; không auto promote khi chưa chứng minh old writer đã ngừng nhận ghi trong site scope, không auto failback.
- HP1 tối giản: Upload prebuilt dist.zip → triển khai → restart Node service; WordPress/PHP qua công cụ có sẵn; Restore ZIP + SQL + storage, health/rollback, chọn node. HP2 giai đoạn đầu giaouoc.com, Tunnel/Access đã có. HP3 không chặn MVP khi các khả năng thiết yếu đã hoạt động.
- M51/X7b: giữ nguyên, backup dữ liệu website + SQL + storage; phục hồi trên node mới, nghiệm thu thật trước; chỉ cài lại node cũ/ghép Cluster sau phê duyệt. Không phát triển Adopt Existing Node tổng quát.
- Codex đọc AGENTS + LIVE-PROGRESS + ROADMAP + spec mới ở checkpoint Git an toàn; không reset/rebase, không sửa worktree live chưa checkpoint, ghi PASS/FAIL/NOT RUN đúng runtime thật.


## 28/10/2026 — N1.1 cài mới có resume

- Giữ fresh installer tách khỏi source upgrade trên node hiện có; dùng full manifest cùng Git commit. Không chạy legacy non-transactional installer rồi vá nhiều bản.
- Retry kiểm private journal/receipts và source pin, không xóa state/schema, không rotate keys/admin. SSH có thể đã mở thủ công trước bootstrap; chuyển riêng daemon listener đã xác minh sang runit, giữ authenticated session và có rescue listener nếu supervisor thất bại.
- Cài detached trên Android và giữ log/exit/journal để PC mất kết nối không làm mất mốc. Không gửi log thô/password/token vào Git/chat. N1.1 chỉ software/management, không tự join/trust/site/writer.

## 28/10/2026 — Bổ sung N1 Unified New Node Installer giữa P3.3 và P4 Lite

- Sau khi nghiệm thu **P3.3 Manual Primary/Control** hai Android, ưu tiên **N1 Unified New Node Installer** rồi **P4 Lite Auto Primary/Control**, sau đó HP1–HP3. Đây là quyết định mới nhất và thay thế thứ tự P3.3 → P4 trước đó.
- N1 phải có một bootstrap release-pin/hash cho Termux sạch; tự phát hiện cấu hình/thiếu quyền; cài Panel9090, Agent, hosting prerequisites, boot, đưa node vào shared authority bằng mã ghép 10 phút, mặc định Standby. Không copy token/node identity/SQL/password/Cloudflare secrets giữa nodes.
- Bỏ hardcode hai node tại onboarding/eligibility/updater/peer/route bằng đăng ký và allowlist được admin xác nhận + public proof keys; chỉ enrolled không có nghĩa eligible Primary. Node không có site/DB/Tunnel/lease gates thì không được route writer.
- N1 không tự chuyển Primary, không yêu cầu replication hoặc dữ liệu giống nhau 100%; P4 Lite tái dùng pipeline P3.3 sau khi dữ liệu đích sẵn sàng và writer self-fencing đã nghiệm thu.
- Codex đang chạy P3.3 tiếp tục hoàn tất; không ngắt/dừng/reset/rebase/overwrite worktree. Đọc docs/UNIFIED-NEW-NODE-INSTALLER.md khi nhận mốc N1; không claim đã nghiệm thu Android thứ ba nếu chưa có thiết bị thật.


## 28/10/2026 — Đơn giản hóa chuyển node, ưu tiên Auto Primary Lite ngay sau Manual

- **User đổi thứ tự ưu tiên:** Codex đang làm **P3.3 Manual Primary + Control** cứ tiếp tục, không ngắt; tiếp theo **P4 Lite Auto Primary + Control (LAB MHC-managed site) → HP1 Hosting Core → HP2 Domain & Automation → HP3 Backup/Advanced → P5 production theo phê duyệt riêng**. Quyết định này thay thế lựa chọn trước đó để Auto sau HP3. Xem docs/HOSTING-PANEL-ROADMAP.md.
- Mục tiêu hữu ích nhất là **website tự phục hồi khi Primary mất mạng**, không chỉ mở lại Panel. P3.2 Panel-only auto recovery giữ nguyên, không làm thành phase riêng. Control có thể route độc lập; chuyển site writer chỉ sau writer gates/lease theo epoch.
- **Không đòi dữ liệu hai node giống 100%**: backup/restore thủ công được chấp nhận, standby dùng data sẵn có dù có thể cũ; hiển thị RPO và độ mới đã kiểm chứng, không tự hợp nhất/ghi đè/đồng bộ data hoặc bắt buộc MariaDB GTID.
- **Tối giản nhưng không bỏ an toàn:** Nếu Vsmart offline thì không thể yêu cầu Vsmart tắt writer qua mạng. Chỉ auto promote XZ3 khi writer lease cũ đã hết hiệu lực, các đường ghi **site thuộc MHC quản lý** tự từ chối khi authority/lease mất và node đích đủ điều kiện. Dùng single Cloudflare DO + CAS revision/epoch; không có authority thì fail-closed. Có thể tồn tại root/SQL đặc quyền/shell/cron ngoài MHC nên không khẳng định toàn điện thoại đã fence; site có unmanaged writers phải chặn auto. Chuyển tuyến phải có signed HTTPS site/node proof. Vsmart trở lại luôn Standby/quarantine và không tự failback.
- P3.3 đang thiết kế yêu cầu cả hai LAB reachable để quiesce. **Không bỏ check đó tùy tiện**; kế tiếp cần bổ sung và test self-fencing + manual old-offline takeover có bằng chứng trước P4 Lite tự động. Auto là opt-in sau controlled fault trên Vsmart/XZ3, không bật sớm và không đổi M51/X7b/production.
- GitHub docs có thể được cập nhật khi Codex VS Code đang chạy: Codex cần fetch/merge an toàn ở checkpoint phù hợp, giữ mọi sửa đổi chưa commit, không hard reset/force push hoặc giả định nhánh tự đồng bộ vào phiên đang làm.



## 28/10/2026 — Ưu tiên Manual Primary + Control có phạm vi

- User yêu cầu chuyển node thủ công trước, Auto khi lỗi/offline làm sau. Triển khai scoped writer lease cho website WordPress LAB mới, giữ site/Panel production nguyên vẹn; không để replication nâng cao chặn mốc usable.
- Chuyển Primary + Control dùng DB hiện có ở node đích với cảnh báo dữ liệu/RPO. Phải quiesce có bằng chứng cả hai managed writers trước grant; node cũ không liên lạc được thì fail-closed, không checkbox bỏ fencing.
- Phạm vi MHC_MANAGED_WORDPRESS_LAB gồm HTTP gate/PHP/Nginx và SQL app account; root/SQL đặc quyền/shell/same-UID ngoài MHC không là đã fence. Không gọi đây là độc quyền ghi toàn điện thoại hoặc production-safe failover.
- Control có thể chuyển riêng, không sửa site/lease/epoch. Khi P33 opt-in, legacy/P32 mutation và executor Cron cũ không được race cùng DNS. Giữ khả năng Control recovery P3.2 qua cùng journal P33; không tự chuyển site hoặc cấp writer. Auto Primary giữ tắt đến nhiệm vụ sau.
- Lease hết hạn không tự resurrect: resume tạo epoch mới và fence lại; sau khi có ghi, đảo chiều là transition mới có lựa chọn dữ liệu, không tự restore hoặc rollback DB cũ. Contract/cứu hộ ở P33-MANUAL-PRIMARY.md, runtime chỉ ở LIVE-PROGRESS.

## 27/10/2026 — P3.2 dùng tuyến LAB riêng, không mở writer gate

- User chọn panel-lab.giaouoc.com và preview-lab.giaouoc.com. Giữ panel.giaouoc.com; mỗi phone một Tunnel riêng, không chia connector ngẫu nhiên.
- Tái dùng adapter GET/PATCH/GET trong DO hiện có, thêm journal routeRevision riêng cho read-only LAB; không bật legacy checkbox route/complete hoặc writer promote. Declared Primary/epoch/lease giữ nguyên.
- Application LAB riêng có cùng Team/policy admin, AUD đúng app LAB; không sửa app production. Mỗi origin pin exact host/AUD, session gắn Host+JWT; SSH localhost giữ password.
- DNS-only/recovery không tự PASS HTTP: cần origin nhận Access JWT và ký challenge, public preview header/hash khớp local signed readiness. Rollback DNS read-only không rollback dữ liệu; old preview chưa bật phải hiện chờ HTTP.
- Cron Panel-only recovery không là auto election P4. Root/shell/same UID/privileged SQL ngoài guard vẫn làm safe writer Primary BLOCKED. Không dùng P3.2 để cấp writer production.
- User yêu cầu dừng thao tác trình duyệt đang dùng; ưu tiên CLI/API và quyền hiện có. Không mở thêm hoặc điều khiển Chrome để cấu hình tài khoản.

## 27/10/2026 — P3.1 nội bộ, giữ fail-closed writer

- Nhiệm vụ mới cho phép chuẩn bị dữ liệu LAB riêng, activation/proof và begin/abort trên hai Android, không cho đổi DNS/deploy Worker/Access hoặc cutover Internet. Giới hạn nhiệm vụ kiểm kê trước không ngăn công việc P3.1 mới.
- Không chuyển password hashes/users/options/wp-config của WordPress gốc giữa node. Dùng core/media/static LAB và dataset synthetic mới có mật khẩu/salts riêng, ghi rõ không là full data replica.
- Termux cùng UID/root chưa có fencing độc lập; chưa cấp Primary/writer. Chỉ preview read-only, giữ Panel/Agent/SSH/Tunnel Standby, quarantine sau restart/lỗi authority. P3.2 phải giải quyết quyền/Cloudflare và giới hạn writer trước cutover thật.

1. **26/10/2026: Panel 9090 trên tất cả node** (thay controller chuyên dụng là Panel duy nhất). Mọi Panel quản trị chung cùng một cluster.
2. **Shared authority**: không cho mỗi node tự coi mình là Primary; dùng nguồn trạng thái bền vững/tuần tự (đề xuất Cloudflare DO), không đặt dependency sống trên Primary hiện tại.
3. **Manual Primary** từ Internet hoặc Panel bất kỳ là chức năng chính; người dùng chủ động backup/restore, chọn node và xem web sau chuyển.
4. **Auto Primary** khi offline: ưu tiên node khỏe, snapshot mới nhất đáng tin; node cũ khi online bị đưa về Standby/quarantine. Không tự failback.
5. **Dữ liệu không cần bằng nhau** trong MVP; hiển thị rủi ro mất dữ liệu (RPO). Tuy nhiên dữ liệu lệch không biện minh cho split-brain ghi đồng thời.
6. **Vsmart là LAB do Codex trực tiếp cài/test qua SSH**. Không yêu cầu user chạy tests mà Codex làm được. Vsmart từng có demo/DB, cần backup và xác nhận trước khi xóa.
7. **M51 + X7b production legacy**: chỉ chuyển về cùng source MHC **sau khi** Vsmart LAB đạt và user duyệt migration. Không sửa production mặc định.
8. **Chỉ original Hosting Panel 9090**, không viết dashboard mới thay thế. Panel phụ 19090 chỉ phục vụ tương thích LAB nếu cần.
9. **Cloudflare do user thao tác nếu Codex không có quyền**: Codex chuẩn bị cấu hình scripts và chỉ dẫn. Secret không gửi qua chat.
10. **Không tạo tràn lan phiên bản TEST nhỏ**. Lộ trình tối giản: Vsmart hosting ổn -> distributed panel -> manual switchover -> automatic failover LAB -> migration -> v1.
11. **Hostname riêng mỗi node là tùy chọn** để debug/recovery, không bắt buộc triển khai MVP.
12. **Không giả vờ hoàn thành**: test giả lập != end-to-end, backend lưu node role != fencing, đổi DNS != dừng writer.

## Bổ sung 26/10/2026 — Primary phục vụ Panel, Cloudflare Access email-only
- `panel.giaouoc.com` là **một URL chung**, thông thường trỏ tới **node đang làm Primary có xác minh**, không một Panel controller cố định trên Vsmart. Các node đều chạy Panel 9090 riêng để khôi phục.
- Khi Primary offline, địa chỉ Panel chung **vẫn phải mở qua standby/recovery node** nhờ route/authority độc lập; quyền writer không tự cấp chỉ vì Panel đã chuyển.
- Vào Panel từ Internet qua Cloudflare Access email được phép, không nhập tiếp mật khẩu Hosting; xác minh JWT tại origin và CSRF/cookie tiếp tục. Qua SSH localhost giữ mật khẩu làm recovery. Cloudflare policy phải giới hạn đúng email admin.
- Các yêu cầu trên là **thiết kế đã xác nhận**, không hiểu rằng M3/M4 route/election đã triển khai. Chi tiết và nghiệm thu ở `PANEL-ACCESS-SSO-PRIMARY-ROUTING-2026-10-26.md`.


## 26/10 — lifecycle node mới và pairing
- Người dùng cài 3 ứng dụng Android (Termux/Boot/API), sau đó muốn **một lệnh bootstrap full hosting**, **một lệnh ghép từ mã Panel 10 phút**, rồi quản lý node tập trung; không vá rời rạc từng node.
- Bootstrap chỉ trên điện thoại chưa có dữ liệu; existing node dùng một updater có rollback, không re-run clean installer.
- Shared Authority DO lưu thành viên động và mã ghép dùng một lần (192-bit secret, 10 phút, chỉ lưu hash); không yêu cầu sửa `MHC_MEMBERS_JSON` thủ công cho node mới; giữ các thành viên tĩnh cũ.
- Termux:Boot + runsvdir + wake lock + SSH + Panel + Agent được quản lý trong cùng installer/doctor. Quyền tối ưu pin/STAMINA vẫn cần cấp trên giao diện Android.
- Ghép node chỉ cấp Standby, không cấp writer, replication, Primary hoặc chạy website. Điều khiển cập nhật/triển khai app từ Panel về sau chưa được implement và cần cơ chế job an toàn riêng.


## 26/10/2026 — Nhiều Cloudflare zone trong Mini Hosting, không cấu hình IP thủ công
- Đã chốt **bổ sung roadmap P2.5** (sau multi-Panel/Shared Authority P2, phối hợp trước P3 manual Primary): khi `Mini Hosting > Thêm website`, người dùng chọn domain Cloudflare sẵn có, nhập subdomain, chọn site type và đích, nhấn “Tạo & xuất bản”; MHC mới tự cấu hình DNS/Tunnel/Nginx/HTTPS. **Chưa triển khai mã API Cloudflare cho nút Thêm website**.
- Token chỉ cấp quyền theo zone/account cụ thể, giữ trong control plane tin cậy, KHÔNG phân phát DNS Edit token xuống mọi node. Không động đến tên miền đang tồn tại ngoài danh sách/luồng MHC. Subdomain trùng thì báo xung đột, không ghi đè.
- Không cấu hình IP cố định; website đi qua named Tunnel. Wildcard subdomain chỉ bật riêng từng domain theo opt-in, mặc định API tạo hostname cụ thể. Đổi Primary phải tái sử dụng Cloudflare routing adapter và kiểm tra trạng thái dịch vụ + cấp quyền writer độc lập.
- **Phân vai Primary/Panel**: mọi node có Panel 9090 độc lập; `panel.giaouoc.com` bình thường trỏ tới Primary đã xác minh, nhưng có tuyến recovery vào Standby khi Primary offline. Shared authority nằm ngoài Primary. Việc chuyển Panel không phải là tự cấp Primary.
## Ghi nhận kiểm kê 27/10/2026

13. Không dùng marker installer hoặc heartbeat làm chứng nhận bản source đang cài, Tunnel/Access đang hoạt động hay node được cấp Primary; so Git blob từng file và kiểm runtime riêng.
14. Người dùng xác nhận F3216 là LAB ở nhà; chưa có SSH trực tiếp từ công ty. Chỉ quan sát telemetry, không dùng thay hai LAB tại công ty để nghiệm thu.
15. Nhiệm vụ tiếp nhận lần này chỉ kiểm kê và tài liệu; giữ các code clock-health ở workspace cha, không gộp vào branch hay triển khai P3/P4 trong lượt này.
16. Đồng bộ bản mới phải kiểm cả managed source và live Panel, bao gồm JWT/bridge/index/helpers; updater 13 file không đủ nâng cấp hoàn chỉnh. Không apply Panel từ managed JWT cũ; canary XZ3 và rollback cả source lẫn process trước Vsmart. Chỉ đề xuất kế hoạch trong kiểm kê 27/10, chưa thực thi.
17. Nhiệm vụ tiếp theo 27/10 đã cho phép build/test package source-only và rollout XZ3 trước, Vsmart sau khi canary đạt. Package offline, một commit/manifest cho cả hai, không cài mới Termux, không đổi Cloudflare/Primary/production; không tự reboot. Checkpoint 9d14f34 là audit lịch sử, LIVE-PROGRESS giữ kết quả rollout mới.

28/10/2026 — N1.2: bỏ mã ghép khỏi lệnh copy/argv; dùng ~/mhc-full join và lời nhắc ẩn (automation --stdin). Tiến độ cài/ghép/quản trị/Tunnel là số đo, không grant Control/Primary. Source upgrade cho N1 thêm UUID cụ thể và live membership, không mở allowlist toàn bộ thiết bị. Ngoại lệ lease đang ở node khác chỉ dành N1 management-only chưa có cấu hình/dataset managed site; không nới guard nâng writer đang chạy.

28/10/2026 — Control management-only tách khỏi dataset: operator-pin public proof key và Tunnel riêng trong MHC_CONTROL_NODES_JSON; node thuộc registry này không vào site/writer set. Fingerprint site lease cũ giữ nguyên; Control journal gắn hash registry target. Không dùng telemetry booleans làm proof. Peer keys/known_hosts phải có approval, không TOFU hoặc private-key copy.

28/10/2026 — User yêu cầu hoàn thiện tự cấp Tunnel/đăng ký Control không phụ thuộc PC: tái dùng Worker/DO và invite10phút, pin proof key tại join; một token account Tunnel Edit chuyên biệt trong Worker Secret, không copy OAuth hoặc API token xuống phone. Registry quản trị durable độc lập writer/site set; signed Control readiness Agent→Authority thay yêu cầu cấu hình SSH cho node quản trị mới. Không tự đổi DNS/Control đang phục vụ khi join, không tự cấp writer hoặc copy dữ liệu website. Existing approved11T có thể được reconcile đúng pin/Tunnel đã duyệt, không tạo Tunnel thứ hai; node legacy chưa có approval không tự nâng quyền.

### N1.3: portable LAB content và relay hẹp

Dùng chính Authority/DO hiện tại để giữ job và chunk backup có role/key pin, không cần LAN peer hoặc thêm R2. Chỉ hỗ trợ site WordPress LAB do MHC quản lý. Không chuyển wp-config/DB password/WP users/usermeta/options/salts/keys; đích tạo credentials riêng, chỉ phục hồi bảng nội dung đã allowlist. Không restore đè. Chuẩn bị site không đổi DNS/lease. Site candidate được thêm sau proof runtime và Tunnel riêng đúng LAB; tập participant đóng băng khi Manual begin, mọi participant phải FENCED trước cấp writer. Fingerprint P32 gốc giữ ổn định, không nới sandbox read-only cũ.

## 29/10/2026 — P4.0 lịch qua original Panel

User chọn cả chu kỳ và giờ cố định: chọn một kiểu interval phút/giờ hoặc HH:mm hằng ngày, Asia/Ho_Chi_Minh. Không yêu cầu PC bật; dùng Cron/DO/Agent hiện có. Lịch mặc địnhOFF60phút, chỉ enable sau manual applied verification. Không thêm scheduler nhiều tầng/cron tùy ý; không bật Auto Primary trong P4.0. Dữ liệu cũ của Standby có rollback checksum/journal, target chưa chứng minh rollback phải giữ khóa Manual Primary.
