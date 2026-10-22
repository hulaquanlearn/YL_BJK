# 正式签名资料核验（2026-10-16）

- 包名：cn.digitalworkbench.mobile
- 当前代码版本：1.9.10-android-preview.2；签名确认包，不代表功能已完成生产验收。
- assembleRelease、lintRelease 通过；Lint 0 errors、1 warning（业务 WebView 必需的 JavaScript）。
- 发布证书：RSA 2048 / SHA256withRSA，有效期 10000 天；签名采用独立发布密钥，未沿用 debug 证书。
- 公钥：导出证书 RSA 模数，512 位十六进制字符，无空格、冒号或换行。
- 签名证书 MD5：08d7936aea83c6be7bad3b90d0255dec
- 签名证书 SHA256：9791ff38e629e11c29065d4dbf1fab15763a42b36da7937c71748f90c1ad4cc8
- apksigner 验证 APK 签名成功，APK 证书 SHA256 与导出的 DER 证书一致；因此三项备案字段对应同一签名包。
- aapt 检查包名一致，release 无 debuggable 属性、无 PreviewActivity，明文 HTTP 禁用。
- APK 不包含私钥、keystore 或签名密码配置。
- 私钥与签名配置在用户 .android/workbench-release-signing 私有目录，当前用户及 SYSTEM 可访问，未进入 Git。
- 发布 APK SHA256：
66dd3574ac5254855da51448c5725927bca33c029930da0891f981eb8b1de900
- 发布 APK 大小：
28499
 字节。
- 未提交备案申请、未上架、未部署服务器、未提交或推送 Git；未将签名包当作完整真机业务验收。
