# ABB 工位操作续改 · 2026-11-04

本轮由 Codex 接手稳定交付后的文件，当前未向 DSH 分派并行写入。

范围：AbbRobotViewer.vue（顶部动作、接料运动/反馈、主视图程序运行、全屏）；AbbProgramControl.vue（保留当前选择）；abb-feed-station.mjs 与相关功能测试（弧形挡料板+链板移到远离机器人一侧）；abb-service-panel.mjs（SMB仓独立外表面标记）；AgvModelViewer.vue/共享模型控制与全屏工具（全屏+自由翻转）；相关说明/部署。

用户确认：暂存斗底部是弧形挡料板。新俯视图箭头要求链板来料段移至斗体相反侧，出口接料坐标保持。电池仓单独标记，不与抱闸按钮合并。不改私有RAPID，不改服务器程序点。

追加授权：全流程运行与所选例程运行同时保留；自动匹配源程序变量与模拟设备 I/O。范围扩展至 server/src/robot-sim.js、robot-motion.js、robot-program 路由、独立模拟工位配置、AbbProgramSession/Control 及测试。自动信号只属于离线模拟，显示匹配依据，不覆盖备份/生产数据。未知备份不套用酿酒工位配置。

基线为 `.local/abb-program-layout-20261104/source-freeze.json`、已上线回执 `.local/abb-program-layout-20261104/activation.json`。

本批已于2026-11-04 23:54同步，真实验证与未完成边界见 [交付](ABB_WORKCELL_DELIVERY_20261104.md)；追加终检/清理/关机待办见 [交接](WEB_APP_FINAL_AUDIT_20261104.md)。DSH面板CSS最终冻结49676B36…，已整合；这不代表整站/App联合验收完成。
