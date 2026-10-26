# Vsmart — chỉ nâng cấp mã MHC 0.5.0C-PHYSICAL

Vsmart hiện giữ website `demo`; vì vậy không được chạy keygen/capture trên máy này. Không cài sạch máy, không xóa website, không đổi MariaDB/PHP/nginx, không ARM HA.

```bash
mkdir -p ~/mhc-test-05c-physical
unzip -q ~/MHC-Full-Installer-TEST-0.5.0C-PHYSICAL.zip -d ~/mhc-test-05c-physical
cd ~/mhc-test-05c-physical/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Nếu preflight đạt, nhập `TEST_SOURCE_ONLY_UPGRADE`. Lưu đường dẫn rollback mà installer hiển thị. Sau đó:

```bash
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
~/mhc-full physical-accept plan
```

Lệnh `plan` không thay đổi hệ thống. Các lệnh thu chứng cứ chỉ dành cho hai Android LAB trống, không hosting. Nếu muốn cập nhật giao diện Panel 9090, dùng `hosting-panel plan` và chỉ `apply` nếu PASS theo quy trình backup/rollback riêng.
