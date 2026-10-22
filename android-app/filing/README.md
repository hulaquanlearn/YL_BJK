# 腾讯云 App 备案包信息

本目录仅包含公开的签名证书及备案字段，不含私钥和密码。

在“安卓平台 → 添加包信息”中填写：

- App 包名：复制 `app-package-name.txt`。
- 公钥：复制 `app-public-key.txt` 的完整 RSA 模数十六进制字符串，不加空格、冒号、PEM 头尾或换行。
- 签名 MD5 值：复制 `app-signature-md5.txt`，是签名证书的 32 位十六进制指纹，不是 APK 文件的 MD5。
- 汇总复制文件：`APP_FILING_INFO.txt`。

公钥格式参照 [腾讯云填写规范](https://cloud.tencent.com/document/product/243/97789) 和 [App 特征信息获取说明](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/fill-in-app-feature-information)。请以腾讯云表单的实际校验和审核要求为准。

对应的 release 签名验证包在 `../app/build/outputs/apk/release/app-release.apk`；该包仅用于确认当前代码、包名及正式证书匹配，不表示所有功能已完成生产验收。使用该证书的后续正式版本保持相同包名和签名。

## 私有签名资料

本机私有目录：`C:\Users\Lenovo\.android\workbench-release-signing\`。

- `digital-workbench-release.p12`：发布私钥与证书。
- `signing.local.json`：构建读取的签名配置，含密码，不得提交 Git、上传备案或公开分享。
- `BACKUP-IMPORTANT.txt`：备份说明。

请将私有目录整体备份到受保护的位置；丢失后不能靠公钥或证书重新生成同一私钥。该目录已限制为当前 Windows 用户及 SYSTEM 访问。不要为了重新打包或升级而生成替代密钥。

当前 release 密钥与此前 debug 密钥不同，因此 release APK 不能直接覆盖已装的旧 debug APK。切换正式签名包前应保存未提交的本地内容；如需卸载测试版，将清除手机本地配置与登录状态，不涉及服务器上的业务数据库。

## 后续构建

在仓库根目录运行 `./android-app/build-release.ps1 -SdkPath 'D:\Android\android-sdk'`。脚本复用私有目录中的现有证书，不会重新生成密钥，并重新导出本目录公开字段。首次新环境请先恢复签名资料并准备 SDK/JDK、依赖；该脚本默认离线构建。
