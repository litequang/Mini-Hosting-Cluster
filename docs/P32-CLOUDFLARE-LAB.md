# P3.2 — tuyến Panel và preview LAB chỉ đọc

Trạng thái/nghiệm thu chỉ ở [LIVE-PROGRESS.md](LIVE-PROGRESS.md). Đây là contract và runbook, không chứng nhận Primary/writer. Hai hostname user đã chọn: panel-lab.giaouoc.com và preview-lab.giaouoc.com. panel.giaouoc.com và mọi hostname production ngoài phạm vi.

## Tài khoản và tài nguyên phải giữ

- Account hiện có: 35b2468610cfa060d5d02865b7996a74. Worker mhc-cluster-authority-lab; binding MHC_AUTHORITY → ClusterAuthority, namespace c941ad9ddcaa4dfdbe474d429a37d8f8; cluster UUID 2c1ea7c0-1d1f-4802-8336-0925a529c431. Không tạo cluster/Worker/DO mới hoặc sửa membership secrets.
- Vsmart: node4ed4c025-62ae-4c2a-8d68-65dd76ecf550, Tunnel mhc-vsmart-lab / 3d23199a-decb-4de9-87b4-81afd508db18. Giữ toàn bộ ingress hiện có, đặc biệt panel.giaouoc.com. Không dùng Tunnel thophuong.
- XZ3: node4a9672d1-bb62-4286-946a-a78b73e57b24. Tunnel riêng mhc-xz3-lab; UUID phải lấy từ tài khoản thật, không lấy UUID Vsmart hoặc chạy connector bằng token của Vsmart.

## Access và Tunnel cần cấu hình

1. Trong account trên, tạo application self-hosted riêng MHC P32 LAB với **hai public hostname chính xác** panel-lab.giaouoc.com và preview-lab.giaouoc.com. Team domain hiện có broken-waterfall-3eb3.cloudflareaccess.com; giữ nguyên tổ chức. Chỉ Allow email quản trị như app Panel hiện có, không Everyone/Bypass. Dùng session ≤24h (khuyến nghị1h), lấy AUD của app LAB mới. Không đổi app/policy production. Một application có thể bảo vệ nhiều domain với cùng AUD; xem [Cloudflare authorization cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/).
2. Theo lựa chọn CLI/API mới của user, Codex có thể tạo Tunnel bằng OAuth hiện có, lấy token trong bộ nhớ rồi truyền qua SSH stdin đến file0600 chỉ trên XZ3; không in/lưu token trên Windows, không dùng token Vsmart. Cách nhập tay dưới đây chỉ dùng khi không có API grant phù hợp. Tạo named Tunnel mhc-xz3-lab trong cùng account. Không chạy installation command có token qua tool/chat. User nhập **chỉ token Tunnel XZ3** trực tiếp trong SSH tương tác:

~~~powershell
ssh -t -i "$env:USERPROFILE\.ssh\id_ed25519_mhc_lab" -p 8022 -o StrictHostKeyChecking=yes u0_235@192.168.1.41 'bash ~/.local/share/mhc-full-installer/bin/prepare-panel-tunnel-token.sh'
~~~

File0600 chỉ trên XZ3; helper không thay file đã có. Codex kiểm presence/mode rồi cài riêng mhc-panel-tunnel sau origin Access config. Không copy token qua node khác/Git/log.

3. Ingress **cả hai Tunnel riêng** cần các rule LAB, thêm trước catch-all, giữ rule cũ:

| Hostname | Service | Origin Host | Access tại cloudflared |
|---|---|---|---|
| panel-lab.giaouoc.com | http://127.0.0.1:9090 | Giữ hostname public, không rewrite localhost | required:true, teamName broken-waterfall-3eb3, audTag [AUD LAB] |
| preview-lab.giaouoc.com | http://127.0.0.1:18131 | 127.0.0.1:18131 | Cùng required/teamName/AUD LAB |

