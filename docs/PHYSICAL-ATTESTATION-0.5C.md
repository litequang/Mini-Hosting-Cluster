# MHC TEST 0.5.0C-PHYSICAL — chứng cứ có chữ ký từ hai Android LAB

## Tại sao có bước này?
Bản 0.5C-INTEGRATION có hai node **giả lập trong cùng tiến trình**. Bản PHYSICAL thêm bộ thu bằng chứng **thật từ từng thiết bị Termux** và bộ xác minh offline với Ed25519, nonce dùng chung và public key đã được người vận hành đối chiếu độc lập. Bản này **không tự tạo MariaDB GTID replication, không thực hiện fence, không đổi Primary/DNS, không cho phép HA**.

## Yêu cầu trước khi chạy
- **Hai Android LAB độc lập, xóa sạch/không hosting**, không phải M51/X7b production, **không phải Vsmart đang có website `demo`**. Mỗi node đã cài MHC, hai `server_id` MariaDB riêng, định cấu hình replication GTID qua quy trình trước đó, đã phục hồi seed LAB hợp lệ và có một thư mục thử nghiệm nhỏ ở `~/mhc-physical-lab/share` với **cùng nội dung**. Các dữ liệu thật Sheet/Sheet+ và WordPress không được đưa vào thư mục này.
- Cả hai node có `mariadb` local, có thể truy vấn chỉ đọc bằng Unix socket; `mariadb` mà công cụ gọi sử dụng `--no-defaults` và không đọc password từ môi trường. Nếu không lấy được GTID thì STOP.
- Trên mỗi node kiểm tra `~/mhc-full doctor`, `~/mhc-full replication lab-status`. Chỉ dùng `physical-accept` ở node LAB sạch, không được xóa marker/guard để vượt qua điều kiện bảo vệ.
- Khóa Ed25519 riêng sinh trên từng node; **KHÔNG sao chép `private-key.pem`**. File `identity-public.json` phải được xác minh fingerprint bằng kênh khác với kênh dùng để nhận file chứng cứ, ví dụ so trực tiếp trên màn hình từng thiết bị rồi ghim vào biên bản quản trị.

## Các lệnh

**Trên mỗi node LAB**, kiểm tra trạng thái, khởi tạo khóa và tạo file thử theo đúng nội dung như nhau:

```bash
~/mhc-full physical-accept plan
~/mhc-full physical-accept keygen --confirm=CREATE_DISPOSABLE_LAB_IDENTITY
mkdir -p ~/mhc-physical-lab/share
chmod 700 ~/mhc-physical-lab/share
printf 'mhc-two-node-fixture-v1\n' > ~/mhc-physical-lab/share/fixture.txt
```

**Trên máy quản trị**, tạo một challenge mới bằng cùng công cụ (hoặc chạy trên một LAB):

```bash
~/mhc-full physical-accept challenge
```

Sao chép **chính xác challenge 48 ký tự** sang hai node, thu bằng chứng ở từng máy trong vòng 15 phút:

```bash
# Node SOURCE LAB
~/mhc-full physical-accept capture source CHALLENGE_48_HEX

# Node REPLICA LAB
~/mhc-full physical-accept capture replica CHALLENGE_48_HEX
```

Mỗi lần `capture` lưu file chỉ đọc theo tên trong `~/mhc-physical-lab` với JSON có chữ ký số. Chuyển **source JSON, replica JSON và 2 identity-public.json** về một máy verifier cách ly. Truyền qua SSH có host key đã xác minh; đừng chỉ tin fingerprint do chính gói mới chuyển khai báo. **Không chuyển bất kỳ mật khẩu hay private key**.

Có thể giải nén ZIP bản phát hành trên máy verifier có Node.js và chạy:

```bash
node MHC-Full-Installer/bin/physical-lab-attest.mjs verify \
  /path/source.json /path/replica.json \
  /path/source-public.json /path/replica-public.json \
  CHALLENGE_48_HEX SOURCE_PINNED_SHA256 REPLICA_PINNED_SHA256
```

Hai fingerprint phải được ghi nhận từ bước đối chiếu **ngoài kênh gửi file**. Nếu có blocker, CLI kết thúc exit code 1. Thành công của `observationGatePassed` chỉ cho biết hai nguồn chứng cứ đã ký, mới quan sát và dữ liệu file mẫu/GTID khớp theo những điều kiện có thể đo. Dù PASS cũng luôn `canSwitchPrimary:false`, `canArmHA:false`.

## Nội dung đo
- Cặp danh tính khóa Ed25519 khác nhau, challenge giống nhau, chữ ký Ed25519 hợp lệ, thời điểm đo không quá 15 phút so với đồng hồ máy verifier. Máy phải đồng bộ đồng hồ đúng.
- `boot_id` Linux được hash để so một phiên boot; nếu Android không cho phép đọc, chốt **không xác minh được hai phiên boot khác nhau**, không đoán thiết bị.
- MariaDB thực: `server_id`, `read_only`, `gtid_binlog_pos`, `gtid_slave_pos`, tình trạng IO/SQL/GTID channel cục bộ. Không lấy SQL password, host replication hay dữ liệu bảng nghiệp vụ.
- SHA-256 nội dung/thứ tự và đường dẫn **tương đối** của cây fixture, chỉ trả về aggregate; chặn symlink và file bị đổi khi quét. File fixture không được ghi đồng thời lúc quét.
- Không báo thực hiện ghi giao dịch A/B khi mất mạng; không chứng minh db-data equality, atomic DB/file snapshot, hard fencing, witness sống thực hoặc Cloudflare routing.

## Những gì còn bắt buộc trước v0.5C thực
1. Chạy GTID acceptance với hai giao dịch thực, trong đó giao dịch B phát sinh **khi replica đã mất kết nối**, lưu biên bản không thể ngụy tạo bởi chính node nguồn.
2. Xác minh source đã dừng tất cả đường ghi; fence nguồn một cách độc lập và thử bypass qua MariaDB socket/admin, PHP, cron, shell, uploads, router — không thể chỉ kiểm tra `read_only`.
3. Có Cloudflare witness LAB thực với lease bền vững, diễn tập cô lập mạng và phê duyệt quyền chuyển vai trò; chuyển routing chỉ trong hostname LAB riêng.
4. Diễn tập backup, restore và rollback trong trạng thái hai node thật, không có đồng ghi. Không có đầy đủ các bằng chứng trên thì **KHÔNG phát triển executor production hoặc bật HA**.
