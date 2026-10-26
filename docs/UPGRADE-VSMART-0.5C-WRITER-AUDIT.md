# Hướng dẫn MHC TEST 0.5.0C-WRITER-AUDIT

## Nâng cấp Vsmart TEST (chỉ mã nguồn)

Trong Windows PowerShell, sau khi tải ZIP:

```powershell
scp -P 8022 "$env:USERPROFILE\Downloads\MHC-Full-Installer-TEST-0.5.0C-WRITER-AUDIT.zip" "u0_a180@192.168.100.27:~/"
```

Trong Termux Vsmart:

```bash
mkdir -p ~/mhc-test-05c-audit
unzip -q ~/MHC-Full-Installer-TEST-0.5.0C-WRITER-AUDIT.zip -d ~/mhc-test-05c-audit
cd ~/mhc-test-05c-audit/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Đọc đầy đủ preflight, chỉ nhập `TEST_SOURCE_ONLY_UPGRADE` nếu đạt. Source-only không ghi DB, website, .env, HA config, đổi route hay restart service. Sao lưu mã do installer thực hiện vào thư mục rollback được in ra.

```bash
~/mhc-full writer-audit plan
~/mhc-full writer-audit scan
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
```

Các lệnh `writer-audit plan|scan` chỉ quan sát, an toàn để chạy trên Vsmart có website `demo`. **Không** chạy `fence-probe capture`, `switchover-e2e run` hay DB LAB write gate trên Vsmart này.

Để cập nhật Panel gốc 9090: `~/mhc-full hosting-panel plan`; nếu PASS mới dùng `hosting-panel apply`, nhập confirmation do công cụ yêu cầu, lưu lại `ROLLBACK_ID`, và sau đó `sv restart amh-panel`. Không tự sửa mật khẩu hoặc thay Panel mới.

## Trạng thái thực tế

- Đã có công cụ kiểm kê 12 nhóm và báo cáo read-only.
- Chưa có hai Android LAB độc lập được kết nối/kiểm nghiệm trong môi trường tạo bản phát hành.
- `NOT_OBSERVED` **không** nghĩa là bị khóa. Cả 12 nhóm đều vẫn chưa có bằng chứng độc lập để cho phép chuyển quyền.
- M51/X7b production không bị chạm tới. Giữ HA/routing/Primary khóa.
