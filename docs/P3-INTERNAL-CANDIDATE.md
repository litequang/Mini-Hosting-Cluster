# P3.1 — candidate nội bộ và dataset LAB riêng

Trạng thái thực thi duy nhất ở [LIVE-PROGRESS.md](LIVE-PROGRESS.md). Tài liệu này là contract/runbook; không chứng nhận Primary hoặc production writer.

## Dữ liệu và backup

Trước provision, kiểm effective PUBLIC grants. Trên MariaDB LAB, `REVOKE ALL` riêng user vẫn có thể thừa hưởng quyền ghi test/test-pattern từ PUBLIC. Dùng `scripts/p31-restrict-public-test.mjs --plan`, sau đó `--apply` chỉ khi helper xác minh hai scope mặc định không có bảng hoặc explicit app grants; backup grant private và automatic restore nếu verify lỗi. Không tự revoke PUBLIC scopes khác hoặc sửa grants/passwords của WordPress gốc. Builder từ chối sớm PUBLIC chưa được review; readiness vẫn giữ strict SELECT-only. Xem [MariaDB PUBLIC role](https://mariadb.com/docs/server/security/user-account-management/roles/system-users-roles-and-privileges).

Giữ WordPress Vsmart và static demo nguyên vẹn. Backup private tại `~/.local/state/mhc-p31-lab/backup.*`, pointer `latest-backup-path`; SQL thật và archive chứa credentials ở lại Vsmart. Backup có checksum, SQL đã thử restore vào DB riêng `mhc_p31_restore_check`, không restore đè hoặc xóa DB nguồn.

Archive trao đổi chỉ chứa core WordPress, theme mặc định, ảnh LAB, static index và WP-CLI. Không chứa SQL, wp-config, users/password hashes, options, node identity, authority hoặc Cloudflare config. Kiểm SHA-256 archive và manifest từng file trước khi dựng. Không đưa archive thiết bị vào Git.

`scripts/p31-prepare-lab.sh ARCHIVE SHA256` chỉ chạy trên hai LAB đã giao; từ chối target/DB/user tồn tại, production footprint và sai hash. Đây là thao tác dựng dataset mới, không phải installer hoặc restore toàn bộ dữ liệu site cũ. Không chạy lại mù khi gián đoạn; giữ private logs và xem tài nguyên đã tạo.

Mỗi node có dataset synthetic `mhc-p31-synthetic-v1`, DB `mhc_p31_lab`, user `mhc_p31_web` và password/salts sinh tại node. Root chỉ dùng khi provision dataset này; runtime web chỉ SELECT. Không chuyển mật khẩu từ node kia. Theme classic tối giản tránh các block-theme cần ghi trong lúc render. Media và static HTTP đối chiếu bytes với bản chuyển.

Runtime riêng tại `~/.local/share/mhc-p31-lab`, Nginx loopback 18131, PHP-FPM loopback 19131; không dùng 18080 của WordPress gốc. HTTP chỉ GET/HEAD; chặn wp-admin/login/cron/XML-RPC/REST, upload PHP, hidden files và wp-config. WordPress tắt cron tự kích hoạt, sửa/install plugin và outbound HTTP theo cấu hình. Website mới không tự start sau provision.

## Giới hạn quyền ghi

Tài khoản web SQL SELECT-only được kiểm bằng SHOW GRANTS, SELECT và UPDATE bị từ chối; HTTP POST/cron/admin/REST có probe 403. Những phép kiểm này có phạm vi dataset riêng, không chứng minh dừng mọi writer trên điện thoại.

MariaDB privileged/root, shell/Node/PHP tùy ý, file upload trực tiếp dưới cùng Android UID, cron/job ngoài dataset và writer Vsmart gốc chưa có fencing độc lập. Không dùng nginx down, heartbeat mất, read_only global hoặc metadata Primary thay thế bằng chứng đó. Authority hiện PREPARE_ONLY, writeLeaseGranted false: chỉ chuẩn bị/preview read-only; cấp Primary phải bị từ chối.

Tham chiếu cơ chế: [MariaDB read-only replicas](https://mariadb.com/docs/server/ha-and-performance/standard-replication/read-only-replicas) mô tả ngoại lệ privileged writers; [WordPress wp-config](https://developer.wordpress.org/apis/wp-config-php/) mô tả các cờ cron/file/outbound HTTP. Các cờ WordPress không là OS sandbox hoặc fencing.

## Protocol candidate và original Panel

`bin/p31-node.mjs` kiểm dataset manifest (gồm wp-config, DB-client và Nginx/PHP config), SELECT-only grants, SQL/HTTP/static/media, Agent/Panel/SSH rồi ký Ed25519 proof. Mỗi proof gắn node/cluster/version/commit/operation/revision/epoch, challenge nonce ngẫu nhiên 256-bit, thời hạn 15 giây. Verifier dùng public key đã ghim và authority đọc lại; sai signature/nonce/epoch/revision/operation, stale hoặc replay bị từ chối. Endpoint là SSH forced-command `mhc-p31`, không thêm public HTTP control endpoint.

Heartbeat quá 90s hoặc future quá 2s bị từ chối; cho phép clock skew tối đa 2s như proof verifier (đã đo fresh heartbeat age -533ms trên XZ3 thật). Đây là dung sai clock nhỏ, không coi heartbeat mất là fencing hoặc cho phép hai writer. Peer chỉ trả mã P31 nằm trong whitelist; stderr tùy ý không đưa ra Panel.

`bin/p31-control.mjs` chỉ kết nối peer trong private allowlist, SSH key riêng, known_hosts đã xác minh, không dùng host/user/key từ browser. Panel cũ vẫn xử lý Access/password/session/Origin/CSRF; GET `/api/mhc/p31-readiness` cần đăng nhập, POST `/api/mhc/primary-selection` thêm `p31-prepare`, `p31-standby`; `p31-promote` luôn từ chối. P3.1 cấu hình thì route/route-resume/complete cũ bị chặn tại bridge; không thể bỏ qua bằng checkboxes.

Thao tác từ Panel bất kỳ: chọn ứng viên bằng begin/CAS của authority hiện có → kiểm readiness → bật preview chỉ đọc → xác minh HTTP riêng tại node → dừng preview về Standby → abort pending. Begin/abort là mutation LAB được phép trong P3.1, không phải deploy Worker, đổi DNS hay cấp Primary. Thử ngược bằng một pending mới, không sử dụng epoch cũ.

Supervisor `mhc-lab-p31` chỉ quản lý hai child PHP/Nginx của dataset, không đụng Panel/Agent/SSH/Tunnel hoặc WordPress 18080 gốc. Journal intent/receipt và lock private cho retry; idempotency conflict bị chặn, crash lock giữ để kiểm, không xóa mù. Watch kiểm authority/pending và Agent mỗi vòng; lỗi/outage/sai epoch thì dừng child process groups và quarantine. Restart luôn bắt đầu Standby, cần yêu cầu chuẩn bị mới; không phục hồi activation cũ từ disk. PID/start-time journal cho phép reap orphan sau SIGKILL mà không giết PID đã tái sử dụng. Đây là supervision hợp tác, không sandbox/fencing cho cùng UID hoặc root; cửa sổ crash trước ghi journal vẫn không phải guarantee độc lập.

## Cấu hình peer và cứu hộ

Sau source upgrade package đã kiểm, chạy `node ~/.local/share/mhc-full-installer/bin/p31-configure.mjs prepare` trên mỗi node. Công cụ sinh riêng proof key và SSH key 0600 tại `~/.config/mhc-full-installer/p31`; output chỉ public keys/node/cluster. Không copy private key. Gom public peer fields `{nodeId,clusterId,publicKey,sshPublicKey,user,host,port}` cùng known_hosts lấy từ host keys Windows đã ghim; không tự tin ssh-keyscan. JSON `{peers,knownHosts}` qua stdin tới `p31-configure.mjs configure` trên từng node.

Configure giữ identity/password/enrollment hiện có, backup authorized_keys private, chỉ thêm dedicated key với `restrict,command=...p31-node.mjs accept`; không cho shell/PTY/port forwarding bằng key đó. Khóa SSH cứu hộ Windows giữ nguyên. Re-run cùng config giữ keys; config khác bị từ chối. Service mới start ở Standby; không khởi động website.

Configure chờ runit tạo supervise/ok trước sv-enable, luôn đặt SVDIR khi chạy từ SSH. Sau cập nhật module P3.1 đang có, restart riêng mhc-lab-p31 để nạp source mới; source updater quản lý Panel/Agent và không tự restart supervisor preview riêng. Pending PREPARE bền vững không được xóa mù; restart vẫn quarantine và cần yêu cầu preview mới.

Nếu lỗi: dùng SSH Windows bình thường, dừng riêng `sv -w 10 down "$PREFIX/var/service/mhc-lab-p31"`; kiểm port 18131/19131 đã đóng và Panel/Agent/SSH còn khỏe. Không restore DB hoặc authorized_keys toàn bộ chỉ để rollback source, vì có thể ghi đè khóa mới người dùng thêm sau checkpoint. Giữ backup/dataset/config private; source rollback theo NODE-SOURCE-UPGRADE, đồng thời dừng service mới trước khi quay lại bản không có P3.1.

## P3.2 — checklist thao tác Cloudflare chưa thực hiện

| Hạng mục cần chuẩn bị | Ai thao tác / điều kiện |
|---|---|
| Named Tunnel riêng XZ3 | User đăng nhập tài khoản quản lý giaouoc.com, tạo connector riêng; token nhập trực tiếp private, không chat/Git. Chưa tạo trong P3.1. |
| Origin Panel XZ3 | Cùng hostname/issuer/AUD và policy email admin của Panel Vsmart; kiểm JWT thực sau login, giữ CSRF và localhost recovery password. |
| Ingress từng Tunnel | Cùng hostname Panel → loopback 9090 trên đúng node; website → runtime đã kiểm. Không gộp hai connector thành router Primary ngẫu nhiên. |
| Worker/DO hiện có | Kiểm read-only deployment/binding/membership/cron trước khi deploy mới, giữ cluster UUID/keys. Chưa được deploy trong P3.1. |
| Route allowlist | Ghi cụ thể zone/record/hostname/Tunnel UUID cho site và Panel; token DNS Edit chỉ zone LAB ở control plane, không phân phát xuống nodes. Chưa bật opt-in DNS/recovery. |
| Panel recovery | Chỉ đổi route Panel khi incumbent offline; không tự cấp writer. Cần thử Access từ mạng ngoài qua standby, timeout/retry/no-failback. |
| Journal/rollback | Adapter site trước Panel, intent bền vững, GET/PATCH/GET; chỉ rollback khi chưa có ghi mới hoặc có kế hoạch dữ liệu rõ. DNS đúng chưa đủ nghiệm thu HTTP. |

Source P3 route/recovery đã có nhưng P3.1 không sử dụng token DNS, không đọc credentials tài khoản hoặc nạp secrets. Chưa có bằng chứng account read-only mới; HTTP 302 public chỉ chứng minh cổng Access reachable.

Reboot thực chỉ khi có cứu hộ/người vận hành; không suy ra PASS từ việc chạy Boot script. Giữ Panel/Agent/SSH và Tunnel trên Standby. P3.2 sẽ kiểm account/Worker/DO hiện có, Tunnel riêng XZ3, Access issuer/AUD/policy và route allowlist; P3.1 không đổi DNS, Worker, Access, secrets hoặc route công khai.
