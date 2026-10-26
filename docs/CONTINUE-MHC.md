# Tiếp tục MHC sau gián đoạn

**Nguồn trạng thái thực thi duy nhất: [LIVE-PROGRESS.md](LIVE-PROGRESS.md).** File này chỉ giữ cách tìm source, kết nối và phục hồi.

## Source và Git

- Remote: `https://github.com/litequang/Mini-Hosting-Cluster.git`.
- Branch: `codex/m1-m2-foundation`; commit/push sau checkpoint có ý nghĩa.
- Checkout Git: `E:\CODE\MHC\MHC\.work\repository`. Cây ngoài là workspace bàn giao; đối chiếu thay đổi trước khi copy vào checkout, không reset/giải nén đè.
- Khi mất máy, clone repo và checkout branch trên. Đọc AGENTS và tài liệu theo thứ tự, sau đó LIVE-PROGRESS; kiểm Git status/log.
- Tạo gói bằng `git archive` để giữ executable bit/LF. Không gói `.work`, secrets, database hoặc backup thiết bị.

## Truy cập Vsmart

SSH: `u0_a180@192.168.1.4:8022`, key `%USERPROFILE%\.ssh\id_ed25519_mhc_lab`. Host key đã được tin cậy. Không đọc/copy private key.

Chạy PowerShell, giữ cửa sổ mở. Nếu đã có tunnel cùng cổng, dùng lại hoặc Ctrl+C cửa sổ cũ trước:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_mhc_lab" -p 8022 -o StrictHostKeyChecking=yes -o ExitOnForwardFailure=yes -N -L 127.0.0.1:9090:127.0.0.1:9090 -L 127.0.0.1:18080:127.0.0.1:18080 u0_a180@192.168.1.4
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

## Phục hồi và bằng chứng trên node

Thư mục private: `~/mhc-lab-runs/m1-m2-20261026/`. Không chạy lại script tạo site/DB/restore mù vì tài nguyên đã tồn tại.

- `recovery-path`: trỏ backup runtime/SQL trước upgrade; checksum đã kiểm tại node. Không đưa lên GitHub.
- `admin-after-authorized-reset.json` trong recovery là baseline mật khẩu Panel mới. Không phục hồi `admin-before.json` làm mất lần đổi mật khẩu user yêu cầu.
- Source rollback: `~/.local/share/mhc-full-installer/rollback/20261026-114341-29443`.
- Panel apply/rollback/reapply đã kiểm; rollback ID cuối `20261026-114350-5139`. Chỉ restart `amh-panel` khi cần.
- `runtime-fix-backup-path`: bản trước ba sửa WordPress/probe/backup; cần đánh giá regression trước rollback.
- Snapshot hosting: `~/hosting-backups/mhc-full/snapshot-20261026`.
- Restore rehearsal: `restore-drill/`, DB `mhc_restore_m120261026`. HTTP preview 18081 chỉ tồn tại trong bài thử. Không thay site đang phục vụ bằng bản này.
- Logs `self-test-git.log`, `upgrade.log`, `final-deploy.log`, `acceptance.log` giữ trên node; chỉ lấy kết quả đã lọc. Trạng thái nghiệm thu nằm trong LIVE-PROGRESS.

M51/X7b và Cloudflare production không thuộc quyền triển khai LAB. Domain mới: `giaouoc.com`, quản trị `panel.giaouoc.com`.
