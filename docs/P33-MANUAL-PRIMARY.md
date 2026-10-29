# Manual Primary và Control — website WordPress LAB do MHC quản lý

Trạng thái/source đã cài/test thực chỉ ở [LIVE-PROGRESS.md](LIVE-PROGRESS.md). Mốc này đáp ứng chọn node thủ công trước; Auto Primary/Control làm sau. Không thay panel.giaouoc.com hoặc website production.

## Thao tác trên Panel

Mở https://panel-lab.giaouoc.com, vào Cluster. Chọn node trong mục **Chuyển Primary / Control — LAB**:

- **Chuyển Primary + Control:** sử dụng DB sẵn có trên node đích, có thông báo chấp nhận dữ liệu có thể khác/cũ hơn. Không tự đồng bộ, restore đè hoặc khẳng định RPO bằng thời gian heartbeat. Mọi node trong tập site participants đã phê duyệt phải liên lạc được để fence trước khi cấp lease; sau N1.3 tập này gồm Vsmart/XZ3/11T.
- **Chỉ chuyển Control:** đổi riêng Panel LAB tới node đủ điều kiện; website, epoch và quyền ghi không đổi. Có thể dùng cả trước lần cấp Primary đầu tiên.
- **Tiếp tục tác vụ:** đọc phase/journal hiện có; không tạo transition mới. Lease hết hạn không được renew trở lại: tạo epoch mới, fence lại toàn bộ site participants, rồi tiếp tục cùng target. DNS đã/đang đổi được reconcile bằng GET/PATCH/GET, không blind abort.
- **Hoàn tất kiểm tra Internet:** chỉ hiện khi journal chờ public proof. Từ Access Panel thật, server lấy signed public Panel/site proof qua hai hostname LAB. Khi chuyển từ phiên Access, coordinator thử tự kiểm; nếu propagation chưa xong, tải lại Panel rồi hoàn tất. Không dùng SSH/local checkbox làm public proof.
- **Dừng và hủy trước đổi DNS:** quiesce toàn bộ managed writers đã phê duyệt rồi hủy; website LAB sẽ tạm ngừng. Không cho hủy mù sau DNS_REQUESTED. Nếu target lỗi sau DNS, sửa target/resume cùng journal; không tự quay về DB cũ khi chưa chọn rõ dữ liệu.

Website thử: https://preview-lab.giaouoc.com. WordPress có form bình luận để kiểm HTTP → PHP → SQL ghi thật; DB/content/credentials mỗi node riêng. Chuyển sang node khác có thể thấy bộ bình luận khác, đúng lựa chọn sử dụng dữ liệu node đích. /wp-admin/ dùng user p33lab và mật khẩu mới riêng ở ~/.local/share/mhc-p33-lab/admin-password trên từng node; không gửi file/mật khẩu vào chat/Git/log. Mật khẩu Panel cũ không đổi. WordPress cron, updates và file modifications tắt trong phạm vi LAB; uploads/HTTP CRUD vẫn đi qua gate.

## Pipeline và ranh giới bảo đảm

Authority opt-in MHC_P33_ENABLED=MANUAL_MANAGED_SITE trong **Worker/DO hiện hữu**. Giữ cluster/membership/keys/secrets/namespace. P3.2/legacy mutation và executor Cron cũ bị khóa khi opt-in; khả năng Control recovery P3.2 được giữ qua cùng journal P33 (ngưỡng5phút, chỉ Panel, không lease/site/epoch, chờ public proof, không failback). Không có Auto Primary. Không cho cả hai executor đổi cùng record.

FENCING → ACTIVATING → ACTIVE → DNS_REQUESTED → AWAITING_PUBLIC → COMMITTED. Authority dùng revision/epoch, request receipts và audit; grant90s, Agent đúng node/epoch/operation mới renew được khi lease còn hạn. Signed Ed25519 proofs gắn nonce/epoch/operation/revision/TTL15s; dùng public keys đã pin, không chuyển private key giữa phones.

Trước grant, mọi site participant xác minh: desired STANDBY, PHP/Nginx do P33 tạo đã dừng, cổng HTTP không phục vụ app, app SQL account chỉ SELECT, UPDATE thật bị từ chối và không còn kết nối SQL của account. Quiesce chỉ revoke/KILL user mhc_p33_web trên DB mhc_p33_lab, không dừng MariaDB chung hoặc website gốc. Kết nối cũ bị KILL để rollback transaction đang mở trước khi grant mới; heartbeat không thay fence proof.

