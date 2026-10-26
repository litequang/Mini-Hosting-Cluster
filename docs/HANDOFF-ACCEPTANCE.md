# Checklist nghiệm thu cho Codex tiếp theo

Mẫu kết quả. **Tất cả các dòng dưới đang NOT RUN cho bản bàn giao này.** Báo cáo phát hành cũ giữ ở archives, không được tự chép PASS sang bảng này.

Mỗi lần chạy ghi: ngày/giờ, commit/source hash, thiết bị/OS/runtime, lệnh hoặc kịch bản, PASS/FAIL/NOT RUN, file bằng chứng đã lọc, lỗi và bước phục hồi. Bảo vệ DB/key/token/password.

| ID | Phép thử / tiêu chí đạt | Trạng thái ban đầu |
|---|---|---|
| M1-01 | Cài/nâng source đúng phiên bản; có rollback; demo/password/DB hiện có còn nguyên | NOT RUN |
| M1-02 | Panel gốc 9090 đăng nhập được, đúng modules PHP/DB/hosting, session/CSRF hoạt động | NOT RUN |
| M1-03 | Static + PHP + MariaDB + WordPress LAB chạy HTTP/thao tác DB/upload thật | NOT RUN |
| M1-04 | Backup đầy đủ, checksum, restore sang vùng LAB riêng và website hoạt động | NOT RUN |
| M1-05 | Android reboot/Termux lifecycle: services trở lại đúng role, SSH còn vào được | NOT RUN |
| M2-01 | Hai Panel ở hai node đọc cùng membership/Primary/revision | NOT RUN |
| M2-02 | Hai yêu cầu chọn Primary đồng thời chỉ tạo một transition hợp lệ | NOT RUN |
| M2-03 | Primary mất mạng nhưng URL Panel chung và Panel Standby còn vào được | NOT RUN |
| M2-04 | Remote qua mạng ngoài: Access + Panel auth, JWT/Host/AUD/expiry và CSRF được kiểm | NOT RUN |
| M2-05 | Node không hợp lệ không gửi heartbeat/role mutation hoặc replay được | NOT RUN |
| M3-01 | Manual từ Panel A/B: chọn B, restore thủ công hợp lệ, B thực sự phục vụ sau chuyển | NOT RUN |
| M3-02 | HTTP từ ngoài nhận diện B, kiểm website/DB; DNS API đúng đích chưa đủ | NOT RUN |
| M3-03 | A dừng/khóa writers trong phạm vi đã công bố; Panel/agent vẫn sống | NOT RUN |
| M3-04 | Crash từng bước pending/route/commit, retry không bầu/chuyển lặp hoặc mất journal | NOT RUN |
| M3-05 | Rollback có điều kiện; không trả về DB cũ nếu đã có ghi mới mà chưa xử lý dữ liệu | NOT RUN |
| M4-01 | Outage A đủ ngưỡng -> chọn candidate khỏe có snapshot usable mới nhất | NOT RUN |
| M4-02 | Hai snapshot cùng ngày, timestamp tương lai/clock skew, backup chưa restore: xếp đúng hoặc báo rõ chưa đủ tin cậy | NOT RUN |
| M4-03 | Auto kích hoạt B trước/chung quy trình route; không chỉ đổi CNAME vào node vẫn tắt | NOT RUN |
| M4-04 | A online/reboot lại giữ Standby/Quarantine, không tự bật writer/chiếm route | NOT RUN |
| M4-05 | A bị chia mạng nhưng CPU/DB còn chạy: hành vi đúng phạm vi fencing/guard đã công bố | NOT RUN |
| M4-06 | Authority mất liên lạc: không tạo quyết định Primary độc lập cạnh tranh; hiển thị lỗi cụ thể | NOT RUN |
| M4-07 | Candidate chết trong cutover/pending recovery: không tuyên bố chuyển thành công sai | NOT RUN |
| M4-08 | Flapping/repeated outage: cooldown/tie-break ổn định, không tự failback | NOT RUN |
| M5-01 | Migration production có backup ngoài máy, dry-run, duyệt cutover, rollback và smoke test | NOT RUN — ngoài phạm vi triển khai hiện tại |

## Test tự động có sẵn để chạy khi triển khai

Tại root `MHC/`, đọc script trước; dùng HOME/temp fixtures của test, không trỏ HOME về node production:

```bash
node tests/manual-primary.mjs .
node tests/auto-primary.mjs .
node tests/auto-recovery.mjs .
node tests/node-role-guard.mjs .
node tests/remote-panel.mjs .
node tests/legacy-panel-bridge.mjs .
```

Full regression trên Linux/WSL/Termux phù hợp:

```bash
bash bin/self-test.sh
```

Các script Node trên là runner tự viết nhận root qua argv; không tự đổi sang `node --test` nếu chưa đọc mã. Nếu full test timeout, ghi đúng nhóm cuối/kết quả, chạy riêng phần còn thiếu phù hợp; không đánh dấu full PASS khi chưa kết thúc.

## Mẫu kết thúc một mốc

```markdown
Commit/source hash:
Thiết bị và môi trường:
Chức năng đã thay đổi:
Tests tự động PASS/FAIL/NOT RUN:
Kịch bản Android/Cloudflare PASS/FAIL/NOT RUN:
Bằng chứng đã lọc:
Rollback đã kiểm:
Giới hạn còn lại:
Mốc tiếp theo:
```
