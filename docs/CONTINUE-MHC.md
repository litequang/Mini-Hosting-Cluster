# Tiếp tục MHC sau gián đoạn

**Nguồn trạng thái thực thi duy nhất: [LIVE-PROGRESS.md](LIVE-PROGRESS.md).** File này chỉ giữ cách tìm source, kết nối và phục hồi.

## Source và Git

- Remote: `https://github.com/litequang/Mini-Hosting-Cluster.git`.
- Branch: `codex/m1-m2-foundation`; commit/push sau checkpoint có ý nghĩa.
- Checkout Git: `E:\CODE\MHC\MHC\.work\repository`. Cây ngoài là workspace bàn giao; đối chiếu thay đổi trước khi copy vào checkout, không reset/giải nén đè.
- Khi mất máy, clone repo và checkout branch trên. Đọc AGENTS và tài liệu theo thứ tự, sau đó LIVE-PROGRESS; kiểm Git status/log.
- Nâng cấp node đã có dữ liệu bằng builder Git-commit/package trong [NODE-SOURCE-UPGRADE.md](NODE-SOURCE-UPGRADE.md); `git archive` chỉ dùng gói source/test. Không gói `.work`, secrets, database hoặc backup thiết bị.
- Bốn phần clock-health trong cây cha chưa nhập Git: bin/clock-health.mjs, tests/clock-health.mjs và sửa riêng bin/remote-panel.mjs, bin/self-test.sh. Không copy đè hoặc bỏ các phần này khi phục hồi.

## Truy cập Vsmart

SSH: `u0_a180@192.168.1.4:8022`, key `%USERPROFILE%\.ssh\id_ed25519_mhc_lab`. Host key đã được tin cậy. Không đọc/copy private key.

Chạy PowerShell, giữ cửa sổ mở. Nếu đã có tunnel cùng cổng, dùng lại hoặc Ctrl+C cửa sổ cũ trước:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_mhc_lab" -p 8022 -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -N -L 127.0.0.1:9090:127.0.0.1:9090 -L 127.0.0.1:18080:127.0.0.1:18080 -L 127.0.0.1:18131:127.0.0.1:18131 u0_a180@192.168.1.4
```

- Panel: http://127.0.0.1:9090, tài khoản `admin`.
- WordPress LAB: http://127.0.0.1:18080, quản trị `/wp-admin/`, tài khoản `mhcadmin`.
- Người dùng tự sao chép mật khẩu qua SSH vào clipboard; không hiển thị qua tool/chat/log:

```powershell
# Panel
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_mhc_lab" -p 8022 u0_a180@192.168.1.4 'cat ~/.config/mhc-full-installer/panel-login-once' | Set-Clipboard
# WordPress
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_mhc_lab" -p 8022 u0_a180@192.168.1.4 'cat ~/mhc-lab-runs/m1-m2-20261026/wordpress-admin-password' | Set-Clipboard
```

## Truy cập XZ3 và rollback source hiện hành

XZ3: `u0_235@192.168.1.41:8022`, dùng cùng key Windows đã có và StrictHostKeyChecking. Nếu tunnel Vsmart đang chiếm 9090, Ctrl+C cửa sổ đó trước; mở Panel từng node bằng đúng cổng 9090:

~~~powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_mhc_lab" -p 8022 -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -N -L 127.0.0.1:9090:127.0.0.1:9090 -L 127.0.0.1:18131:127.0.0.1:18131 u0_235@192.168.1.41
~~~

XZ3 Panel: http://127.0.0.1:9090; dùng mật khẩu Panel hiện có. Giữ PowerShell mở. Cổng 9091→9090 trước đây không đúng Host/Origin allowlist của original Panel; không tắt guard để dùng cổng đó. Vsmart dùng lệnh ở mục trước, sau khi đóng tunnel XZ3 nếu xung đột. Không mở port Panel ra LAN; XZ3 chưa có Tunnel mới.

Trong Cluster: bấm **Kiểm readiness hai node** → chọn ứng viên bằng **Chọn node — bắt đầu chuẩn bị** → **Bật preview chỉ đọc trên ứng viên**. Website LAB riêng tại http://127.0.0.1:18131 chỉ hoạt động khi preview đang bật và tunnel trỏ đúng node. Đây là dữ liệu synthetic, không phải bản sao đầy đủ WordPress gốc; không cấp Primary/writer hoặc đổi DNS. Dừng preview về Standby rồi hủy ứng viên khi kiểm xong. Nếu muốn xem preview Vsmart, dùng tunnel Vsmart ở mục trước. Bằng chứng và phần NOT RUN ở LIVE-PROGRESS, contract ở P3-INTERNAL-CANDIDATE.md.

Source upgrade hiện hành: `~/.local/state/mhc-source-upgrade/current.json` chỉ version/manifest/transaction; backup và journal `tx-*` cùng thư mục. Gói tại `incoming/release.*`, file `preflight-path` trỏ backup private. Đối chiếu gói/transaction trong LIVE-PROGRESS trước khi verify/rollback, không chọn mù theo mtime. Theo [NODE-SOURCE-UPGRADE.md](NODE-SOURCE-UPGRADE.md), rollback cần reload/health cả Panel và Agent; không restore DB để rollback source. Không chạy lại updater 13-file cũ hoặc fresh install.

## Bằng chứng phục hồi lịch sử ngày 26/10

Thư mục private: `~/mhc-lab-runs/m1-m2-20261026/`. Không chạy lại script tạo site/DB/restore mù vì tài nguyên đã tồn tại.

- `recovery-path`: trỏ backup runtime/SQL trước upgrade; checksum đã kiểm tại node. Không đưa lên GitHub.
- `admin-after-authorized-reset.json` trong recovery là baseline mật khẩu Panel mới. Không phục hồi `admin-before.json` làm mất lần đổi mật khẩu user yêu cầu.
- Source rollback: `~/.local/share/mhc-full-installer/rollback/20261026-114341-29443`.
- Panel apply/rollback/reapply đã kiểm; rollback ID cuối `20261026-114350-5139`. Đây là rehearsal cũ; rollback package hiện hành phải phục hồi cả Panel/Agent theo runbook mới.
- `runtime-fix-backup-path`: bản trước ba sửa WordPress/probe/backup; cần đánh giá regression trước rollback.
- Snapshot hosting: `~/hosting-backups/mhc-full/snapshot-20261026`.
- Restore rehearsal: `restore-drill/`, DB `mhc_restore_m120261026`. HTTP preview 18081 chỉ tồn tại trong bài thử. Không thay site đang phục vụ bằng bản này.
- Logs `self-test-git.log`, `upgrade.log`, `final-deploy.log`, `acceptance.log` giữ trên node; chỉ lấy kết quả đã lọc. Trạng thái nghiệm thu nằm trong LIVE-PROGRESS.

M51/X7b và Cloudflare production không thuộc quyền triển khai LAB. Domain mới: `giaouoc.com`, quản trị `panel.giaouoc.com`.
