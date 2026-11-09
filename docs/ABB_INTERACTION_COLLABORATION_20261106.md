# ABB 联合排查 · 2026-11-06

用户本轮授权联合 DSH。项目 D:\wx_xiangm\xiangmu，版本 V1.9.10。

Codex 已在修改：src/components/agv/AbbRobotViewer.vue、AbbRobotGuide.vue、src/utils/abb-service-panel.mjs，新增 src/utils/model-click-pan.mjs 和对应 test/model-click-pan.test.mjs（路径均相对 spare-parts-web-release）。负责右键单击平移、电池仓资料入口移除、按甑合盖修复、测试和部署。DSH 请勿写上述文件。

DSH 初始任务为只读独立排查锅内运动速度和合盖拦截。优先查看 src/utils/abb-program-motion.mjs、abb-program-session.mjs、server/src/robot-sim.js 与 robot-cell-sim.js、真实备份 speeddata/VelSet。请将原因、证据、拟改文件、测试和建议记录于 docs/ABB_DSH_FINDINGS_20261106.md，再等 Codex 分配文件；不得自行部署或改共享文件。不要用倍率补偿根因。

目前尚未收到 DSH 结论；发消息不代表交付完成。

## Codex独立速度采样（13:07）

前三项交互已上线。隔离离线真实酿酒备份前350段采样：927次解释器请求，平均请求354326B、响应355812B；锅内336段预定累计17.815秒，中位单段0.04062秒，解释器CPU累计2307ms。未含网络。证据 .local/abb-interactions-20261106/speed-diagnostic.json。怀疑频繁传大状态及逐段往返未能被短运动预取掩盖，尚未宣称已修复。请DSH将独立结论写 docs/ABB_DSH_FINDINGS_20261106.md，先只读，不改共享文件。

## Codex速度优化文件登记

拟修改 spare-parts-web-release/src/api/index.js，新增 src/utils/robot-simulation-transfer.mjs 及对应测试，压缩大请求并保留取消/登录会话边界。拟验证 server/src/robot-sim.js 在已完成运动后回收过期求解缓存的等价性；尚不覆盖DSH任何在写文件，DSH仍只读排查。

用户追加：示教器六轴角度条下移，取消无实际交互的默认J1高亮。Codex修改 spare-parts-web-release/src/components/agv/AbbPendantControl.vue；DSH请勿写此文件。

## DSH结论已接收与集成方案

13:15收到 docs/ABB_DSH_FINDINGS_20261106.md。已独立复现HTTP往返与短等待链瓶颈，源速度无误。为彻底移除逐段RTT且不复制两套解释器/运动学，Codex改用浏览器独立Worker直接打包同一份server纯数据解释器和web运动学源码；现有API保留为Worker不可用时的降级路径。不会把机器人控制接到现场。涉及新增 web/tools/abb-program-worker.mjs、src/utils/abb-program-worker.mjs、abb-local-program.mjs，修改vite.config.js和AbbProgramControl.vue；server/src/robot-code.js抽共享注释处理，robot-backup.js/robot-motion.js/robot-sim.js改用同一纯函数，sim保留已验证的缓存回收。DSH本轮仍只读；无共享源码由DSH改写。

## 最终交付

已采纳并独立核验DSH结论，最终交付 docs/ABB_SPEED_PENDANT_DELIVERY_20261106.md，13:26已上线。Worker与API路径共用源码，120mm逐字段等价，40mm浏览器正常倍率完整收尾。692网页/452 API通过。DSH未修改共享源码，未把其网络模型当成浏览器计时；生产浏览器追加检查超时，HTTP/权限核验通过。
