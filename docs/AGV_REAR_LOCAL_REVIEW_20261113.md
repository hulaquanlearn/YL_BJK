# 后壳与TIM本地看图稿

状态：用户明确要求“做完后给我看下图，先别上线”。本轮未部署，未修改CURRENT_DEPLOYMENT及正式发布记录。线上仍为agv-rear-storage-20261113，不代表本地候选已发布。

以用户最新裁图解释为准：左右凹进红色挡板保留，只有正中缺口留给导航激光雷达；不是整条间隙掏空。内侧还包含左右分段折弯支撑、上下折边、中心端四个安装孔，下方横条与两端压片。前后TIM嵌在下部侧角开孔内，黑色扫描筒向下，不外挂在端面。尺寸和绝对位置按照片比例示意。

修改位于agv-model.mjs；配套更新agv-site-photos-20261103与agv-rear-storage-20261113两份回归。85项AGV专项及生产构建通过。检查中央开口双向贯通、两侧内挡板凹进、支撑板真实安装孔、前后TIM壳体真实开孔和向下扫描筒。实际开发页WebGL截图涵盖内侧/正面/中央雷达及前后TIM近景；未把早期整条镂空候选的96项成品断言算作当前候选验证。

逐部件几何对比：老车仅left-cover/right-cover/operator-panel/rear-cover/tim-front/tim-rear改变，EKS/EKK及新车24部件保持。点选不归位逻辑未修改。未操作生产业务、原生模拟器或真机，未生成正式发布包/APK、未Git提交/推送。

当前看图证据在`.local/agv-rear-opening-20261113/screenshots/`，主要为rear-inside-level-detail、rear-with-lidar-detail、rear-tim-close-detail及front-tim-close-detail；测试为tests-review.log，构建为build-review-inner.log，范围为scope-result.json。后续只有用户明确恢复上线后才能部署，不能套用早期未采用候选的manifest或finish-record脚本。
