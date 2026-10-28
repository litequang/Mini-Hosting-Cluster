# DECISIONS — quyết định đã thống nhất

## 28/10/2026 — Ưu tiên Manual Primary + Control có phạm vi

- User yêu cầu chuyển node thủ công trước, Auto khi lỗi/offline làm sau. Triển khai scoped writer lease cho website WordPress LAB mới, giữ site/Panel production nguyên vẹn; không để replication nâng cao chặn mốc usable.
- Chuyển Primary + Control dùng DB hiện có ở node đích với cảnh báo dữ liệu/RPO. Phải quiesce có bằng chứng cả hai managed writers trước grant; node cũ không liên lạc được thì fail-closed, không checkbox bỏ fencing.
- Phạm vi MHC_MANAGED_WORDPRESS_LAB gồm HTTP gate/PHP/Nginx và SQL app account; root/SQL đặc quyền/shell/same-UID ngoài MHC không là đã fence. Không gọi đây là độc quyền ghi toàn điện thoại hoặc production-safe failover.
- Control có thể chuyển riêng, không sửa site/lease/epoch. Khi P33 opt-in, legacy/P32 mutation và Cron cũ không được race cùng DNS. Auto giữ tắt đến nhiệm vụ sau.
- Lease hết hạn không tự resurrect: resume tạo epoch mới và fence lại; sau khi có ghi, đảo chiều là transition mới có lựa chọn dữ liệu, không tự restore hoặc rollback DB cũ. Contract/cứu hộ ở P33-MANUAL-PRIMARY.md, runtime chỉ ở LIVE-PROGRESS.

## 27/10/2026 — P3.2 dùng tuyến LAB riêng, không mở writer gate

- User chọn panel-lab.giaouoc.com và preview-lab.giaouoc.com. Giữ panel.giaouoc.com; mỗi phone một Tunnel riêng, không chia connector ngẫu nhiên.
- Tái dùng adapter GET/PATCH/GET trong DO hiện có, thêm journal routeRevision riêng cho read-only LAB; không bật legacy checkbox route/complete hoặc writer promote. Declared Primary/epoch/lease giữ nguyên.
- Application LAB riêng có cùng Team/policy admin, AUD đúng app LAB; không sửa app production. Mỗi origin pin exact host/AUD, session gắn Host+JWT; SSH localhost giữ password.
- DNS-only/recovery không tự PASS HTTP: cần origin nhận Access JWT và ký challenge, public preview header/hash khớp local signed readiness. Rollback DNS read-only không rollback dữ liệu; old preview chưa bật phải hiện chờ HTTP.
- Cron Panel-only recovery không là auto election P4. Root/shell/same UID/privileged SQL ngoài guard vẫn làm safe writer Primary BLOCKED. Không dùng P3.2 để cấp writer production.
- User yêu cầu dừng thao tác trình duyệt đang dùng; ưu tiên CLI/API và quyền hiện có. Không mở thêm hoặc điều khiển Chrome để cấu hình tài khoản.

## 27/10/2026 — P3.1 nội bộ, giữ fail-closed writer

- Nhiệm vụ mới cho phép chuẩn bị dữ liệu LAB riêng, activation/proof và begin/abort trên hai Android, không cho đổi DNS/deploy Worker/Access hoặc cutover Internet. Giới hạn nhiệm vụ kiểm kê trước không ngăn công việc P3.1 mới.
- Không chuyển password hashes/users/options/wp-config của WordPress gốc giữa node. Dùng core/media/static LAB và dataset synthetic mới có mật khẩu/salts riêng, ghi rõ không là full data replica.
- Termux cùng UID/root chưa có fencing độc lập; chưa cấp Primary/writer. Chỉ preview read-only, giữ Panel/Agent/SSH/Tunnel Standby, quarantine sau restart/lỗi authority. P3.2 phải giải quyết quyền/Cloudflare và giới hạn writer trước cutover thật.

1. **26/10/2026: Panel 9090 trên tất cả node** (thay controller chuyên dụng là Panel duy nhất). Mọi Panel quản trị chung cùng một cluster.
2. **Shared authority**: không cho mỗi node tự coi mình là Primary; dùng nguồn trạng thái bền vững/tuần tự (đề xuất Cloudflare DO), không đặt dependency sống trên Primary hiện tại.
3. **Manual Primary** từ Internet hoặc Panel bất kỳ là chức năng chính; người dùng chủ động backup/restore, chọn node và xem web sau chuyển.
4. **Auto Primary** khi offline: ưu tiên node khỏe, snapshot mới nhất đáng tin; node cũ khi online bị đưa về Standby/quarantine. Không tự failback.
5. **Dữ liệu không cần bằng nhau** trong MVP; hiển thị rủi ro mất dữ liệu (RPO). Tuy nhiên dữ liệu lệch không biện minh cho split-brain ghi đồng thời.
6. **Vsmart là LAB do Codex trực tiếp cài/test qua SSH**. Không yêu cầu user chạy tests mà Codex làm được. Vsmart từng có demo/DB, cần backup và xác nhận trước khi xóa.
7. **M51 + X7b production legacy**: chỉ chuyển về cùng source MHC **sau khi** Vsmart LAB đạt và user duyệt migration. Không sửa production mặc định.
8. **Chỉ original Hosting Panel 9090**, không viết dashboard mới thay thế. Panel phụ 19090 chỉ phục vụ tương thích LAB nếu cần.
9. **Cloudflare do user thao tác nếu Codex không có quyền**: Codex chuẩn bị cấu hình scripts và chỉ dẫn. Secret không gửi qua chat.
10. **Không tạo tràn lan phiên bản TEST nhỏ**. Lộ trình tối giản: Vsmart hosting ổn -> distributed panel -> manual switchover -> automatic failover LAB -> migration -> v1.
11. **Hostname riêng mỗi node là tùy chọn** để debug/recovery, không bắt buộc triển khai MVP.
12. **Không giả vờ hoàn thành**: test giả lập != end-to-end, backend lưu node role != fencing, đổi DNS != dừng writer.

