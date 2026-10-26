# MHC TEST 0.5C — Đăng nhập từ Internet để chọn Primary

## Trạng thái

Bản này bổ sung **bảo vệ Cloudflare Access JWT ở origin** và cấu hình hostname HTTPS cho **Android Mini Hosting Panel gốc 9090**. Chưa cài đặt hay xác minh Cloudflare Tunnel/Access trên tài khoản, chưa có chứng cứ manual/auto switchover trên hai Android thật. M51, X7b production không được nâng cấp thử.

## 1. Chọn máy đặt Panel quản lý

**Panel dùng để chọn Primary phải chạy trên controller độc lập, không phải chính Primary dễ offline.** Muốn quản trị từ Internet khi Primary M51 mất mạng, controller và Tunnel phải còn online. Panel ở node không phải controller sẽ hiện danh sách node thiếu/chưa hợp lệ và từ chối thao tác.

Nếu Vsmart chỉ là thiết bị chạy website demo, chỉ nâng cấp source để xem trạng thái, **không khai báo nó là cluster controller** hoặc ARM HA tự động.

## 2. Chuẩn bị Cloudflare (thao tác trong tài khoản riêng)

1. Tạo Access **Self-hosted application**, hostname quản trị riêng, ví dụ `admin.thophuong.com`, chỉ cho email quản trị được phép.
2. Ghi lại **Team Domain** dạng `ten-team.cloudflareaccess.com` và **Application Audience (AUD) tag** trong Access application. AUD tag là thông tin nhận diện ứng dụng, không phải API token.
3. Trên **controller độc lập** có Panel gốc 9090 và `cloudflared`, tạo **Published application** trong một Tunnel đang hoạt động: hostname = chính xác hostname ứng dụng Access; Service URL = `http://127.0.0.1:9090`.
4. Không đặt tùy chọn `httpHostHeader=localhost` hoặc `127.0.0.1`; cần Host gốc của hostname HTTPS để xác minh. Không mở cổng 9090 từ modem/router và không đặt Panel vào public bind address.
5. Khuyến nghị cấu hình Cloudflare Tunnel **Protect with Access** theo Audience tag tương ứng. Panel cũng xác minh `Cf-Access-Jwt-Assertion` độc lập bằng JWKS từ Team Domain. Không tắt lớp xác minh này.

Tài liệu chính thức:
- https://developers.cloudflare.com/tunnel/get-started/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

## 3. Cài mã trên node controller TEST (giữ nguyên dữ liệu)

```sh
bash bin/self-test.sh
bash install.sh --upgrade
~/mhc-full hosting-panel plan
# Chỉ nếu tất cả PASS: ~/mhc-full hosting-panel apply
# Lưu ROLLBACK_ID, rồi sv restart amh-panel
```

Kiểm tra cấu hình ở chế độ chỉ đọc:

```sh
~/mhc-full remote-panel plan
~/mhc-full remote-panel status
```

Sau khi đã tạo Access application và biết đúng hostname/team/AUD, cấu hình **trên controller có original Panel**:

```sh
~/mhc-full remote-panel configure admin.thophuong.com TEN-TEAM.cloudflareaccess.com AUD_TAG --confirm=ENABLE_CLOUDFLARE_ACCESS_JWT
sv restart amh-panel
```

Nếu dùng `panel.thophuong.com` thay vì `admin.thophuong.com`, thay đúng tên trong cả Access/Tunnel/CLI. Lệnh cấu hình không gọi Cloudflare API, không tự tạo DNS, Access policy hoặc Tunnel. File riêng `~/android-hosting-panel/data/remote-access.json` phải có quyền 0600 và giữ nguyên khi cập nhật Panel.

## 4. Đăng nhập từ xa, chọn Primary

1. Ngoài LAN, mở `https://admin.thophuong.com` và đăng nhập Cloudflare Access.
2. Trên **chính Panel gốc 9090**, nhập tiếp mật khẩu admin hiện có của Panel.
3. Vào **Cluster → Chọn Primary thủ công**, chọn node đăng ký trong controller.
4. Bạn chủ động backup/restore và **dừng hẳn đường ghi của Primary cũ**. Kiểm tra website và dữ liệu trên node mới, đổi đích Cloudflare để tới node mới, xác minh từ mạng khác.
5. Sau cùng mới xác nhận hoàn tất checklist trên Panel. **Trạng thái chỉ là lựa chọn đã ghi nhận từ quản trị viên**, chưa có phép đo độc lập chứng minh chống split-brain hay đổi route thật.

Với Auto Primary, watcher chỉ chạy trên controller độc lập và **mặc định chỉ đề xuất**. BEST_EFFORT_ROUTE là cơ chế rủi ro thử nghiệm, không bật trên production: mất heartbeat không có nghĩa writer cũ đã chết.

## 5. Xử lý lỗi / hoàn tác

- Truy cập HTTPS báo `403 Remote Access verification required`: kiểm tra hostname `Host`, ứng dụng Access, Team Domain/AUD; không tự tắt xác minh JWT. JWT phải mang header `Cf-Access-Jwt-Assertion` và signature hợp lệ.
- Cloudflare Access đăng nhập xong nhưng Panel yêu cầu thêm mật khẩu: bình thường, đây là lớp xác thực thứ hai.
- Lỗi chứng chỉ/JWKS hoặc Cloudflare không truy cập được: **chặn truy cập từ xa**, vẫn có thể vào qua SSH localhost nếu cần.
- Nếu chưa thấy node để chọn: xem `~/mhc-full primary-select status` trên **controller**, không dùng Panel của một node thường.
- Tắt remote mode: `~/mhc-full remote-panel disable --confirm=DISABLE_REMOTE_PANEL`, sau đó restart `amh-panel`. Không thay đổi dịch vụ hosting.
- Mã Panel lỗi sau `hosting-panel apply`: chạy `hosting-panel rollback ROLLBACK_ID` và restart `amh-panel`; file cấu hình remote do admin tạo không bị xóa tự động.

## 6. Còn thiếu để production-ready

Hai node Android thực, tunnel/controller độc lập, node-guard áp dụng thật và toàn bộ đường ghi không bypass, Cloudflare Access thật, route thay đổi và rollback qua mạng ngoài, cùng kiểm tra dữ liệu khi node cũ rejoin. Chưa có bằng chứng hoàn tất các mục này.
