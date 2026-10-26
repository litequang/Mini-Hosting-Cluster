# MHC TEST 0.5.0C-DRILL — Diễn tập chứng cứ GTID + file trên hai Android LAB thật

**Trạng thái:** Đã có công cụ; **chưa chạy trên hai Android thật**. Không kết luận `v0.5C DONE`, không promote primary, không ARM HA. Chương trình chỉ thu bằng chứng ký Ed25519 qua SSH, so sánh ba mốc và luôn `canSwitchPrimary:false`.

## 1. Phạm vi và điều kiện tiên quyết

Hai điện thoại Android Termux **LAB độc lập, trống, không phục vụ website**, không chứa Thờ Phượng Pro/WordPress hoặc dữ liệu production, không phải M51 `192.168.1.43`, X7b `192.168.1.35` hay Vsmart đang chạy `demo` `192.168.100.27`.

- TEST 0.5.0C-DRILL đã cài trên hai máy LAB; trên từng máy chạy `~/mhc-full physical-accept preflight`, `physical-accept keygen` theo `FIELD-ACCEPTANCE-0.5C.md`. Trên máy quản trị có khóa SSH riêng LAB, `known_hosts` được xác thực **ngoài băng**, JSON config quyền `0600`, outputRoot quyền `0700`, hai public-key fingerprint Ed25519 ghim độc lập.
- MariaDB 10.11 ở **hai instance LAB tách biệt**, cùng một database mẫu `mhc_lab_*`, replication GTID đã được seed chuẩn, source có binlog/GTID, replica read-only, duy nhất một kênh `SLAVE_POS`, cấu hình đã qua `replication lab-status`/`replica-observe`. Không mở socket DB công khai; việc nhập seed/GTID phải làm trước bằng runbook v0.4B.
- Fixture `~/mhc-physical-lab/share/fixture.txt` giống hệt ở hai node trước diễn tập, không chứa dữ liệu khách hàng. Kiểm `~/mhc-full physical-accept preflight` trên cả hai. Máy quản trị có Node.js 20+, OpenSSH và đồng hồ các máy đồng bộ (độ lệch nguồn/đích tối đa 90 giây ở một mốc).
- **Thời hạn:** bằng chứng tối đa 15 phút; toàn bộ ba lần thu + verify phải kết thúc khi mốc đầu chưa quá 15 phút. Nếu hết hạn, làm lại bằng challenge mới; tuyệt đối không chỉnh timestamp file.

## 2. Thu ba mốc bằng máy quản trị

Giải nén ZIP, đặt `field-config.json` như mẫu tại `docs/FIELD-ACCEPTANCE-0.5C.md`. Ba lượt phải dùng cùng một config, cùng pinned SSH host keys và public identity, nhưng challenge do phần mềm tạo **khác nhau**.

```bash
node MHC-Full-Installer/bin/field-recovery-drill.mjs plan
# Mốc 1: MariaDB source + replica đang đồng bộ, fixture giống nhau
node MHC-Full-Installer/bin/field-recovery-drill.mjs collect /path/field-config.json baseline
```

Sao chép **đường dẫn `runDir`** in ra thành `BASELINE_DIR`. `observationGatePassed` ở mốc baseline phải true.

## 3. Diễn tập gián đoạn CHỈ TRÊN REPLICA LAB

Kỹ thuật viên xác minh lại đây là MariaDB instance *dedicated LAB*, rồi trên **replica** chủ động dừng **chỉ replication IO thread** bằng quyền `REPLICATION SLAVE ADMIN` tương ứng, ví dụ trong phiên MariaDB LAB:

```sql
STOP REPLICA IO_THREAD;
SHOW REPLICA STATUS\G
```