## Bổ sung 26/10/2026 — Primary phục vụ Panel, Cloudflare Access email-only
- `panel.giaouoc.com` là **một URL chung**, thông thường trỏ tới **node đang làm Primary có xác minh**, không một Panel controller cố định trên Vsmart. Các node đều chạy Panel 9090 riêng để khôi phục.
- Khi Primary offline, địa chỉ Panel chung **vẫn phải mở qua standby/recovery node** nhờ route/authority độc lập; quyền writer không tự cấp chỉ vì Panel đã chuyển.
- Vào Panel từ Internet qua Cloudflare Access email được phép, không nhập tiếp mật khẩu Hosting; xác minh JWT tại origin và CSRF/cookie tiếp tục. Qua SSH localhost giữ mật khẩu làm recovery. Cloudflare policy phải giới hạn đúng email admin.
- Các yêu cầu trên là **thiết kế đã xác nhận**, không hiểu rằng M3/M4 route/election đã triển khai. Chi tiết và nghiệm thu ở `PANEL-ACCESS-SSO-PRIMARY-ROUTING-2026-10-26.md`.


## 26/10 — lifecycle node mới và pairing
- Người dùng cài 3 ứng dụng Android (Termux/Boot/API), sau đó muốn **một lệnh bootstrap full hosting**, **một lệnh ghép từ mã Panel 10 phút**, rồi quản lý node tập trung; không vá rời rạc từng node.
- Bootstrap chỉ trên điện thoại chưa có dữ liệu; existing node dùng một updater có rollback, không re-run clean installer.
- Shared Authority DO lưu thành viên động và mã ghép dùng một lần (192-bit secret, 10 phút, chỉ lưu hash); không yêu cầu sửa `MHC_MEMBERS_JSON` thủ công cho node mới; giữ các thành viên tĩnh cũ.
- Termux:Boot + runsvdir + wake lock + SSH + Panel + Agent được quản lý trong cùng installer/doctor. Quyền tối ưu pin/STAMINA vẫn cần cấp trên giao diện Android.
- Ghép node chỉ cấp Standby, không cấp writer, replication, Primary hoặc chạy website. Điều khiển cập nhật/triển khai app từ Panel về sau chưa được implement và cần cơ chế job an toàn riêng.


## 26/10/2026 — Nhiều Cloudflare zone trong Mini Hosting, không cấu hình IP thủ công
- Đã chốt **bổ sung roadmap P2.5** (sau multi-Panel/Shared Authority P2, phối hợp trước P3 manual Primary): khi `Mini Hosting > Thêm website`, người dùng chọn domain Cloudflare sẵn có, nhập subdomain, chọn site type và đích, nhấn “Tạo & xuất bản”; MHC mới tự cấu hình DNS/Tunnel/Nginx/HTTPS. **Chưa triển khai mã API Cloudflare cho nút Thêm website**.
- Token chỉ cấp quyền theo zone/account cụ thể, giữ trong control plane tin cậy, KHÔNG phân phát DNS Edit token xuống mọi node. Không động đến tên miền đang tồn tại ngoài danh sách/luồng MHC. Subdomain trùng thì báo xung đột, không ghi đè.
- Không cấu hình IP cố định; website đi qua named Tunnel. Wildcard subdomain chỉ bật riêng từng domain theo opt-in, mặc định API tạo hostname cụ thể. Đổi Primary phải tái sử dụng Cloudflare routing adapter và kiểm tra trạng thái dịch vụ + cấp quyền writer độc lập.
- **Phân vai Primary/Panel**: mọi node có Panel 9090 độc lập; `panel.giaouoc.com` bình thường trỏ tới Primary đã xác minh, nhưng có tuyến recovery vào Standby khi Primary offline. Shared authority nằm ngoài Primary. Việc chuyển Panel không phải là tự cấp Primary.
## Ghi nhận kiểm kê 27/10/2026

13. Không dùng marker installer hoặc heartbeat làm chứng nhận bản source đang cài, Tunnel/Access đang hoạt động hay node được cấp Primary; so Git blob từng file và kiểm runtime riêng.
14. Người dùng xác nhận F3216 là LAB ở nhà; chưa có SSH trực tiếp từ công ty. Chỉ quan sát telemetry, không dùng thay hai LAB tại công ty để nghiệm thu.
15. Nhiệm vụ tiếp nhận lần này chỉ kiểm kê và tài liệu; giữ các code clock-health ở workspace cha, không gộp vào branch hay triển khai P3/P4 trong lượt này.
16. Đồng bộ bản mới phải kiểm cả managed source và live Panel, bao gồm JWT/bridge/index/helpers; updater 13 file không đủ nâng cấp hoàn chỉnh. Không apply Panel từ managed JWT cũ; canary XZ3 và rollback cả source lẫn process trước Vsmart. Chỉ đề xuất kế hoạch trong kiểm kê 27/10, chưa thực thi.
17. Nhiệm vụ tiếp theo 27/10 đã cho phép build/test package source-only và rollout XZ3 trước, Vsmart sau khi canary đạt. Package offline, một commit/manifest cho cả hai, không cài mới Termux, không đổi Cloudflare/Primary/production; không tự reboot. Checkpoint 9d14f34 là audit lịch sử, LIVE-PROGRESS giữ kết quả rollout mới.
