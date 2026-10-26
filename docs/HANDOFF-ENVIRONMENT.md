# Môi trường tiếp quản và các đầu vào còn thiếu

## Cập nhật trực tiếp 26/10/2026

Người dùng đã cung cấp repo `https://github.com/litequang/Mini-Hosting-Cluster.git` và cho phép chủ động push checkpoint; branch `codex/m1-m2-foundation`. Vsmart hiện ở `u0_a180@192.168.1.4:8022`, SSH key riêng đã hoạt động. Node đang có MHC 0.4.0B3 trước nâng cấp, demo static, Panel 9090 và stack PHP/MariaDB. Người dùng cho phép xóa/bỏ qua demo vì dùng làm server mới; không có quyền sửa M51/X7b/Cloudflare production từ việc này.

Domain mới là `giaouoc.com`; Panel dự kiến `panel.giaouoc.com`. Chưa cấu hình DNS/Tunnel/Access/authority cho domain này. Các IP/domain bên dưới là hồ sơ cũ, không dùng làm đích triển khai mới.

## Thông tin được ghi nhận, chưa xác minh lại ở lượt bàn giao

| Hạng mục | Giá trị / nguồn | Cách dùng |
|---|---|---|
| Vsmart LAB | `192.168.100.27`, SSH 8022, user `u0_a180`; hồ sơ 26/10 | Xác minh kết nối/IP hiện hành; không coi là máy sạch |
| M51 legacy | `192.168.1.43`, user `u0_a288`; hồ sơ 24/10 | Lịch sử, không tự triển khai |
| X7b legacy | `192.168.1.35`, user `u0_a210`; hồ sơ 24/10 | Lịch sử, không tự dùng làm node LAB |
| Windows repo | `E:\CODE\MHC`; docs 26/10 | Kiểm actual worktree/remote/branch; chưa có SHA repo được xác minh |
| Site Vsmart | `demo`; các trao đổi nâng cấp | Bảo vệ trước upgrade/guard/restore |
| Site production | `pro.thophuong.com`; handoff 24/10 | Không suy ra cấu hình hiện hành, không sửa DNS |
| Panel | `127.0.0.1:9090`, `~/android-hosting-panel` | Nâng cấp đúng Panel gốc, giữ admin data |
| Source cài trên node | `~/.local/share/mhc-full-installer` | Source runtime, khác workspace dev |
| Config cài trên node | `~/.config/mhc-full-installer` | State/secrets trên thiết bị, không có trong bundle |
| Legacy app/storage | `~/apps/thophuongpro`, `storage/sheets` | Lịch sử vị trí; đừng đọc hoặc tải dữ liệu thật về cloud mặc định |
| Legacy backup | `~/hosting-backups/thophuongpro/snapshot-*` | Không đóng gói DB dump/site thật vào source bàn giao |

## Chưa có trong bộ bàn giao

- Git URL, branch đang dùng và commit/worktree mới nhất trên máy người dùng.
- Host fingerprint SSH đã xác minh, private key hoặc password. Sử dụng cấu hình SSH của người dùng; không cần đưa key vào repo/chat.
- Node LAB thứ hai độc lập được cho phép, đường SSH/tunnel và thời gian thử outage.
- Cấu hình Cloudflare thực: Zone/record/Tunnel IDs, Access team/AUD/policy, authority endpoint và quyền tài khoản.
- Chứng cứ snapshot/restore hiện hành, dữ liệu ứng dụng/DB/media, metrics hoặc log runtime thực.

## Trình tự lấy thông tin khi triển khai

1. Đọc repo đang mở và cấu hình SSH đã có. Chỉ hỏi thêm thông tin thật sự chưa thể lấy được từ môi trường.
2. Nếu có quyền/kết nối Vsmart, preflight read-only theo `VSMART-LAB-RUNBOOK.md`; không liệt kê toàn bộ environment hoặc in nội dung credential files.
3. Không có mạng LAN thì làm code/tests workspace trước; chuyển phần nghiệm thu thiết bị cho executor cùng mạng. Không thử xâm nhập/công bố cổng hoặc tạo tunnel mới ngoài nhiệm vụ.
4. Trước bước cần tài khoản Cloudflare hoặc node LAB mới, chuẩn bị code/config/runbook cụ thể để người dùng chỉ làm bước thiếu. Các phần độc lập vẫn tiếp tục.

## Vấn đề SSH/Panel người dùng từng gặp

Tiện ích `tools/MHC-Vsmart-Open-Panel.cmd` là bản đã được tạo trước đây để giảm nhập lệnh mở tunnel. Đọc endpoint và nội dung trước khi dùng vì IP/user/port có thể đổi; không coi nó là giải pháp remote Panel qua Internet đã nghiệm thu.

Người dùng từng gặp CMD không nhập được/khó trả lời `yes` khi SSH. Không dùng cách bỏ kiểm host key để né. Nên chạy lệnh kết nối trong terminal tương tác, xác minh fingerprint qua kênh tin cậy và dùng key/config khi đã thiết lập; không để script tự nhập mật khẩu/đồng ý fingerprint không xác minh.
