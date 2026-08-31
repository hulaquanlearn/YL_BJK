# TIA PLC 本机解析节点

面向 TIA Portal V16 / V17 的只读导出工具源码。它在工程师站调用 Siemens TIA Openness，将程序块导出为 XML，并生成网站可导入的 `.plcai` 结构化文件。

## 安全边界

- 只打开本地项目，绝不连接在线 PLC，也不下载、强制、启停或写入控制器。
- 建议始终选择项目工作副本。程序退出时不会调用 `Save()`。
- 检测到 Know-how 受保护块时，逐块询问是否输入密码。
- 密码通过 `SecureString` 传给 Siemens API，只存在于当前进程内存；不上传、不落盘、不写日志，也不写进 `.plcai`。
- 不解锁时仍导出 Siemens 允许公开的接口信息，并将条目标记为 `isProtected=true`。

## 构建

前提：目标电脑已安装对应版本 TIA Portal、TIA Openness，并已将当前 Windows 用户加入 `Siemens TIA Openness` 用户组（加入后重新登录 Windows）。

PowerShell：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\build-v16.ps1
# 或
.\build-v17.ps1
```

脚本会自动检查本机所有文件系统盘符下的 Siemens 标准安装目录，生成文件位于 `bin\V16` 或 `bin\V17`。如果 TIA 安装在自定义目录，可手动指定 PublicAPI：

```powershell
.\build-v17.ps1 -PublicApiPath '任意盘:\自定义目录\PublicAPI\V17'
```

V16 与 V17 应分别在安装对应版本 TIA Portal 的电脑上构建和运行。

## 使用

最简单的方式：双击本目录的 `Install-PlcAnalysisHelper.cmd`（中文别名也可），本机 V17 选 1，V16 虚拟机选 2。安装完成后：

1. 双击桌面的 `PLC解析助手 V17` 或 `PLC解析助手 V16`。
2. 选择 `.ap17` 或 `.ap16` 项目入口。
3. 选择输出目录，等待助手生成并自动定位 `.plcai` 文件。
4. 回到网页“程序智能分析 → 导入程序项目”，上传这个 `.plcai` 文件。

如果只有 `.zap16/.zap17` 归档，先用对应版本 TIA Portal 解包，再选择解包后的 `.ap16/.ap17`。网页不能直接解析原生 TIA 工程，因为 Siemens Openness 只能在装有匹配版本 TIA 的 Windows 电脑上工作。

```powershell
.\bin\V17\Zhitong.PlcExporter.exe "E:\PLCProjects\Floor1_V17\Floor1.ap17" "E:\PLCProjects\plc-export"
```

随后把输出目录中的 `.plcai` 文件上传至网站“智能工程中心 → 程序智能分析”。V16 项目必须使用 V16 构建版，V17 项目必须使用 V17 构建版；SimaticML XML 与工程版本相关，不能混用解析环境。

也可以安装带文件选择界面的桌面助手：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Install-PlcAnalysisHelper.ps1 -Version V17
```

安装后双击桌面的“PLC解析助手 V17”，依次选择项目入口和输出目录即可。V16 电脑执行同一命令并把版本改为 `V16`。启动器会根据 `.ap16/.ap17` 扩展名再次校验版本，避免用错解析环境。

## 网页上传 `.ap16/.ap17` 后自动解析

网站上传的入口文件只是任务指纹，完整项目仍保留在工程师电脑。解析节点按文件名和 SHA-256 在可用磁盘中定位原项目，只读打开并把 `.plcai` 结果回传网站。令牌应由管理员通过安全渠道配置，不写入脚本：

```powershell
$env:PLC_AGENT_TOKEN = '与服务器 PLC_AGENT_TOKEN 一致的令牌'
.\Start-ProgramAnalysisAgent.ps1 -Version V17 -ServerUrl 'https://czsdsg.cn'
```

虚拟机 V16 内运行同一脚本并把 `-Version` 改为 `V16`。正式长期运行建议为 V16、V17 各建立一个仅在用户登录后启动的计划任务。解析节点只主动访问 HTTPS，不需要开放 Windows 入站端口。

如果 Siemens API 提示 `Inconsistent blocks and PLC data types (UDT) cannot be exported`，请在对应版本 TIA Portal 中对 PLC 软件执行“重新编译全部”，处理编译错误并保存项目副本后再次导出。助手会记录单个异常块并继续导出其他正常块，但带警告的 `.plcai` 属于不完整解析包，不应当作为最终分析依据。

## 受保护块

助手检测到受保护块时会显示块名并询问：

```text
检测到受保护块 MotorControl，是否输入密码并导出完整代码？[y/N]
```

选择 `y` 后输入密码（屏幕不回显）。密码错误时只记录“授权失败”，不会记录密码；可以继续导出其他块。

## 文件与结构化数据保存

- 网页上传的原始 TIA/RAPID 文件保存在服务器 `PLC_UPLOAD_DIR` 指定目录，使用随机文件名避免重名和路径注入。
- MySQL 保存项目索引、原始文件名、随机文件名、SHA-256、解析条目、逻辑树、设备/网络元数据和分析记录。
- TIA 版本、CPU、设备、接口和网络信息由解析节点从硬件组态读取，不要求用户手填。
- ABB 控制器、RobotWare、模块、例程和 I/O 信息从 RAPID/SYS/CFG 文件自动识别；源文件未提供的字段保持为空，不猜测。
