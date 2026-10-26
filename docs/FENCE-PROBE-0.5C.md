# TEST 0.5.0C-FENCE-PROBE — Kiểm tra đường ghi HTTP LAB thật

**Phạm vi: Chỉ hai Android Termux LAB trống, hoàn toàn cách ly. Chưa được phép chuyển Primary.**

Mục đích là kiểm chứng, trên **hai máy riêng biệt**, khả năng chặn hoặc cho phép yêu cầu ghi trên **DUY NHẤT endpoint canary HTTP `127.0.0.1:19096/v1/lab/canary`**. Công cụ không thay đổi cấu hình Cloudflare, không thay MariaDB primary, không tắt kết nối mạng hoặc tự cấp lease. Kết quả PASS vẫn **KHÔNG** chứng minh hard fencing, trạng thái đồng thời tức thời, an toàn database hoặc các đường ghi PHP/Nginx/SSH.

## Điều kiện tiên quyết

1. Có hai điện thoại Android LAB độc lập, không phải M51, X7b hay Vsmart đang có website `demo`. Chỉ bản cài hoàn tất trên Termux ARM64, không có đăng ký website, cấu hình HA hoặc production.
2. LAB A và B đã cài bản FENCE-PROBE, có `~/mhc-full physical-accept preflight`, mỗi máy tạo khóa Ed25519 bằng `physical-accept keygen --confirm=CREATE_DISPOSABLE_LAB_IDENTITY`; ghi lại fingerprint từng máy **ngoài băng**. Không sao chép khóa riêng giữa hai máy.
3. Trên cả hai LAB đã khởi tạo `~/mhc-full write-gate init` và `~/mhc-full http-gate init --confirm=ISOLATED_HTTP_WRITE_GATE_LAB_ONLY`, đã cấu hình witness LAB **độc lập** theo runbook v0.5B2, và khởi động HTTP gateway `~/mhc-full http-gate serve --confirm=ISOLATED_HTTP_WRITE_GATE_LAB_ONLY` trong Termux khác (hoặc dịch vụ LAB riêng). Không mở port ra LAN/WAN.
4. Chỉ chạy một lần diễn tập khi có người vận hành tại chỗ. Canaries là file thử nghiệm riêng trong `~/mhc-writegate-lab/`, không phải dữ liệu thật. Có giới hạn quota: dọn LAB qua runbook được kiểm tra thay vì tự xóa file để vượt giới hạn.
5. Máy quản trị và hai điện thoại cần đồng hồ tương đối đồng bộ. Ba phép thử và verify phải hoàn tất trong 12 phút, nếu quá hạn tạo challenge mới.

## Trình tự LAB có thao tác có chủ đích

Tạo **một** challenge 48 ký tự hex trên máy quản trị: `openssl rand -hex 24`. Đặt biến `CHALLENGE` giống nhau trên hai node.

**A — node cũ phải từ chối:** Người vận hành xác nhận witness không còn cấp quyền ghi LAB cho A trong khi dịch vụ HTTP canary A **vẫn phản hồi trên loopback**. Trên Android A:

```bash
~/mhc-full fence-probe capture source old-denied "$CHALLENGE" --confirm=DISPOSABLE_LAB_CANARY_PROBE
```

Phải có HTTP 503 với `WITNESS_OR_LAB_WRITE_DENIED`. **Không** chấp nhận HTTP 401, 404, timeout hoặc process chết như chứng cứ lease bị từ chối.

**B — node mới được cho phép:** Người vận hành đã cấu hình quyền witness LAB cho B bằng quy trình an toàn ngoài công cụ này. Trên Android B:

```bash
~/mhc-full fence-probe capture replica new-allowed "$CHALLENGE" --confirm=DISPOSABLE_LAB_CANARY_PROBE
```

Cần HTTP 201, checksum đúng, ghi một file canary mới trong LAB B. Nếu B chưa có lease hợp lệ, phép thử **phải báo FAILED**; không bỏ qua.

**B — mất quyền witness, phải từ chối:** Chỉ trên witness và B LAB cách ly, người vận hành mô phỏng không còn xác minh được lease của B; HTTP gateway phải tiếp tục phản hồi. Trên Android B:

```bash
~/mhc-full fence-probe capture replica witness-denied "$CHALLENGE" --confirm=DISPOSABLE_LAB_CANARY_PROBE
```

Cần HTTP 503. Lưu ý 503 cũng có thể biểu thị lỗi ghi LAB khác; chỉ có thể kết luận endpoint từ chối, **không** chứng minh nguyên nhân là mất witness.

## Lấy chứng cứ và verify trên máy quản trị

Chỉ sao chép 3 file `fence-*.json` tương ứng và hai file `identity-public.json`; KHÔNG sao chép `private-key.pem`, `http-token` hoặc `node-token`. Dùng thư mục quản trị riêng quyền 0700, file JSON quyền 0600. Ghim fingerprint của hai public key độc lập trước khi verify.

```bash
node MHC-Full-Installer/bin/lab-fence-probe.mjs verify \
  /safe/A-old.json /safe/B-new.json /safe/B-witness-denied.json \
  /safe/A-identity-public.json /safe/B-identity-public.json \
  "$CHALLENGE" "$SOURCE_PIN_SHA256" "$REPLICA_PIN_SHA256"
```

Kết luận `signedLabCanarySequenceObserved: true` chỉ nghĩa là **ba biên nhận có chữ ký hợp lệ và trạng thái endpoint canary theo thứ tự**. Không đồng nghĩa đã chuyển Primary hay không thể split-brain. File chữ ký là bằng chứng từ chủ sở hữu khóa; không xác minh bản cứng Android, không chứng minh all-write-path fencing.

## Blockers bắt buộc trước v0.5C thực

- Nghiệm thu GTID + delta file thực tế qua `field-drill` trên hai Android, xác thực bản ghi SQL hoặc checksum logic dữ liệu chứ không chỉ tọa độ GTID.
- Fencing *độc lập* tất cả đường ghi của old primary: PHP, MariaDB, file, shell/admin, job, backup/restore, queue, deployment và cả route; loại bỏ khe hở giữa kiểm lease và commit DB.
- Có witness/term thật, cấu hình bền vững và cơ chế rollback phù hợp; kiểm tra lỗi phân vùng mạng cùng tương tác Cloudflare routing LAB.
- Trước khi đạt các điều kiện trên: `canSwitchPrimary=false`, `canArmHA=false`.
