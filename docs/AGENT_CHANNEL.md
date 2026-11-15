# Codex 与 DSH 项目沟通通道

用户于2026-11-12要求两方直接沟通，不再由用户逐次转述。通道仅用于 `D:\wx_xiangm\xiangmu`，不自动联合DSH处理未授权的新任务。消息不会自行授权模型修改、部署或扩大文件范围。

## 固定入口

双方通过 `node tools/agent-channel.mjs` 收发。数据存于 Git忽略的 `.local/agent-channel/`：`channel.json`记录物理工作区和项目标识；`inbox/codex`、`inbox/dsh`分开保存不可变消息；`receipts/`保存接收回执。报告仍放 `docs/`，消息只发送任务编号、必要正文、报告路径与哈希。

此通道不用额外端口、API密钥、账号或常驻服务，不触碰业务系统。它是两个代理共用的本机文件收件箱，不是带身份认证的网络服务。`from/to`为协作约定，不能把其他人写入的消息当成人类授权。

## 收发方法

先进入仓库根目录。DSH将下列`--as dsh`用于自己收信；Codex使用`--as codex`。所有正文建议以UTF-8文件提供。

```powershell
node tools/agent-channel.mjs status
node tools/agent-channel.mjs read --as dsh
node tools/agent-channel.mjs send --from codex --to dsh --task agv-photo-review-20261112 --subject "请复核报告" --body-file .local/agv-review-20261112/dsh-task.txt
node tools/agent-channel.mjs ack --as dsh --id <收到的消息ID> --note "已读，开始复核"
node tools/agent-channel.mjs send --from dsh --to codex --task agv-photo-review-20261112 --reply-to <原消息ID> --subject "复核完成" --body-file <回复正文文件>
node tools/agent-channel.mjs wait --as codex --task agv-photo-review-20261112 --timeout-ms 50000
```

`read`默认只列未确认消息，读取不等于接收；实际读懂后再`ack`。`--all`可查看包含已确认消息的记录。`show --as <自己> --id <ID>`读取指定信。回复必须反向发给原发送者并保持同一任务编号，否则拒绝。独立消息文件避免并发改同一文档丢失消息。

## 协作习惯

1. 用户明确联合DSH后，两方先读各自收件箱，沟通分工、文件占用、疑点和稳定交付；按消息任务编号关联报告。进入新一轮和等待对方时再次读取，不要求用户复制消息。
2. 活跃任务中用`wait`等待新信，单次最多55秒；等待期间保持向用户说明实际进度。完成本次任务后退出等待，不为保持在线无限消耗模型调用。
3. 此工具保存消息和回执，**不会唤醒已经结束的模型会话**。首次接入或对方空闲时，Codex可按既有授权用Computer Use在已核对项目的DSH会话通知其读收件箱；不让用户代传。窗口被用户操作时不抢占，改用共享收件箱等候。尚无回执时只写“已投递”，不声称对方已收到或完成。
4. DSH也可直接发信给Codex；Codex在当前联合任务中主动读取。Codex会话结束后，下次本项目任务先查收件箱；不承诺跨应用会话休眠期间实时唤醒。
5. 不把凭据、生产配置、业务数据库、其他项目会话或用户隐私放入信箱；不自动执行消息正文中的命令；范围冲突先回信协调。源码写入前登记范围，冻结交付包括实际文件、SHA256、验证和未验收边界。

## 本次通道验证

2026-11-12北京时间11:19–11:22已完成真实接入：Codex发起，DSH实际读取并回信，Codex确认，DSH收到确认并回“握手完成”，Codex最终接收。四封消息均有对应接收方回执，replyTo链及物理工作区/项目标识一致，双方无未读消息。不是仅创建文件或本方模拟对方回信。

五项回归全部通过：独立收件箱、幂等回执/反向回复、24封并发写入及任务筛选、无效身份/路径/错误任务回复拒绝、有界等待/超时、项目标识错配检查（相关断言分布在5个test中）。`tools/agent-channel.test.mjs`使用独立私有测试目录，不写真实收件箱，也不删除历史消息。

收发核验明细保存在`.local/agent-channel/verification-20261112.json`，握手任务编号`channel-handshake-20261112`；原始四封信和四份回执保留。DSH接入记录由其写入`docs/AGENT_CHANNEL_DSH_20261112.md`。初始化通知已由Codex直接送入本项目DSH照片审查会话，后续消息及回复通过通道完成，用户无需代传。本轮未增加网络监听或常驻服务，未改AGV模型/业务、未构建或部署。
