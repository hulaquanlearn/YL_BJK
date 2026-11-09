# ABB 整改上线与 App 同步 · 2026-11-04

V1.9.10。用户最新要求“问题处理完后同步服务器和app”，取代此前暂不部署。本轮更新已完成；最终服务器完整性核验时间为北京时间 18:46。

## 更新与验证

- 网页 1047 份成品整目录替换，API 仅更新 `robot-motion.js`、`robot-sim.js`、`routes/robot-program.js`。保留已上线的中控密码功能及其他业务。
- 网页 594/594、机器人 API 最终 50/50，冻结源码生产构建通过。模型装配、按住/释放、实时速度、使能整块高亮、拆装顺序、锚点与程序会话包含回归检查。
- 服务器首次激活完成 3767 项文件/HTTP/权限断言，含 10 类现有账号、20 次带登录模型响应哈希校验和 App 资产 Cookie。未登录模型资源应返回401；没有放开资源权限。
- 公网实际备份检出 XOR、NOT 优先级和 `CASE 1,2` 解析缺失；Codex 追加后端及3项回归。服务器现存两套备份均编译通过。公网实际例程 `bujin_DaoKe` 初始化和单步接口200；未写入程序状态或触发 AI。
- 追加修复后再次核对全部1050份部署文件及423份受保护文件，共1473项文件哈希。最终 `robot-sim.js` SHA256：`c79739d881a06cbdc194723982c321414c05d52809d678be7a528079faf9b341`。
- 公网 `/portal`、`/agv-vehicles?family=abb`、原厂产品PDF入口正常，API健康与数据库连接正常。只重启本项目 API、重载本项目网页；其他项目进程保持。
- 生产角色检查使用5分钟临时会话，仅删除此次产生的会话哈希。私有配置、上传、程序库、`.private`、既有APK/更新清单哈希保持；不导入本地私有ZIP。

## App 生效与界面检查

现有 Android App 的 MainActivity 连接 `https://czsdsg.cn`，通过 `/portal` 导航业务网页。本次更新的是 App 共用页面和API，重新进入“设备模型展示 → ABB机器人”即可生效，无需安装新APK。没有原生源码改动、微信上传或商店发布。

本地浏览器已观察分阶段拆解、一二轴分离、恢复正面、整块背部使能变绿、PDF第187页跳转。相同600ms点动在100%/25%速度时，J2分别变化2.353°/0.549°，释放后角度保持。最终本地页面再次加载；临时浏览器标签随后失去绑定，因此未追加公网视觉复验。原生模拟器/真机尚未验收。

## 资料与边界

黑色编号键为1–6轴抱闸释放按钮，SMB电池位于相邻盖板后。入口直接打开原厂产品手册第187页；原CAD未提供的电池内部件没有虚构几何。部件绿色表示选中，深色按钮/护罩恢复各自原色。

RAPID追加语法依据 [ABB RW6 Kernel](https://library.e.abb.com/public/8f987f25dd9f4ed09f406624444a671e/3HAC050946%20TRM%20RAPID%20Kernel%20RW%206-en.pdf) 的表达式与TEST规则，以及 [RAPID指令参考TEST](https://library.e.abb.com/public/b227fcd260204c4dbeb8a58f8002fe64/Rapid_instructions.pdf)。OR/XOR同级左结合；AND先于NOT；CASE支持多个值且只执行首个匹配分支。

完整上甑工艺仍需现场GI料位、I/O初值及设备绑定核验。离线仿真不等于完整IRC5控制器：TRAP、安全链、转角区、触发位置时序、部分标记指令和现场机械运行未验收。见 [原厂复核](ABB_OFFICIAL_REVIEW_20261104.md) 与 [联调记录](ABB_LOCAL_INTEGRATION_20261104.md)。

## 留档与恢复

- 最终现场回滚目录：`/opt/spare-parts/rollback/abb-20261104-r2`。`web-before` 为更新前完整网页；`api-before/`、`api-before.json` 为更新前API存在清单。全轮回滚应使用这组原始备份。
- XOR与多值CASE追加前的单文件备份分别在 `api-xor-before/`、`api-case-before/`，只用于该追加阶段恢复。`final-activation.json` 为最终文件验收回执。
- 恢复时核对目录及PM2归属，将当前网页和本轮新增API移入项目私有回收目录，再恢复 `web-before` 和原有API文件；重启 `spare-parts-api`、重载 `spare-parts-web` 并验健康。保留数据库、上传、`.env`、`.private` 和 App更新目录。
- 首次部署因未带登录检查模型资源触发401，已自动回滚。其失败网页/API和暂存已移至 `/opt/spare-parts/recycle-bin/abb-20261104-r1`；成功轮暂存和编译候选已移至对应 `r2` 回收目录。未永久删除。
- 本地证据：`.local/abb-device-20261104/deployment-web-tests.log`、`final-api-case-tests.log`、`snapshot-build.log`、`final-process-case.log`、`activation.json`、`production-final.json`、`final-activation.json`。最初暂存归档不含后续两次API追加，不能当最终完整发布包交付。

未生成新整站部署包、未升级版本、未提交或推送Git。