Không dừng SSH của replica; coordinator phải vẫn thu được bằng chứng. `STOP REPLICA IO_THREAD` không phải fencing node primary và cũng không thay cho ngắt Wi-Fi. Câu lệnh chỉ là một cách diễn tập gián đoạn IO, không chứng minh ứng phó phân vùng mạng thực tế. Tham khảo [MariaDB STOP REPLICA](https://mariadb.com/docs/server/reference/sql-statements/replication-statements/stop-replica).

Sau khi xác nhận IO thread **đã dừng**, trên **source LAB** tạo giao dịch SQL riêng bằng công cụ đã bảo vệ:

```bash
~/mhc-full replication source-plan mhc_lab_demo
~/mhc-full replication source-probe mhc_lab_demo --confirm=WRITE_DEDICATED_GTID_LAB_PROBE
```

`mhc_lab_demo` chỉ là tên ví dụ, phải là database riêng `mhc_lab_*` thực đã lập và không chứa website/dữ liệu người dùng. Công cụ có thể từ chối nếu instance còn schema ngoài LAB, server GTID/ROW không đạt, hoặc có registry website. **Không dùng những lệnh này trên Vsmart/M51/X7b.**

Chỉ trên source LAB, thêm một dòng không nhạy cảm vào fixture mẫu (giữ file name và đường dẫn cố định):

```bash
printf 'file-delta-drill-one\n' >> ~/mhc-physical-lab/share/fixture.txt
```

Chưa chuyển file này sang replica ở thời điểm gián đoạn.

```bash
# Mốc 2: Replica IO phải DOWN, GTID source đã tăng, file source khác replica
node MHC-Full-Installer/bin/field-recovery-drill.mjs collect /path/field-config.json outage
```

Giữ `OUTAGE_DIR`. `observationGatePassed:false` ở mốc này **là dự kiến** (IO down / GTID và file lệch), không phải giấy phép bỏ qua lỗi của giai đoạn cuối.

## 4. Phục hồi riêng LAB, đối chiếu và kiểm chứng

Trên **replica LAB** theo đúng kết nối GTID đang có, cho phép receiver chạy lại:

```sql
START REPLICA IO_THREAD;
SHOW REPLICA STATUS\G
```

Đợi IO/SQL **cùng Running**, kiểm GTID replica bắt kịp source. Việc `START REPLICA` trả thành công **không chứng minh** receiver đã chạy hoặc catch-up, cần quan sát và đối chiếu. Tham khảo [MariaDB START REPLICA](https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/replication-statements/start-replica).

Đồng bộ *duy nhất fixture LAB* từ source sang replica bằng kênh truyền đã xác minh host key, hoặc bằng quy trình file delta offline đang dùng trong LAB; đối chiếu hash và dung lượng sau truyền. Không áp dụng vào web root đang chạy hoặc đường dẫn Sheet production. Sau đó:

```bash
node MHC-Full-Installer/bin/field-recovery-drill.mjs collect /path/field-config.json recovered
node MHC-Full-Installer/bin/field-recovery-drill.mjs verify /path/field-config.json BASELINE_DIR OUTAGE_DIR RECOVERED_DIR
```

Lưu ý: các từ `BASELINE_DIR`, `OUTAGE_DIR`, `RECOVERED_DIR` phải thay bằng **đường dẫn tuyệt đối** từ từng lệnh `collect`. Nếu `observedOutageCatchupAndFileDelta:true` và `blockerCount:0`, ba **bằng chứng quan sát có chữ ký** đạt; không phải bằng chứng toàn bộ SQL row parity, không chứng minh một snapshot DB/filesystem nguyên tử, không chứng minh fencing writer cũ và không cấp quyền đổi Cloudflare.

## 5. Các điều kiện khiến báo cáo FAIL-CLOSED

- Sai / thiếu khóa SSH, cấu hình chỉ tới cùng IP, sai fingerprint, cùng node ID, cùng boot, source/replica server_id trùng.
- Một challenge bị dùng lại, sai thứ tự timestamp, đổi node/boot/server ID giữa các mốc, bằng chứng quá 15 phút hoặc lệch đồng hồ trên 90 giây.
- Replica chưa chứng minh IO down tại `outage`, không có giao dịch mới trên source, replica bắt kịp quá sớm hoặc bị lùi GTID, IO/SQL chưa phục hồi tại `recovered`.
- File source không đổi trong outage, file replica đã đổi trong outage, file source đổi tiếp ngoài cửa sổ hoặc hai bên không giống nhau ở recovered.
- Ký Ed25519 không hợp lệ, hash receipt bị sửa, mode file rộng, thiếu proof hoặc khác với cấu hình pin.

**Ranh giới v0.5C:** báo cáo chỉ ghi `observedOutageCatchupAndFileDelta`. Vẫn thiếu hard fencing của MariaDB/PHP/filesystem/cron/SSH, write quiescence toàn diện, chứng cứ rollback/routing và diễn tập thực trên hai máy; cần nghiệm thu độc lập trước khi chuyển Primary.
