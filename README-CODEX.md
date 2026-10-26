# Tiếp quản MHC — 26/10/2026

Đọc `AGENTS.md`, `CODEX-MASTER-PROMPT.md` và các tài liệu `docs/HANDOFF-*`.
Source runtime là REMOTE-PANEL giữ nguyên; đây là checkpoint bàn giao, chưa phải release chức năng mới.
Nếu mở được thư mục cha, đọc thêm `00-READ-FIRST.md` và `01-PROJECT-HANDOFF.md`.

PREFLIGHT là nhánh so sánh ở archives, không chép đè. Không chạy installer lịch sử.
Ưu tiên Panel gốc 9090 mọi node -> manual cutover thật -> auto + rejoin; replication nâng cao làm sau.
Giữ dữ liệu Vsmart/demo; không sửa M51/X7b hoặc Cloudflare production.

Báo cáo test cũ không được kế thừa thành PASS ở lần chạy mới. Checklist ở `docs/HANDOFF-ACCEPTANCE.md`.
