# 附件预览与检索边界

## 同一附件的两种处理

在线阅读和 AI 检索分别验收：阅读成功不等于已提取全文；索引失败不影响原件下载。页面展示建索状态和失败原因，作者/管理员可重试。所有知识附件仍经登录接口读取，不放进公开 uploads 目录。

| 文件 | 在线阅读 | AI 检索 |
|---|---|---|
| PDF | 浏览器原件预览 | Poppler 提取文字；纯扫描件尝试有限页 OCR |
| DOC/DOCX、PPT/PPTX、XLS/XLSX、ODT/ODS/ODP、RTF | LibreOffice 转 PDF，尽量保留图片、图表、表格与排版 | Office 解析器或转换后提取 |
| PNG/JPG/WebP/GIF/BMP | 原图 | 静态图片用 Tesseract；OCR 结果需核对 |
| TXT/MD/CSV/JSON/XML/源码/可读图纸源文件 | 转义后的只读文本，不执行代码 | 有界文本提取，兼容 UTF-8/UTF-16/GB18030 |
| MP4/WebM/MP3/WAV/OGG/M4A | 浏览器支持的音视频播放 | 暂无转写，不虚称已全文建索 |
| ZIP/RAR/7Z、DWG、专有 CAD/二进制格式 | 文件信息预览并保留下载；需另附 PDF/图片获得图形阅读 | 暂无内容解析 |

未知、加密、损坏文件不能保证完整渲染。兼容 HTML、纯文本或文件信息页面会明确标注模式，不能把它们当作完整原件预览。系统仍拒绝可执行程序等非资料附件。

## Linux 转换环境

安装 LibreOffice Writer/Calc/Impress、中文字体、Poppler、Tesseract 中文+英文语言包、Bubblewrap。Bubblewrap 对转换命令禁用外部网络，仅映射只读运行库和单个临时工作目录，不映射 API 配置/业务目录。不能运行隔离环境时不要关闭保护，先修复服务器用户命名空间/容器配置；网页会提供明确标注的降级预览。

```bash
sudo apt-get update
sudo apt-get install -y libreoffice-writer libreoffice-calc libreoffice-impress fonts-noto-cjk poppler-utils tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng bubblewrap
cd /opt/spare-parts/server
node scripts/check-document-service.js --require-full
```

该命令只适合 Debian/Ubuntu；其他发行版安装同等依赖。不提供自动关闭服务器安全策略的命令。`--require-full` 任一能力缺失即非零退出，不能跳过验收。

配置见 `.env.example`：独立的 `DOCUMENT_CACHE_DIR` 必须非公开、仅服务账号可写；默认每次 120 秒、1 个处理进程、8 个排队请求、Node 解析器 384 MB 堆限制，上传上限 500 MB。原生外部转换器还应由服务器服务管理器设置内存/CPU限额。扫描 PDF 默认仅 OCR 前 5 页，结果包含范围提示；`DOCUMENT_OCR_PAGES` 最大 20，复杂扫描件可以手动补正文或拆分附件，不能把部分 OCR 当全文。

```bash
# 定期清理已超过 24 小时的衍生 PDF，不删除原始资料
node scripts/check-document-service.js --clean-cache
```

## 实际验收

准备非敏感 DOC/DOCX/PPT/PPTX/XLS/XLSX 各一份，至少包含表格、中文及图片。用同一份原件与在线 PDF 对比页数、图文和表格。再测文字 PDF、扫描 PDF、PNG、中文 TXT、未知 CAD、损坏 Office、加密 Office。验证模式提示、失败重试、来源引用和未授权用户的编辑/删除拒绝。不要只检查 HTTP 200。

## 参考依据

转换命令依据 [LibreOffice 官方启动参数](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)；OCR 使用 [Tesseract](https://github.com/tesseract-ocr/tesseract)；兼容 HTML 使用允许列表 [sanitize-html](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html)；转换隔离基于 [Bubblewrap](https://github.com/containers/bubblewrap)。这些工具不保证任意专有格式都能还原。
