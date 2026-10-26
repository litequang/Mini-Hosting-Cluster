# Prompt giao Codex tiếp tục MHC

**Model đề xuất: GPT-6.1 Sol — Thinking: High.** Nếu môi trường không có model này, dùng model lập trình khả dụng và ghi đúng model đang dùng; không đổi model bằng cách sửa tên trong văn bản.

Bạn tiếp quản **MHC — Android Mini Hosting Cluster**. Project là thư mục `MHC/` trong bộ bàn giao; nếu đang ở repo Windows `E:\CODE\MHC`, kiểm tra repo thật trước, không giải nén đè hay reset về ZIP.

## Đọc trước khi sửa

Đọc `AGENTS.md` -> `docs/CODEMAP.md` -> `docs/ARCHITECTURE.md` -> `docs/DECISIONS.md` -> `docs/TROUBLESHOOTING.md` -> `docs/HANDOFF-PACKAGE-SELECTION.md` -> `docs/HANDOFF-SOURCE-AUDIT-2026-10-26.md` -> `docs/ROADMAP-TO-V1.md` -> `docs/VSMART-LAB-RUNBOOK.md` -> `docs/HANDOFF-ENVIRONMENT.md` -> `docs/HANDOFF-ACCEPTANCE.md`. Đọc thêm `../01-PROJECT-HANDOFF.md` nếu file hiện diện.

Kiểm `git status`, branch, log và diff. Giữ mọi thay đổi mới hơn trong workspace. Baseline của gói là REMOTE-PANEL; PREFLIGHT chỉ là nhánh đối chiếu vì thiếu các tệp Remote Access. Không copy đè toàn cây và không chạy các installer trong `archives/`.

## Mục tiêu người dùng đã chốt

- Mỗi node đều có **Panel gốc 9090 + agent**. Mọi Panel thấy cùng cluster và có thể chọn node Primary, kể cả khi Primary cũ offline.
- Người dùng ở ngoài LAN đăng nhập Panel qua trình duyệt; URL quản trị chung phải sống khi Primary website chết. Không tạo dashboard thay thế ở 19090.
- **Manual:** tự backup/restore được; chọn node mới phải chuyển việc phục vụ thực tế, không chỉ đổi nhãn.
- **Auto:** Primary offline đủ ngưỡng thì chọn node còn khỏe có dữ liệu sẵn có mới nhất, không ép đồng bộ GTID/checksum giữa mọi node. Hiển thị thời điểm và độ tin cậy của snapshot, rủi ro mất dữ liệu chưa backup.
- Máy cũ quay lại chỉ làm Standby/Quarantine, không tự giành quyền, không tự bật writer, không tự merge/restore ngược.
- Giữ checks thiết yếu, bỏ audit/mô phỏng/UI lặp lại. Replication liên tục, điểm node phức tạp làm sau MVP. Phát hành theo mốc hữu dụng.

## Khoảng trống phải giải quyết

`manual-primary.mjs` chỉ ghi record ở controller local. `auto-primary.mjs` còn phụ thuộc controller đó, xếp snapshot theo tên ngày, DNS API verify chưa chứng minh HTTP đúng node. Guard chỉ hạ services opt-in và **không tự khởi động candidate mới**. Chưa có shared authority/multi-Panel dùng được, chưa nghiệm thu hai Android/Cloudflare thật.

Không bỏ toàn bộ code để viết hệ thống mới. Chọn thiết kế đơn giản nhất có một trạng thái Primary nhất quán, revision/epoch, thao tác idempotent, pending cutover có phục hồi. Có thể tận dụng Worker/DO/reference hiện có sau khi đánh giá; kiến trúc cloud cụ thể cần được kiểm chứng theo tài khoản/chi phí thực tế.

## Thực thi theo mốc

1. **M1:** audit ngắn, xác định source đúng, sửa lỗi nền và xác minh installer/rollback; preflight Vsmart LAB khi có kết nối hợp lệ, bảo vệ `demo`/Panel/password. Hosting static/PHP/DB/WordPress và backup/restore/reboot có bằng chứng thật khi thiết bị khả dụng.
2. **M2:** Panel/agent mọi node dùng authority chung; auth và role/route không divergent. Quản trị sống độc lập route web; Standby vẫn có Panel/agent/tuyến cứu hộ.
3. **M3:** Manual end-to-end từ mọi Panel: data readiness -> old writer stop/demote -> candidate activation -> route -> external node identity/health -> commit. Có journal, retry, rollback theo dữ liệu. Không bắt người dùng đồng bộ liên tục.
4. **M4:** Auto dùng lại luồng manual, health threshold/cooldown, newest usable snapshot, nhất quán bầu chọn, old node quarantine. Kiểm outage/reboot/network partition/authority unavailable/crash recovery trên hai LAB thật khi được cấp.
5. **M5:** chuẩn bị migration M51/X7b; chưa tự cutover production. Replication nâng cao là M6 sau MVP.

Không thêm lớp kiểm tra hàn lâm để chặn bản dùng được. Đồng thời phải phân biệt dữ liệu cũ chấp nhận được với hai writer cùng nhận ghi: nếu chỉ best effort, mô tả đúng phạm vi và phần còn thiếu, không gọi production HA.

## Quyền và dữ liệu

Vsmart gần nhất: `u0_a180@192.168.100.27:8022`, từng có `demo`, không phải máy sạch. Dùng SSH/host key đã được tin cậy trong môi trường người dùng; không tắt kiểm host key. Docs cũ ghi được phép cài/test LAB có bảo vệ dữ liệu; chỉ thực hiện trong phạm vi quyền/kết nối thật đang có. Không tự xóa demo, drop DB hoặc reset Termux.

M51/X7b và Cloudflare production không được sửa trong nhiệm vụ này. Không thu thập token/private key/mật khẩu/DB dump thật vào chat/repo/gói bàn giao. Chuẩn bị source/config và bước Cloudflare cụ thể; nếu cần user thao tác tài khoản thì dừng đúng bước đó, các phần code độc lập vẫn tiếp tục.

Nếu cloud không tới IP LAN hoặc thiếu node LAB thứ hai, tiếp tục code và test tại workspace; ghi NOT RUN cho thiết bị/remote và đưa lệnh triển khai cho local Codex. Không giả kết quả. Không dừng toàn bộ công việc chỉ vì một bước nghiệm thu cần thiết bị chưa có.

## Bàn giao mỗi mốc

Chạy tests phù hợp thay đổi trong MHC khi môi trường cho phép; bộ này không kế thừa lệnh cấm test của dự án Thờ Phượng Pro. Ghi PASS / FAIL / NOT RUN, môi trường/commit và bằng chứng đã lọc. Không coi báo cáo test cũ là lần chạy mới. Full self-test REMOTE-PANEL cũ chưa hoàn tất do timeout.

Cập nhật docs liên quan có chọn lọc; commit từng mốc độc lập. Chỉ push đúng remote/branch đã được thiết lập/ủy quyền. Một ZIP cho một mốc hữu dụng, tránh chuỗi bản TEST không làm xong thao tác thật.

**Bắt đầu ngay bằng đọc source, kiểm workspace và báo audit rất ngắn; sau đó thực thi phần có thể làm của M1/M2. Không chỉ trả về kế hoạch.**
