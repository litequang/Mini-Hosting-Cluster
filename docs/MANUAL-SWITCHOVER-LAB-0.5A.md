# MHC v0.5A — Manual Switchover Rehearsal (LAB only)

**Chưa có điều khiển chuyển Primary thật.** Tài liệu này mô tả bộ *diễn tập* an toàn về thứ tự và những chốt bắt buộc, được xây trên nguồn MHC TEST 0.4.0D. **Chỉ dùng với hai Android LAB độc lập, không chứa website/database cần bảo toàn.** Không chạy mô phỏng trên M51, X7b hoặc Vsmart đang có website `demo`.

## Mục tiêu và giới hạn

Một thao tác chuyển Primary thật đòi hỏi *tất cả đường ghi phải bị khóa chắc chắn*, xác minh source đã ngừng ghi, replica bắt kịp GTID và file sau khi ngừng ghi, lease độc quyền từ witness tin cậy, và routing không còn đi vào nguồn cũ. MariaDB `read_only` **không đủ** nếu còn người dùng có quyền đặc biệt hoặc còn đường ghi bỏ qua cơ chế khóa. Named Tunnel ngừng chạy cũng không đủ để chứng minh toàn bộ ứng dụng không thể ghi. v0.4D chưa nghiệm thu E2E trên hai Android thật; vì vậy v0.5A tuyệt đối **không** thực hiện các thao tác này.

Công cụ `mhc-full switchover` chỉ: (1) kiểm tra cấu trúc một *bảng khai LAB do người vận hành tự điền*, (2) đánh dấu thiếu điều kiện và dữ liệu quá 5 phút, (3) cho mô phỏng tuần tự 5 bước trong nhật ký cục bộ có hash-chain, (4) cho phép hủy diễn tập kể cả khi bảng khai đã hết hạn. Kể cả khi tất cả các trường là `true`, kết quả chỉ là **`simulatedGatePass`**, `canSwitchPrimary=false` và `authoritativeEvidence=false`.

## Chuẩn bị bảng khai trên hai node LAB chuyên dụng

Sau khi đã cài TEST 0.5.0A thành công, trên **máy LAB mới hoàn toàn không có website được đăng ký**:

```bash
mkdir -m 700 -p "$HOME/mhc-switchover-lab"
~/mhc-full switchover sample > "$HOME/mhc-switchover-lab/evidence.json"
chmod 600 "$HOME/mhc-switchover-lab/evidence.json"
~/mhc-full switchover plan
```

Lệnh `sample` tạo dữ liệu minh họa **chủ động bị đánh dấu thiếu điều kiện**. Không tự sửa tất cả trường thành `true` để suy ra server an toàn. Chỉ điền những gì đã nghiệm thu trên hai Android LAB, ghi chép bằng chứng bên ngoài và thời điểm đo. `gtid` / `filesSha256` là so sánh **chuỗi chính xác**; tương đương chuỗi không chứng minh gói file hoặc snapshot nguyên tử. Mẫu không lưu mật khẩu, endpoint, token hay secret.

Sau khi có bảng khai mới, trên LAB không có dịch vụ production và đủ điều kiện mô phỏng:

```bash
~/mhc-full switchover plan
~/mhc-full switchover start --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER
~/mhc-full switchover advance quiesce --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER
~/mhc-full switchover advance catchup --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER
~/mhc-full switchover advance lease --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER
~/mhc-full switchover advance route --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER
~/mhc-full switchover advance postcheck --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER
~/mhc-full switchover status
```

- `quiesce`: *mô phỏng* chốt ứng dụng/dịch vụ ngừng ghi và MariaDB read-only. Không gọi SQL.
- `catchup`: *mô phỏng* so GTID và checksum file sau chốt ghi. Không rsync.
- `lease`: *mô phỏng* bàn giao lease. Không liên lạc Cloudflare/witness.
- `route`: *mô phỏng* cập nhật tuyến. Không gọi Cloudflare API hay bật Tunnel.
- `postcheck`: mô phỏng kiểm tra sau chuyển. Không khởi động website.

Hủy nếu phát hiện thiếu hoặc sai bằng chứng:

```bash
~/mhc-full switchover abort --confirm=SIMULATE_WITHOUT_CHANGING_ANY_SERVER
```

Không có thao tác rollback server nào vì diễn tập không từng sửa DB, quyền ghi, ingress hoặc route. Nhật ký ở `~/mhc-switchover-lab/rehearsal.json` mode 0600; hash-chain chỉ phát hiện chỉnh sửa **thông thường**, không phải chứng thư số hay nguồn sự thật tin cậy. Nhật ký cố ý không cho ghi đè, nếu muốn diễn tập mới hãy lưu riêng thư mục LAB cũ trước, với kiểm tra của quản trị viên.

## Bắt buộc đạt trước v0.5B (manual switchover thật)

1. Hoàn thành acceptance v0.4 GTID và file trên **hai node Android LAB thật** cùng ít nhất một diễn tập mất Wi-Fi, restart Termux/runit, và phục hồi dữ liệu.
2. Một đường ghi duy nhất bắt buộc qua fencing/watchdog/ingress bất khả bypass; xét cả ứng dụng ghi SQL, direct socket, PHP-FPM và tiến trình lỗi thời. `read_only` và stop tunnel riêng lẻ không đủ.
3. Lease có term/epoch kiểm tra trên mọi write ingress, revoke có chứng cứ, witness fail-closed khi unreachable; không tin nhãn `primary` ở metadata.
4. Source dừng ghi xác minh, đợi replica GTID **và** file catch-up sau chốt ghi; checkpoint cùng mốc thời gian cần chứng minh thực tế, không dùng snapshot ngày để tuyên bố RPO=0.
5. Cơ chế switchover có nhật ký, rollback/fail-closed, route Cloudflare đã đối chiếu, user phê duyệt; không auto failback node cũ khi lên lại.
6. Nghiệm thu WordPress / Thờ Phượng Pro trên LAB (PHP-FPM, MariaDB, file uploads/Sheet/Sheet+) và phương án backup/restore ngoài cụm.

**Bản TEST 0.5.0A không đáp ứng các điều kiện để ARM HA, đổi Primary hoặc auto failover.**
