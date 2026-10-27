# P3.1 — candidate nội bộ và dataset LAB riêng

Trạng thái thực thi duy nhất ở [LIVE-PROGRESS.md](LIVE-PROGRESS.md). Tài liệu này là contract/runbook; không chứng nhận Primary hoặc production writer.

## Dữ liệu và backup

Giữ WordPress Vsmart và static demo nguyên vẹn. Backup private tại `~/.local/state/mhc-p31-lab/backup.*`, pointer `latest-backup-path`; SQL thật và archive chứa credentials ở lại Vsmart. Backup có checksum, SQL đã thử restore vào DB riêng `mhc_p31_restore_check`, không restore đè hoặc xóa DB nguồn.

Archive trao đổi chỉ chứa core WordPress, theme mặc định, ảnh LAB, static index và WP-CLI. Không chứa SQL, wp-config, users/password hashes, options, node identity, authority hoặc Cloudflare config. Kiểm SHA-256 archive và manifest từng file trước khi dựng. Không đưa archive thiết bị vào Git.

`scripts/p31-prepare-lab.sh ARCHIVE SHA256` chỉ chạy trên hai LAB đã giao; từ chối target/DB/user tồn tại, production footprint và sai hash. Đây là thao tác dựng dataset mới, không phải installer hoặc restore toàn bộ dữ liệu site cũ. Không chạy lại mù khi gián đoạn; giữ private logs và xem tài nguyên đã tạo.

Mỗi node có dataset synthetic `mhc-p31-synthetic-v1`, DB `mhc_p31_lab`, user `mhc_p31_web` và password/salts sinh tại node. Root chỉ dùng khi provision dataset này; runtime web chỉ SELECT. Không chuyển mật khẩu từ node kia. Theme classic tối giản tránh các block-theme cần ghi trong lúc render. Media và static HTTP đối chiếu bytes với bản chuyển.

Runtime riêng tại `~/.local/share/mhc-p31-lab`, Nginx loopback 18131, PHP-FPM loopback 19131; không dùng 18080 của WordPress gốc. HTTP chỉ GET/HEAD; chặn wp-admin/login/cron/XML-RPC/REST, upload PHP, hidden files và wp-config. WordPress tắt cron tự kích hoạt, sửa/install plugin và outbound HTTP theo cấu hình. Website mới không tự start sau provision.

## Giới hạn quyền ghi

Tài khoản web SQL SELECT-only được kiểm bằng SHOW GRANTS, SELECT và UPDATE bị từ chối; HTTP POST/cron/admin/REST có probe 403. Những phép kiểm này có phạm vi dataset riêng, không chứng minh dừng mọi writer trên điện thoại.

MariaDB privileged/root, shell/Node/PHP tùy ý, file upload trực tiếp dưới cùng Android UID, cron/job ngoài dataset và writer Vsmart gốc chưa có fencing độc lập. Không dùng nginx down, heartbeat mất, read_only global hoặc metadata Primary thay thế bằng chứng đó. Authority hiện PREPARE_ONLY, writeLeaseGranted false: chỉ chuẩn bị/preview read-only; cấp Primary phải bị từ chối.

Tham chiếu cơ chế: [MariaDB read-only replicas](https://mariadb.com/docs/server/ha-and-performance/standard-replication/read-only-replicas) mô tả ngoại lệ privileged writers; [WordPress wp-config](https://developer.wordpress.org/apis/wp-config-php/) mô tả các cờ cron/file/outbound HTTP. Các cờ WordPress không là OS sandbox hoặc fencing.

## Lifecycle và Cloudflare

Reboot thực chỉ khi có cứu hộ/người vận hành; không suy ra PASS từ việc chạy Boot script. Giữ Panel/Agent/SSH và Tunnel trên Standby. P3.2 sẽ kiểm account/Worker/DO hiện có, Tunnel riêng XZ3, Access issuer/AUD/policy và route allowlist; P3.1 không đổi DNS, Worker, Access, secrets hoặc route công khai.
