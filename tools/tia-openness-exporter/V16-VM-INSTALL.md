# V16 虚拟机安装

1. 在安装了 TIA Portal V16 的 Windows 虚拟机内打开本目录。
2. 确认当前 Windows 用户属于 `Siemens TIA Openness` 本地用户组，并注销后重新登录。
3. 双击 `Install-V16-Helper.cmd`。脚本会自动定位 V16 PublicAPI、构建解析器并创建桌面快捷方式。
4. 以后双击桌面的 `PLC解析助手 V16`，选择 `.ap16` 项目入口和输出目录，即可生成 `.plcai`。

V16 解析器只能读取 V16 项目；V17 项目请使用宿主机的 V17 解析助手。服务器不会读取本机磁盘，生成后的 `.plcai` 需要由用户主动上传到网页。