Supervisor P33 quản lý riêng PHP19133/Nginx18133 và HTTP gate18131 loopback. Mỗi HTTP request kiểm authority/lease mới trước khi proxy; authority lỗi thì trả503 và supervisor quiesce. Agent/lease/app mất hiệu lực thì dừng managed children, revoke SQL, quarantine. Boot/restart không tự trở lại ACTIVE; thao tác mới hoặc resume hợp lệ mới kích hoạt. Child process groups có journal PID/start-time để không kill PID đã tái sử dụng.

**Scope duy nhất: MHC_MANAGED_WORDPRESS_LAB.** Không fence root/SQL đặc quyền, shell/files/jobs cùng Android UID hoặc website ngoài P33. Lease record tự nó không khóa mọi đường ghi trên điện thoại. Mất liên lạc node cũ thì manual transition không cấp lease mới khi chưa có fence proof; Auto offline cần giải pháp/nghiệm thu riêng. Không dùng nhãn Primary này làm phép chuyển production.

Đảo chiều sau khi có ghi là **một manual transition mới** với lựa chọn dữ liệu/RPO rõ ràng; không tự restore DB hoặc gọi DNS rollback như data rollback. Snapshot/restore thủ công có checksum và nghiệm thu riêng có thể thực hiện trước khi chọn; MVP không ép GTID/replication liên tục.

## Runtime, cài mới dataset và cứu hộ

- Source package thống nhất từ immutable Git commit: thêm bin/p33-node.mjs và p33-control.mjs, đồng bộ cả live Panel/managed source, giữ identity/admin/Access và website gốc. Không chạy clean installer. Source updater từ chối khi P33 writer ACTIVE; quiesce và kiểm toàn cluster không còn lease trước upgrade.
- scripts/p33-prepare-lab.sh --prepare-isolated-wordpress chỉ tạo mới ~/.local/share/mhc-p33-lab, DB mhc_p33_lab, user mhc_p33_web và restore probe mhc_p33_restore_probe. Refuse existing path/schema/user; không overwrite/delete khi retry. Dùng archive core/media/static P31 đã xác minh, không copy wp-config/users/password của site gốc; mật khẩu/salts sinh riêng, private backup SQL/checksum và restore probe trước service.
- Runit mhc-lab-p33 luôn bắt đầu Standby/quarantine, giữ Panel9090/Agent/SSH/Tunnel. P31 preview phải được Standby và pending cũ abort hợp lệ **trước** bật opt-in P33, tránh tranh18131. Giữ backup P31 và original sites.
- tools/p33-live-panel.mjs chạy trên đúng Termux LAB: status/readiness, switch NODE --accept-target-data, control NODE, resume, cancel, origin-check, auth-check. Local session dùng file password riêng đã có; không reset khi file vắng. Không confirm public bằng local session.
- wordpress-write NODE --write-synthetic-comment gửi một bình luận mới qua HTTP gate/WordPress và kiểm bằng SQL app account + trang HTML. Chỉ current Primary có lease; không cần đọc/in admin password. Đây là canary synthetic trên dataset riêng, không dùng DB thật.

Nếu lỗi sau DNS hoặc lease hết hạn, giữ journal và dùng Tiếp tục; không xóa lock/state, fake lease hoặc nới proof. Chỉ cancel trước DNS sau khi tất cả fence proofs hợp lệ. Lỗi live phải ghi rõ PASS/FAIL/NOT RUN và phần dữ liệu được giữ. Reboot/power/Doze không suy từ fixture hoặc dừng service; phải có đường cứu hộ/người tại máy.

### Node N1 như Xiaomi11T

Sau khi SITE_READY/ELIGIBLE_PRIMARY đã được xác minh, chọn **Xiaomi11T (model21081111RG)** trong Cluster trên Panel LAB, bấm Chuyển Primary + Control và chấp nhận dùng dữ liệu LAB đích. Manual dùng authenticated Authority relay và pinned enrollment keys cho cả3site nodes, không cần SSH peer LAN. CLI acceptance legacy tools/p33-live-panel.mjs vẫn chỉ allowlist hai LAB cũ; giới hạn tool đó không là giới hạn của Panel/API N1.

Khi AWAITING_PUBLIC, tải lại cùng Panel LAB rồi chỉ bấm Hoàn tất kiểm tra Internet. Primary có thể hiện Chưa hoàn tất dù lease11T đang chạy; chỉ journal VERIFIED/COMMITTED mới là chốt public. Website kiểm tại https://preview-lab.giaouoc.com, Panel tại https://panel-lab.giaouoc.com. Không bấm chuyển lại khi còn pending.
