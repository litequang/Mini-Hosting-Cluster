# Nâng cấp mã TEST 0.5.0C-FIELD trên Vsmart

Vsmart đang có website `demo`. Chỉ nâng cấp mã đã test, không được chạy các lệnh thu thực nghiệm, không nhập seed GTID, không cài sạch, không đổi cấu hình dịch vụ, không restart MariaDB.

Trên Windows, tải ZIP, chuyển bằng SCP (`-P 8022`) vào Termux; trên Vsmart:

```sh
mkdir -p ~/mhc-test-05c-field
unzip -q ~/MHC-Full-Installer-TEST-0.5.0C-FIELD.zip -d ~/mhc-test-05c-field
cd ~/mhc-test-05c-field/MHC-Full-Installer
bash bin/self-test.sh
bash install.sh --upgrade
```

Nhập `TEST_SOURCE_ONLY_UPGRADE` chỉ khi preflight và self-test PASS. Lưu bản rollback do installer tạo. Sau đó:

```sh
~/mhc-full doctor
~/mhc-full serve probe-static demo local.test
~/mhc-full physical-accept plan
~/mhc-full field-accept plan
```

Nếu Panel gốc 9090 cần nâng cấp giao diện, dùng `hosting-panel plan`, kiểm tra PASS, `apply`, lưu ROLLBACK_ID và chỉ restart `amh-panel`; không sử dụng Panel 19090 để thay thế. Vsmart không dùng làm source/replica cho field collection khi còn website demo.