Panel vẫn tự verify JWT tại origin, giữ session/CSRF/Origin/password localhost. Preview không có validator PHP riêng nên cloudflared Access required là bắt buộc; loopback18131 không mở LAN. Host override riêng preview giữ WordPress fixture đang có, tránh redirect về URL local; không sửa dataset/manifest hoặc mở quyền ghi. Xem [Cloudflare origin parameters](https://developers.cloudflare.com/tunnel/reference/origin-parameters/).

**Không dùng thao tác thêm public route trên Tunnel thứ hai nếu nó tự ghi đè DNS đã có.** Cấu hình ingress và DNS là hai việc riêng: sửa JSON configuration của đúng Tunnel bằng API có kiểm/backup/merge, sau đó chỉ tạo hai CNAME LAB trỏ Vsmart lúc đầu. Nếu UI từ chối hostname trùng hoặc đòi thay record, dừng dùng bước đó. Không tạo hai connector trên cùng Tunnel để chia request quản trị ngẫu nhiên.

4. CNAME proxied ban đầu cho hai hostname LAB đều trỏ 3d23199a-decb-4de9-87b4-81afd508db18.cfargotunnel.com. Ghi zone ID/record IDs thực, kiểm collision trước khi tạo, không đè hostname ngoài LAB. Bypass cache **chỉ hai hostname LAB** để proof/hash không dùng response cũ.
5. Cấu hình origin sau khi có AUD LAB. XZ3 chưa có config dùng remote-panel configure; Vsmart đã có production hostname dùng add-lab, không disable/reconfigure base:

~~~sh
node ~/.local/share/mhc-full-installer/bin/remote-panel.mjs configure panel-lab.giaouoc.com broken-waterfall-3eb3.cloudflareaccess.com AUD_LAB --confirm=ENABLE_CLOUDFLARE_ACCESS_JWT
# Chỉ Vsmart, thay lệnh configure bằng:
node ~/.local/share/mhc-full-installer/bin/remote-panel.mjs add-lab panel-lab.giaouoc.com broken-waterfall-3eb3.cloudflareaccess.com AUD_LAB --confirm=ADD_LAB_ACCESS_APPLICATION
~~~

AUD là tag public, không phải JWT/Access service token. Codex thực hiện lệnh với AUD thật và restart riêng amh-panel có backup/hậu kiểm; password không đổi. Sau đó trên XZ3 cài connector bằng panel-tunnel-service.sh install --confirm=INSTALL_LAB_PANEL_TUNNEL. Giữ SSH/runit cứu hộ.

## Quyền API và công cụ chuẩn bị

Quyền Wrangler OAuth đang có có thể dùng để đọc/deploy Worker hiện hữu; không suy ra đủ quyền Access/DNS từ việc whoami thành công. Kiểm các API read-only trước. Nếu cần token mới, user tạo trong account và nhập trực tiếp file/TTY private trên máy công ty, không gửi chat. DNS Edit token chỉ giữ control plane/Worker Secret, không đưa xuống Android. Account Tunnel Edit/Access Apps and Policies Edit chỉ khi cần cấu hình các tài nguyên LAB; script phải xác minh đúng account/IDs, backup và giữ dữ liệu ngoài scope.

Nếu OAuth bị403 Access/DNS: tạo riêng2 API tokens tại https://dash.cloudflare.com/profile/api-tokens. CONTROL chỉ Account → Access: Apps and Policies → Edit, scope account35b2468610cfa060d5d02865b7996a74 (Tunnel Edit chỉ thêm nếu API Tunnel cũng thiếu). DNS-ONLY: Zone → DNS → Edit và Zone → Zone → Read, Include → Specific zone → giaouoc.com, không Account permissions. Giữ CONTROL trên Windows; chỉ DNS-ONLY được nạp Worker Secret. Không đưa token quản trị Access vào Worker hoặc Android.

Nhập hai token bằng PowerShell trên máy công ty: `& 'E:\CODE\MHC\MHC\.work\repository\tools\prepare-cloudflare-p32-secrets.ps1'`. Helper có sẵn trong repo, hỏi hidden input, lưu Windows DPAPI theo user tại %LOCALAPPDATA%\MHC-P32\control-token.xml và dns-token.xml, ACL user/SYSTEM, không overwrite. Không gửi token/JWT/XML contents vào chat; chỉ báo đã lưu. Codex dùng credentials trong bộ nhớ cho API đúng scope và chỉ xuất kết quả đã lọc.

Tạo CONTROL bằng **Create Custom Token → Get started**, tên MHC-P32-CONTROL, Permissions Account → Access: Apps and Policies → Edit; Account Resources Include → Specific account hiện có. DNS-ONLY dùng template Edit zone DNS, thêm quyền Zone → Zone → Read bằng Add more bên cạnh Zone → DNS → Edit; Zone Resources Include → Specific zone → giaouoc.com. Continue to summary → Create Token. Không chọn Create Additional Tokens hoặc quyền Account cho DNS-ONLY.

Helper hỗ trợ -Kind Control hoặc -Kind Dns để lưu riêng; mặc định hỏi CONTROL rồi DNS. Chỉ copy dòng lệnh, không copy prompt PS C:\Users\...> hoặc các dòng lỗi bắt đầu bằng +. Lỗi SeSecurityPrivilege ở Set-Acl đã được xử lý bằng .NET persist DACL-only rồi verify user/SYSTEM, không thay owner/SACL, không cần PowerShell Administrator; -CheckOnly chỉ kiểm quyền thư mục và không hỏi/đọc credential. Nếu có lỗi mới, giữ nguyên thông báo lỗi và không chạy từng dòng trong stack trace.

scripts/p32-cloudflare.mjs có audit GET-only (Worker settings/deployments/schedules, Tunnel/config, Access/policy selector types, giaouoc DNS), không xuất binding values/token/email selectors/IP. POSIX tokenFile cần0600, parent0700, ngoài Git; API thiếu quyền được báo riêng. Không phải trình mutate tài khoản. plan nhận JSON không chứa secrets: zoneId, records[{id,hostname,kind}], tunnels{nodeId:UUID}, proofKeys{nodeId:publicPEM}, teamDomain, audience; xuất vars và ingress LAB để review, không ghi Cloudflare.

## Worker và journal

Deploy đúng source đã commit vào **Worker hiện hữu**, giữ v1 migration, binding, membership và secrets. Build/dry-run trước; deploy --keep-vars và MHC_SOURCE_COMMIT:<SHA> để không làm mất vars Dashboard. Kiểm sourceCommit/workerBuild, revision/epoch/membership sau deploy. Chưa bật recovery khi chưa nghiệm thu.

- MHC_P32_LAB_ENABLED=READ_ONLY_ROUTING
- MHC_P32_INITIAL_NODE_ID=Vsmart UUID
- MHC_P32_ROUTES_JSON: đúng2 CNAME LAB/kind site hoặc panel, zone/record IDs thật, nodeTargets đúng2 UUID node → **hai Tunnel UUID khác nhau**, không wildcard.
- MHC_P32_PROOF_KEYS_JSON: đúng hai public Ed25519 keys đã ghim từ P3.1; không chuyển private key.
- MHC_P32_CF_TOKEN: secret DNS Edit zone LAB tại Worker, không biến public hoặc token trên phones.
- MHC_P32_PANEL_RECOVERY_ENABLED giữ tắt; chỉ bật LAB_PANEL_ONLY sau thử manual/access/failure.

Không bật MHC_P3_LAB_ENABLED legacy để chạy P3.2. Adapter DNS cũ được tái dùng bên trong luồng chỉ đọc; guard route/complete/promote P3.1 giữ nguyên. DO key p32 có revision riêng và audit/request receipts; không thay epoch/revision của pending P3.1 khi ghi DNS, không ghi declaredPrimary hoặc cấp lease. Mọi mutation phải qua vai panel, phiên Panel và CSRF/Origin; agent không điều khiển route.

Luồng: signed readiness của target → CAS journal DNS_REQUESTED → GET tất cả/validate exact records → PATCH site trước Panel → GET lại → DNS_AWAITING_HTTP. Nonce/timestamp/epoch/revision/operation và pinned signature được kiểm; reuse proof bị từ chối. Worker dùng [Web Crypto Ed25519](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) với public SPKI, không nhận key từ browser.

Mở **Panel LAB** sau đổi tuyến rồi bấm Xác minh Internet: origin Panel đang nhận JWT tự ký challenge của journal, fetch HTTPS preview LAB với Access cookie trong bộ nhớ, kiểm node/header/hash bằng kết quả local đã ký, gửi proof tới Worker. JWT/cookie không ra browser response/log/Git. Chỉ sau verify mới VERIFIED; DNS-only không tự thành HTTP PASS. Cookie/session gắn cả JWT và hostname, local password session không dùng qua Internet, AUD LAB không dùng cho hostname production.

## Thử nghiệm và rollback

1. SSH tunnel theo CONTINUE-MHC, original9090; dùng mật khẩu hiện có. Chọn Vsmart PREPARE, bật preview P3.1; P3.2 chọn Vsmart để kiểm initial DNS bằng GET, mở Panel LAB xác minh Internet.
2. Dừng preview, abort pending. Chọn XZ3 PREPARE, bật preview. Chuyển Panel+preview LAB sang XZ3; xác minh từ Panel LAB. Để truy cập node mới phải tạo session mới trên node đó; session không được đồng bộ giữa phones. Có thể gián đoạn read-only trong lúc đổi ứng viên; không hứa zero downtime.
3. Thử chiều ngược tương tự. Sau mỗi lần xem signed node ID, DNS/Tunnel, HTTP/PHP/media/static/SQL; không chỉ nhìn status200 hoặc CNAME.
4. Nếu lỗi DNS: giữ journal, không blind abort; đợi ≥60s, kiểm record rồi p32-resume với proof mới. Storage failure trước intent không được gọi API. Unknown target/config thay giữa route phải dừng review.
5. p32-rollback chỉ đổi tuyến dataset read-only, cần proof scoped từ node trước; nếu previous site/Panel vốn tách node thì từ chối rollback gộp. Rollback có thể về website chưa bật: trạng thái ROLLBACK_DNS_AWAITING_HTTP, cho phép chuẩn bị lại preview trước rồi xác minh thành ROLLBACK_VERIFIED. Không rollback DB hoặc suy ra quyền Primary từ source/DNS rollback.
6. Recovery riêng Panel: opt-in Cron1phút, incumbent đã được quan sát và mất heartbeat >5phút (không kết luận writer tắt), candidate có heartbeat/metrics ≤90s và Panel/Tunnel running. Đổi **chỉ Panel LAB**, giữ site/pending/epoch/Primary/lease. DNS xong vẫn chờ proof Access, node cũ online không failback khi incumbent mới còn khỏe. Không bật auto P4.
7. Fault live chỉ khi giữ SSH/operator, không reboot hoặc cắt Wi-Fi production. Mất Authority thì không tự cấp Primary hoặc dùng local fallback. Chụp hậu kiểm/backup, tắt preview và abort chỉ khi không có journal DNS chưa giải quyết.

## P3.3 còn thiếu

P3.2 chỉ route dataset read-only. Writer lease theo epoch, gate mọi write surface do MHC quản lý, điều kiện restore/app/database và conditional rollback dữ liệu vẫn cần thiết kế/nghiệm thu riêng. Root/SQL đặc quyền, shell/process/job cùng Android UID nằm ngoài enforcement hợp tác; không hứa fence độc lập hoặc safe Primary khi chưa giải quyết. Giữ fail-closed, không fake writeLeaseGranted, không cấp writer production.

Luồng P3.3 dự kiến: intent có revision/epoch → snapshot/restore đã kiểm + cảnh báo RPO → chứng minh fence node cũ trong phạm vi đã công bố → lease có hạn dành riêng node/epoch/site → bật writer đích → HTTP/DB application probe → ghi commit → rejoin quarantine. Lease hết hạn/Authority lỗi không được cấp mới và các gate do MHC quản lý phải dừng ghi; cached credentials/kết nối DB còn sống cũng phải bị xử lý. Lease record trong DO tự nó không khóa privileged SQL hoặc điện thoại bị partition.

| Write surface | Điều kiện trước khi gọi Primary writable |
|---|---|
| HTTP Node/PHP/WordPress/upload | Tất cả entrypoint MHC phải qua gate cùng epoch/lease; không chỉ một health route, nginx hoặc checkbox |
| SQL web/app credentials | Chứng minh không bypass gate bằng kết nối/credential cũ; SQL root/same UID không được coi là đã fence bởi REVOKE user web |
| Cron/CLI/background jobs | Boot ordering và job runner kiểm lease, dừng khi lease/authority không hợp lệ; danh sách service/writer ngoài MHC phải được công bố |
| Old node/rejoin | Không auto-start writer, quarantine trước khi nạp app/cron; chỉ restore thủ công có xác minh rồi mới xem xét lease mới |
| Rollback sau ghi | Ghi nhận mốc dữ liệu trước cấp lease; nếu đích đã nhận ghi mới thì dừng writer và xử lý backup/restore/RPO có duyệt trước khi đảo route, không tự quay DB cũ |

Nếu chỉ bảo vệ được entrypoint do MHC quản lý, nhãn phải nói rõ phạm vi đó; không hứa độc quyền toàn điện thoại. Muốn guarantee trước partition với privileged/out-of-band writer cần fencing độc lập hoặc backend dữ liệu có thể thu hồi quyền từ ngoài node. Chọn thiết kế đơn giản phù hợp trong P3.3, không triển khai thêm proxy/replication hoặc auto P4 trong P3.2.


## Tiếp tục acceptance qua CLI sau khi khởi động lại Windows

Đọc LIVE-PROGRESS trước mọi mutation; không suy ra trạng thái hiện hành từ example. Source và fixtures P32 đã commit, chạy các test phù hợp theo bin/self-test.sh. tools/p32-live-panel.mjs là client dùng trên đúng Vsmart/XZ3 Termux LAB, copy bằng SSH/SCP vào thư mục state private rồi chạy Node; không đưa password/token vào arguments. Client chỉ dùng password file local đã có (panel-login-once hoặc panel-test-password0600), không reset password, từ chối node/target ngoài allowlist và footprint production. Các action: origin-check (không đọc/yêu cầu password file), status, p32-route NODE_ID [both|panel], p32-resume, p32-rollback, confirm-denied-local. Client local không thể confirm Internet; bước đó bắt buộc từ phiên Access thật trên public Panel. Nếu thiếu password file thì local login test NOT RUN; Access SSO vẫn dùng được.

Khi journal DNS_AWAITING_HTTP, mở Panel LAB hiện trỏ node đích, Cluster → Xác minh Internet từ Panel LAB; chỉ sau Worker ghi VERIFIED mới kết thúc pending/chuẩn bị ứng viên khác. DNS_REQUESTED thì kiểm actual records và p32-resume sau cooldown; không blind abort. Tắt Windows không tự xóa journal/source/backup trên phones hoặc Cloudflare; giữ Android/Termux/network hoạt động nếu cần public preview. Worker adapter source có thể mới hơn payload node vì reference/cluster-authority không thuộc gói81 file điện thoại.


origin-check dùng raw HTTP tới loopback9090 với Host public thật để kiểm deny missing/invalid JWT, hostname ngoài allowlist và unauth APIs. Không dùng fetch Host override để kết luận guard vì Node26 có thể chuẩn hóa header; không đổi guard khi probe nhầm. Kết quả negative checks PASS không chứng minh valid Access login hoặc tuyến Internet đã VERIFIED. Sau gián đoạn, nếu preview quarantine mà pending/journal giữ nguyên, đọc signed readiness/event reason rồi re-PREPARE chính pending khi hợp lệ; không restart supervisor, tạo intent mới hoặc xóa journal để vượt DNS_AWAITING_HTTP.


## Controlled outage riêng management XZ3

Sau manual roundtrip/rollback VERIFIED: giữ website preview trên Vsmart, chuyển chỉ Panel LAB sang XZ3 và xác minh Access origin. Bật MHC_P32_PANEL_RECOVERY_ENABLED=LAB_PANEL_ONLY tại đúng Worker hiện hữu; đọc lại shared status phải recoveryEnabled=true, không chỉ settings/deployment API. Giữ source/namespace/secrets/journal; không bật P4 hoặc writer.

Copy tools/p32-recovery-drill.mjs tới private state LAB trên XZ3. status chỉ đọc; start cần --confirm=STOP_XZ3_LAB_MANAGEMENT_FOR_RECOVERY_TEST, kiểm lại authority và đúng node rồi mới dừng duy nhất mhc-authority-agent + mhc-panel-tunnel. Không dừng amh-panel/sshd, không reboot/cắt Wi-Fi, không đụng Tunnel Vsmart đang chở production Panel. Intent và timer management12phút được đặt trước khi dừng; restore DRILL_UUID khởi lại cả hai services, kiểm running và ghi journal. Nếu một lệnh up lỗi vẫn thử service còn lại. Timer chỉ best-effort cùng Termux, không đảm bảo khi Android kill app/mất điện; SSH và người cứu hộ vẫn cần giữ.

Quan sát heartbeat age>5phút, Cron1phút, chỉ record Panel chuyển về Vsmart, site CNAME/epoch/revision/pending/Primary/lease không đổi; DNS xong vẫn chờ public Panel proof. Sau khi DNS recovery, restore management XZ3, đọc lại telemetry và theo dõi nhiều vòng Cron không failback. Ghi rõ đây là outage Agent+Tunnel, không phải full Android power/network/reboot acceptance. Lần chạy thực và phần NOT RUN chỉ ở LIVE-PROGRESS.
