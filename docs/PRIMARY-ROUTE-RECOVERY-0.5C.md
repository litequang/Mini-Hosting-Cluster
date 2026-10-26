# TEST 0.5C — Route recovery và standby rejoin guard

## Thiết kế tối giản
- **Manual:** quản trị viên backup/restore (có thể lệch dữ liệu), khóa writer cũ, kiểm tra website mới, tự đổi tuyến, rồi ghi nhận Primary trên Panel 9090. Không cần GTID replication.
- **Auto:** controller thứ ba độc lập theo dõi heartbeat SSH và chọn standby khỏe, snapshot có ngày mới nhất. Không lấy ngày backup làm bằng chứng transaction mới nhất. Chế độ mặc định RECOMMEND_ONLY. BEST_EFFORT_ROUTE là opt-in LAB, có thể mất những lần ghi chưa backup và phát sinh split-brain nếu nút cũ vẫn ghi.
- **Rejoin:** controller loại node Primary cũ khỏi danh sách ứng viên cho tới khi đã restore và quản trị viên chọn lại. Node guard LAB chạy trên chính thiết bị cũ hạ các unit đã ARM khi nhận trạng thái standby hoặc không liên hệ được controller.

## 1. Cài đặt trên Vsmart đang có website demo: CHỈ SOURCE
Tải ZIP rồi dùng `scp -P 8022` chuyển tới Vsmart. Trong Termux:

```sh
mkdir -p ~/mhc-test-05c-route
unzip -q ~/MHC-Full-Installer-TEST-0.5.0C-ROUTE-RECOVERY.zip -d ~/mhc-test-05c-route
cd ~/mhc-test-05c-route/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
~/mhc-full auto-primary plan
~/mhc-full node-guard plan
```

Khi được hỏi, chỉ nhập `TEST_SOURCE_ONLY_UPGRADE` sau khi preflight đạt. Không chạy `node-guard arm`, auto watcher, Cloudflare BEST_EFFORT_ROUTE hoặc live switchover trên Vsmart/M51/X7b.

Giao diện Panel 9090 nâng cấp bằng `~/mhc-full hosting-panel plan`; nếu PASS và đủ điều kiện thì `hosting-panel apply`, lưu `ROLLBACK_ID`, sau đó chỉ `sv restart amh-panel`. Không cài sạch.

## 2. Controller độc lập — lựa chọn Primary
Chỉ dùng trên controller TEST thứ ba đã chạy `node cluster-init` và đã enroll 2 node LAB:

```sh
~/mhc-full primary-select status
~/mhc-full auto-primary init
~/mhc-full auto-primary enable --confirm=ENABLE_AUTO_ELECTION_RECOMMEND_ONLY
~/mhc-full auto-primary status
~/mhc-full auto-primary tick
```

Không chủ động đổi DNS mặc định. Muốn dùng BEST_EFFORT_ROUTE phải tự sửa `~/.config/mhc-full-installer/manual-primary/auto-config.json` (0600), khai báo `mode`, các cờ chấp nhận rủi ro và Cloudflare targets/token **chỉ LAB** theo `docs/AUTO-PRIMARY-0.5C-LAB.md`. Không gửi token vào ChatGPT.

Mỗi lần routing có journal trong `~/.config/mhc-full-installer/manual-primary/route-pending.json`. Nếu CNAME đã đổi mà controller crash, chạy `auto-primary status`, sau đó `auto-primary tick` đối chiếu lại live CNAME. **Không xóa journal bằng tay để ép bầu ứng viên mới**; nếu Cloudflare đang trỏ đích khác, STOP và kiểm tra thủ công.

## 3. Node guard LAB — hạ dịch vụ khi không còn là Primary
Điện thoại phải có Termux TEST mới, đã `node join` bằng SSH key và host key được ghim trước (StrictHostKeyChecking=yes), hoàn toàn độc lập với Vsmart đang chạy website.

Để kiểm tra nguồn mã mà không đổi trạng thái:

```sh
~/mhc-full node-guard plan
~/mhc-full node-guard status
```

Trên **LAB trống**, sau khi đã chuẩn bị backup và chấp nhận việc dừng dịch vụ, chọn tên service thực sự được quản lý bằng runit:

```sh
~/mhc-full node-guard arm mhc-lab-web,mhc-lab-tunnel --confirm=ARM_LAB_SERVICE_GUARD
~/mhc-full node-guard check
~/mhc-full node-guard service-install --confirm=INSTALL_LAB_ROLE_GUARD
sv status mhc-node-role-guard
```

Tên cho phép: `mhc-lab-*`, `nginx`, `php-fpm`, `mariadb`, `named-tunnel`, `mini-web`. Dừng một service thật có thể gây gián đoạn website và không thể hoàn tác chỉ bằng đổi Primary trong controller. **Không ARM trên thiết bị có site đăng ký hoặc production footprints**. Trước khi bắt đầu phục vụ, phải xác nhận watchdog đang chạy; bản LAB chưa ép được mọi đường ghi đi qua watchdog.

Trạng thái Standby, unverified, controller mất liên lạc hoặc nonce sai: `sv down` toàn bộ service đã ARM. Khi controller lại coi node là Primary: **không tự `sv up`**; quản trị viên phải restore/kiểm tra rồi chủ động khởi động lại. Đây là soft-fencing theo tiến trình, không bảo đảm khóa SQL privileged/direct access.

Nếu gặp sự cố `sv down` thất bại, lệnh trả lỗi, **không** báo đã khóa writer. Phải kiểm tra trạng thái runit/DB bằng tay.

## 4. Nghiệm thu cần làm trên 2 Android LAB
1. Xác nhận sao lưu/khôi phục và node phục vụ có dữ liệu hợp lệ; ít nhất 2 node có Tunnel riêng.
2. Controller độc lập nhận heartbeat, thấy Primary offline; bầu ứng viên standby còn sống.
3. Sau khi route đổi, ngắt/khởi động lại controller giữa lần ghi PATCH và lưu trạng thái; `tick` phải khôi phục mà không PATCH sang node thứ ba.
4. Khởi động node cũ, xác minh `node-guard check` hạ đúng service và không tự phục hồi write service.
5. Thử mất liên lạc controller, xác minh soft-fence từ chối ghi, đồng thời kiểm tra trực tiếp MariaDB/PHP/SSH để đánh giá đường ghi bỏ qua gate.
6. Nếu vẫn có đường ghi bỏ qua, chưa bật production Auto Primary.

## 5. Rủi ro chấp nhận khi bỏ replication bắt buộc
Chọn node snapshot mới nhất **không bảo đảm** không mất giao dịch phát sinh sau lần backup hoặc trong thời gian Primary mất mạng. Quay lại node cũ với dữ liệu cũ phải xử lý restore/đối chiếu trước khi sử dụng. Split-brain vẫn có thể xảy ra nếu node cũ tiếp tục phục vụ qua IP hoặc kênh khác, hoặc watchdog tắt.
