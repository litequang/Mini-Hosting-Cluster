# Authority chung M2 — chuẩn bị, chưa chuyển Primary

Source: `reference/cluster-authority/worker.mjs`, `bin/cluster-authority.mjs` và Panel gốc 9090.
Domain mục tiêu người dùng xác nhận: `giaouoc.com`, quản trị dự kiến `panel.giaouoc.com`.

## Phạm vi đã có

Một Durable Object cho một cluster UUID, membership khai báo trước (tối đa 200), token riêng cho agent và Panel của từng node. Agent chỉ gửi heartbeat; Panel có session/CSRF hiện có mới yêu cầu begin/abort. Token chỉ đi server-to-server, không trả về trình duyệt.

Begin cần expectedRevision + requestId UUID + heartbeat đích còn mới. Transaction lưu pending, tăng revision/epoch và ghi receipt/audit cùng lúc. Cùng requestId/cùng nội dung trả receipt cũ; requestId khác nội dung bị từ chối. Pending không tự mất khi process khởi động lại và không tự đổi Primary. Abort chỉ hủy phiên chuẩn bị, không hoàn tác database/route.

Heartbeat dùng sequence tăng dần, timestamp trong 60 giây so với authority, thời điểm nhận do server ghi. Chưa báo cáo/kiểm chứng snapshot; heartbeat không chứng minh website khỏe. Đồng hồ node phải đúng.

Khi có `authority.json`, Panel đọc authority; cấu hình hỏng/mất kết nối hiện AUTHORITY_UNAVAILABLE. Manual/auto/role-accept cũ bị chặn, không fallback về local selection. Guard không cấp quyền writer từ bản ghi authority này. Không bật chế độ này trên một node đang phục vụ rồi kỳ vọng writer tiếp tục chạy.

**M2 chưa hoàn thành nghiệm thu**: chưa deploy Cloudflare, chưa có hai Panel Android dùng chung endpoint thật, chưa có tuyến quản trị chung dự phòng. `declaredPrimary=null`, `writeLeaseGranted=false`, nút complete không có trong chế độ chung. M3 phải bổ sung activation/fencing/route/HTTP identity trước commit. M4 mới dùng lại luồng đó cho Auto.

## Triển khai authority LAB khi sẵn sàng

1. Người dùng đăng nhập tài khoản Cloudflare quản lý `giaouoc.com`. Dùng Worker mới `mhc-cluster-authority-lab`, namespace DO riêng; không áp lên Worker/witness cũ.
2. Trong `reference/cluster-authority`, dùng Wrangler đã được cài/đăng nhập: `wrangler deploy`. Cấu hình đã khai báo class/migration SQLite.
3. Đặt `MHC_CLUSTER_ID` bằng `wrangler secret put MHC_CLUSTER_ID`: UUID cluster thống nhất.
4. Đặt `MHC_MEMBERS_JSON` bằng `wrangler secret put MHC_MEMBERS_JSON`. Nhập trực tiếp tại máy, không chat/commit. Giá trị là mảng `{nodeId,label,agentKey,panelKey}`; nodeId giữ identity riêng của từng điện thoại, mỗi key ngẫu nhiên base64url ít nhất 43 ký tự và không trùng bất kỳ key nào.
5. Endpoint có thể dùng hostname workers.dev vừa deploy. Chưa cần thêm DNS authority vào giaouoc.com. Client bắt buộc HTTPS, không chấp nhận redirect. Khi thiếu secrets, endpoint fail-closed.

Đừng tạo service token Access cho endpoint này rồi gửi nhầm cho Panel: bản M2 dùng bearer riêng của authority. Panel browser vẫn phải qua Access JWT + mật khẩu/CSRF khi được public.

## Cấu hình từng node LAB

Sau source upgrade, tạo private file `~/.config/mhc-full-installer/authority.json` (0600, directory 0700):

```json
{
  "schema": 1,
  "url": "https://YOUR-LAB-WORKER.workers.dev",
  "clusterId": "CLUSTER_UUID",
  "nodeId": "EXISTING_NODE_UUID",
  "agentTokenFile": "/ABSOLUTE/PRIVATE/PATH/agent-token",
  "panelTokenFile": "/ABSOLUTE/PRIVATE/PATH/panel-token"
}
```

Các token file là 0600, không symlink, không nằm trong source Git. Không copy node identity hay token giữa điện thoại. Membership được quản lý từ Cloudflare ở giai đoạn này; enrollment cũ không tự thêm vào authority.

```sh
~/mhc-full cluster-authority heartbeat
~/mhc-full cluster-authority status
~/mhc-full cluster-authority service-install --confirm=INSTALL_LAB_AUTHORITY_AGENT
```

Runit service `mhc-authority-agent` chỉ heartbeat mỗi 30 giây, không đổi role/services/route. Trên mỗi Panel: Cluster phải cùng revision/pending. Thử hai yêu cầu đồng thời, refresh sau lỗi revision, ngắt authority và kiểm lỗi cụ thể. Không dùng hai HOME giả lập để ghi PASS cho hai Android thật.

## Quản trị giaouoc.com và rollback

- Giai đoạn một node: Tunnel riêng tới `http://127.0.0.1:9090`, hostname `panel.giaouoc.com`; Access policy cho email được phép; cấu hình origin JWT bằng `remote-panel` sau khi có team/AUD thực. Chưa tạo DNS hoặc nới origin allowlist ở lượt này.
- Giai đoạn nhiều node: tuyến quản trị phải độc lập web và có đích dự phòng. Không coi một CNAME trỏ Vsmart là quản trị còn sống khi Vsmart mất mạng. Chưa triển khai phần router này.
- Không hạ named-tunnel trong guard vì có thể đang chở Panel/agent. Giữ bản cấu hình guard cũ để đối chiếu; chưa ARM guard trên Vsmart.
- Rollback cấu hình shared chỉ thực hiện khi đã dừng agent/auto và đánh giá toàn bộ pending/role; đừng xóa authority.json để âm thầm bật lại local election. Worker/journal giữ nguyên để khôi phục.

## Cơ sở và test

Storage dùng transaction cho state/receipt/audit theo [Cloudflare SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/). Chi phí/quota/tài khoản chưa được thẩm định, không cam kết gói miễn phí đáp ứng vận hành.

`tests/cluster-authority.mjs`: concurrency, role separation, replay, restart, failed transaction, nonce và fail-closed bằng storage/transport fixture. `tests/authority-panel.mjs`: bridge dispatch và chặn legacy. Cloudflare runtime thật vẫn NOT RUN.
