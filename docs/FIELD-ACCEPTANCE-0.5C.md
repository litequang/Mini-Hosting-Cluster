# FIELD 0.5C — Thu bằng chứng hai Android LAB qua SSH có pin độc lập

## Phạm vi

Tác vụ từ máy quản trị thu **quan sát có chữ ký** trên hai thiết bị Termux LAB sạch. Đây không phải executor switchover. Trạng thái `observationGatePassed=true` không phải quyền chuyển Primary và không chứng minh fencing.

**KHÔNG DÙNG** M51 (192.168.1.43), X7b (192.168.1.35), Vsmart `demo` (192.168.100.27), bất kỳ máy chạy website/DB production, hoặc môi trường HA. Code loại trừ trực tiếp ba IP trên và chính node `physical-accept preflight` từ chối mọi dấu vết hosting/HA.

## Chuẩn bị mỗi Android LAB

Máy phải là Termux aarch64, cài MHC TEST 0.5.0C-FIELD, MariaDB GTID LAB đã thiết lập đúng seed với quyền SQL riêng. GTID thực và đồng bộ 2 Android chưa được bộ cài tự tạo. Mỗi máy tạo khóa của chính nó, dữ liệu fixture không chứa dữ liệu người dùng:

```sh
~/mhc-full physical-accept keygen --confirm=CREATE_DISPOSABLE_LAB_IDENTITY
mkdir -p ~/mhc-physical-lab/share
chmod 700 ~/mhc-physical-lab/share
printf 'mhc-field-fixture-v1\n' > ~/mhc-physical-lab/share/fixture.txt
~/mhc-full physical-accept preflight
```

Lấy fingerprint SHA-256 từ chính màn hình mỗi máy bằng kênh *độc lập* và chép vào cấu hình quản trị. Không sao chép private-key.pem. Đối chiếu `server_id` DB riêng, replica read_only, IO/SQL chạy; cặp node phải có dữ liệu thử giống nhau. Nếu preflight STOP, không bỏ qua guard.

## Trên máy quản trị (Linux/macOS/Windows có Node.js 20+ và OpenSSH)

Trước hết, ghim **SSH host key** từng máy bằng kết quả đã xác minh ngoài băng (không nhận tự động bằng `StrictHostKeyChecking=accept-new`). Tạo khóa SSH chỉ dùng cho LAB và file known_hosts, không dùng khóa production. Cần chuẩn bị thư mục kết quả mới, quyền 0700; file JSON config và khóa SSH quyền 0600 trên hệ POSIX.

Cấu hình mẫu (thay các giá trị minh họa, không dùng IP trùng máy đang chạy):

```json
{
  "schema": 1,
  "scope": "MHC_PHYSICAL_EVIDENCE_LAB_ONLY_NO_HA",
  "outputRoot": "/home/operator/mhc-field-results",
  "ssh": {
    "privateKey": "/home/operator/.ssh/mhc_field_ed25519",
    "knownHosts": "/home/operator/.ssh/mhc_field_known_hosts"
  },
  "nodes": [
    {"role":"source","host":"192.168.100.61","port":8022,"user":"u0_a180","pinnedIdentityFingerprint":"64_HEX_CUA_NODE_SOURCE"},
    {"role":"replica","host":"192.168.100.62","port":8022,"user":"u0_a181","pinnedIdentityFingerprint":"64_HEX_CUA_NODE_REPLICA"}
  ]
}
```

Trên Windows dùng đường dẫn tuyệt đối như `C:\\Users\\...` trong JSON và tạo thư mục kết quả từ Explorer/PowerShell. Ví dụ IP và user chỉ minh họa, lấy tài khoản Termux thật khi cài LAB mới. Bản phát hành **không chứa token/password**.

Sau khi giải nén ZIP:

```sh
node MHC-Full-Installer/bin/field-lab-coordinator.mjs plan
node MHC-Full-Installer/bin/field-lab-coordinator.mjs collect /path/field-config.json
node MHC-Full-Installer/bin/field-lab-coordinator.mjs verify /path/field-config.json /path/field-RESULT_DIR
```

Lệnh collect sẽ gọi `preflight` trên **cả hai node trước**, nếu hai fingerprint đã pin khớp và IP hợp lệ mới thực hiện `capture` với challenge dùng chung. Kết quả gồm 2 identity công khai, 2 bản chứng cứ có chữ ký và `result.json` tại thư mục kết quả riêng. Nếu phát hiện dữ liệu không khớp, chương trình xuất blocker, kết thúc exit code 1; **không có bất kỳ chuyển quyền hay mở khóa DB nào**. Nếu quá 15 phút kể từ lúc đo, hãy thu lại challenge mới thay vì chỉnh đồng hồ hoặc tái sử dụng chứng cứ.

## Điều kiện chưa đủ cho v0.5C

- Chưa thực hiện giao dịch SQL A/B thật trước/trong mất kết nối trên hai node và xác nhận replica bắt kịp.
- Chưa có fencing ngoài băng của writer cũ tại MariaDB socket, PHP, cron, SSH shell, filesystem.
- Chưa triển khai/kiểm thử witness Cloudflare thật và routing trên tên miền LAB.
- Không có bằng chứng snapshot MariaDB và Sheet/files nguyên tử. Không chuyển Primary cho đến khi mọi điều kiện độc lập đạt.
