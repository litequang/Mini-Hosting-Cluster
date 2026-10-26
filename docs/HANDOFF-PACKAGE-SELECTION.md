# Chọn source và thứ tự ưu tiên — 26/10/2026

## Thứ tự dùng khi tiếp quản

1. Yêu cầu mới nhất của người dùng và code thực tế chưa commit/commit mới hơn trong repository.
2. Tài liệu `HANDOFF-*` và `CODEX-MASTER-PROMPT.md` trong project này: bản tổng hợp hiện hành, phân biệt triển khai với đề xuất.
3. `AGENTS.md`, `CODEMAP`, `ARCHITECTURE`, `DECISIONS`, `ROADMAP-TO-V1`, runbook: ngữ cảnh tiếp quản ngày 26/10. Kiến trúc cloud là hướng đề xuất, không tự trở thành runtime hay giấy phép sửa tài khoản.
4. Runtime baseline REMOTE-PANEL và test kèm theo: bằng chứng source, chưa là nghiệm thu thực tế.
5. PREFLIGHT, release reports và bộ 24/10: nguồn diff/lịch sử. Không dùng yêu cầu cũ buộc replication bằng nhau để chặn MVP hiện tại.

## Đối chiếu đã thực hiện ở lượt đóng gói

| Nguồn | Kết quả |
|---|---|
| `MHC-Full-Installer-TEST-0.5.0C-REMOTE-PANEL.zip` | 406 mục ZIP gồm thư mục; **355 tệp** baseline; CRC đạt |
| `MHC-CODEX-COMPLETE-HANDOFF-2026-10-26.zip` | **365 tệp**, chứa đủ 355 tệp baseline giống byte; thêm 10 docs tiếp quản; không có runtime khác |
| `MHC-CODEX-DOCS-2026-10-26.zip` | 10 docs tiếp quản; giữ bản gốc trong archives |
| `MHC-Full-Installer-TEST-0.5C-REMOTE-PREFLIGHT.zip` | 402 mục ZIP; thêm 2 tệp, thiếu 6 tệp, thay đổi 15 tệp so với REMOTE-PANEL; không áp tự động |
| `MHC-TRANSFER-2026-10-24(2).zip` | 18 tệp: 4 tệp bàn giao ở root, 13 ZIP nguồn lịch sử và 1 hướng dẫn trong packages |

Các mã băm nguồn được ghi trong `../SOURCE-PROVENANCE.json` tính từ root bộ bàn giao (trong project mở độc lập, xem bản ở thư mục cha).

## PREFLIGHT: hai tệp chỉ có ở nhánh đó

- `bin/remote-panel-preflight.sh`
- `docs/REMOTE-PRIMARY-ACCESS.md`

Đây là preflight chỉ đọc và runbook cũ dùng controller riêng. Có thể chọn lọc tiện ích, nhưng không lấy mô hình controller-only thay yêu cầu Panel mọi node.

## Sáu tệp REMOTE-PANEL có mà PREFLIGHT thiếu

- `CHANGELOG-TEST-0.5.0C-REMOTE-PANEL.md`
- `bin/legacy-panel-src/src/mhc-remote-access.mjs`
- `bin/remote-panel.mjs`
- `docs/REMOTE-PRIMARY-ACCESS-0.5C.md`
- `tests/remote-panel.mjs`
- `vendor/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/panel/src/mhc-remote-access.mjs`

## Mười lăm tệp có nội dung khác nhau

`CHANGELOG.md`, `README.md`, `install.sh`, `bin/legacy-panel-src/public/app.js`, `bin/legacy-panel-src/src/server.mjs`, `bin/legacy-panel.sh`, `bin/mhc-full-wrapper`, `bin/node-clone.mjs`, `bin/node-enroll.mjs`, `bin/node-enroll.sh`, `bin/node-readiness.mjs`, `bin/node-role-guard.mjs`, `bin/self-test.sh`, `tests/legacy-panel-bridge.mjs`, `vendor/mini-hosting-warm-standby-v1/mini-hosting-dr-v1/panel/src/server.mjs`.

Số chính xác được máy tính ghi trong `SOURCE-PROVENANCE.json`. Không suy ra chất lượng từ thời gian lưu hay số mục ZIP.

## Quy tắc ghép

Diff từng tệp nếu cần, giữ origin Access JWT/auth/CSRF, bổ sung test cho thay đổi có tác động, xác minh marker/command tương thích. Không dùng `cp -r`/giải nén đè cả PREFLIGHT. Không tự gộp HA Controller + Safe Control + staged v1.0 thành nhiều bộ bầu chọn song song.

Source bàn giao không chứa `.git`; không có commit SHA được xác minh của repo người dùng. SHA-256 trong manifest chỉ định danh nội dung snapshot, không thay thế Git history.
