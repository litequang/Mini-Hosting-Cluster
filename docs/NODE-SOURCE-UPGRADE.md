# Unified source-only LAB upgrade

Một package từ một Git commit được dùng cho cả XZ3 canary và Vsmart. Entry duy nhất là `update.sh` trong package; không chạy fresh install hoặc chồng các installer patch cũ. Hai LAB legacy được allowlist; node N1 dùng UUID rõ ràng + completed installer journal + authenticated membership, không mở quyền cho node tùy ý; production/HA footprint, marker lạ, source/config symlink hoặc boot script lạ bị từ chối.

## Build và kiểm tra

Từ checkout có source đã commit:

```sh
node scripts/build-node-upgrade.mjs OUTPUT_DIRECTORY MHC-LAB-20261027.1 COMMIT_SHA
```

Builder lấy Git blobs ở đúng commit, tạo manifest SHA-256 cho toàn bộ managed bin, launcher, 7 file overlay live Panel và canonical Boot entry. Live/managed Panel dùng cùng bytes; JWT, bridge, index, CSS, helpers không bị bỏ qua. `upgrader.mjs` có hash riêng trong manifest. Package không chứa node config, admin data, credentials, site hoặc DB.

Chuyển package qua SSH đã ghim host key, giữ tại thư mục private 0700 ngoài website. Ghi SHA manifest do builder xuất ở kênh tin cậy. Sau đó trên node:

```sh
bash PACKAGE/update.sh --plan --manifest-sha256 EXPECTED_SHA
bash PACKAGE/update.sh --apply --manifest-sha256 EXPECTED_SHA
bash PACKAGE/update.sh --verify --manifest-sha256 EXPECTED_SHA
```

`plan` chỉ stage/kiểm hash, cú pháp và preflight, không dừng process hay thay runtime. Gói offline không download trong apply: lỗi nhận gói/thiếu file/hash/syntax đều xảy ra trước snapshot và trước khi dừng dịch vụ. Fault injection dùng acquisition reader lỗi để kiểm đường lỗi download; không cần giả một rollback sau khi runtime chưa đổi.

## Transaction và rollback

Apply dùng private lock, snapshot từng đích và mode/absence, marker phiên bản trước, cấu hình runit quản trị và Boot. Sau đó dừng **Agent rồi Panel**, atomic replace files, retire đúng legacy Boot đã biết hash, bật **Panel rồi Agent**. Không dừng SSH/Tunnel/Nginx/PHP/MariaDB. Không gọi Doctor repair ngầm. Health gate kiểm PID mới, asset SHA đang phục vụ, shared cluster/revision/epoch giữ nguyên và heartbeat/telemetry mới. Thiếu health tự rollback và báo lỗi.

Backup/journal tại `~/.local/state/mhc-source-upgrade/tx-*`, quyền private; `current.json` giữ version, commit, manifest SHA và transaction. Không copy private backup sang Git/chat. Rollback khôi phục cả file/mode/absence, Boot và process Panel/Agent rồi kiểm health lại:

```sh
bash PACKAGE/update.sh --rollback TRANSACTION_ID
```

Rollback phục hồi đúng baseline của transaction; baseline trước đồng bộ có thể đã lệch source. Chỉ gọi bản mới thống nhất sau verify package đạt. Giữ backup cũ; không restore DB để rollback code. Lock/pending journal không được xóa mù; lỗi rollback báo `ROLLBACK_FAILED_RESCUE_REQUIRED` và giữ bằng chứng cho cứu hộ. Apply lặp cùng nội dung/version là no-op, không restart process.

Marker `installed` TEST 0.5.0C được giữ để tương thích guard cũ; phiên bản source thật sau rollout nằm trong current.json và kết quả --verify, không suy ra từ marker legacy.

## Boot/SSH và nghiệm thu

Canonical `~/.termux/boot/10-mhc-start` gọi managed node-boot một lần; chỉ retire `10-start-hosting` có hash đã kiểm. Backup giữ nguyên script cũ. Boot không gọi standalone sshd để tránh tranh cổng runit. Doctor báo NEEDS_ACTION khi SSH/Panel, Agent đã enroll hoặc Tunnel đã cấu hình bị hỏng. XZ3 chưa cấu hình remote Access/Tunnel không tự được cài connector.

Xử lý daemon SSH cũ riêng bằng kênh cứu hộ key-auth đã kiểm và phiên SSH dự phòng; không kill listener duy nhất. Không tự reboot. Hậu kiểm sau update khác nghiệm thu Android cold boot/Doze và browser Access thật. Không thay Worker, DNS, secrets, policies, Primary hoặc failover trong milestone này.

Test bắt buộc: `tests/source-upgrade.mjs` fault/security/process scenarios, `tests/access-sso-panel.mjs` (Windows dùng file URL và POSIX-mode fixture riêng, vẫn kiểm insecure config bị chặn), `manual-candidate-ui`, các test M2/P3 và full `bin/self-test.sh` trong HOME cách ly. Trên Termux dùng TMPDIR chuẩn đủ ngắn cho Unix sockets và nằm ngoài source/Git.

N1 management-only: dùng cùng package builder/update.sh, truyền --node-id UUID cụ thể cho plan/apply/verify/rollback. Upgrader xác thực member bằng credentials hiện có, completed N1 journal và fresh telemetry; không thay identity/password/Tunnel token. Khi node có managed site/config, lease của cluster vẫn chặn source upgrade; cần kế hoạch maintenance/quiesce. Thay đổi chỉ source không đồng nghĩa physical reboot hoặc public Control đã nghiệm thu.

## N1.3 — gói source04 và rollback

Gói công khai [MHC-LAB-20261029-N13-04.tar](../releases/MHC-LAB-20261029-N13-04.tar) chỉ chứa source từ d383b1619d4666ae38acb0981818ba2443b59ac8,93files; không chứa private config/site/SQL. Tar SHA256 **3b8ca941dd697aa75db0bcff37a6c78a85001c4f9a0b4ea7e4da4e2112ce92e7**, manifest **97975173c9aab4c5b4c2a95d18889d27d694c01d1e4b93f71da7fdf4287cae2b**. Worker/DO có vòng deploy độc lập, SHA thực ở LIVE-PROGRESS; không thay bằng một authority mới.

Khi node có managed site, vẫn chặn lease/writer/transition đang hoạt động. Recorded Primary chỉ được nâng khi có proof FENCED mới15s đúng pin/node/cluster/epoch/revision/operation, SQL denied/zero connections/HTTP và children stopped; không đổi role/route để vượt guard. Backup/restore site đang chạy cũng chặn updater, Agent hoãn job khi update lock. Nếu guard P33 đang Standby, apply/rollback reload và kiểm PID guard mới cùng Panel/Agent; không bật writer.

Rollback source dùng package giữ trên chính node, thêm UUID cho N1. Ví dụ11T sau lần apply04:

```sh
bash "$HOME/.local/state/mhc-source-upgrade/incoming/release.TWjAK5/update.sh" --rollback tx-20261029025420705-09d06a --node-id c2a69fe8-6b97-4f42-a938-95d843c2b5d2
```

Chỉ dùng khi maintenance/preflight cho phép và transaction vẫn khớp current.json; không rollback mù node có writer. Backup file/process private giữ trên node. **Rollback code không xóa/restore DB/site đã chuẩn bị**, không rollback DNS/lease. Release01/02/03 giữ nguyên; fresh installer không phải công cụ nâng node hiện có.
