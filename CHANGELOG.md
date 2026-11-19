# Changelog

## 1.2.0

社区重写版(在 0.1.0 之上)。

- **动态子宫横截面**:`ZG1.jpg` + SVG 腔体裁剪,液面按储量升降、波纹随情欲加速、气泡、射爆外溢、HUD 扫描、心跳呼吸、高潮闪白。
- **新增** `/api/whale-utero/art` 路由,换图只要覆盖 `ZG1.jpg`。
- **修复**「无法连接接口 / 401」:Host 半在 `webServer` 未就绪时不再直接放弃注册,改为立即注册 → `ctx.inject` 等待 → 2 秒轮询兜底;并通过 `webserver/index-inject` 把带认证 token 的 API 查询串注入页面。
- **修复** 高潮冷却期内重复触发(3 分钟内不再高潮)。
- **仓库结构**:插件从 `DSH-ShengLi/` 子目录移到仓库根目录,支持 `dsh plugin add github:TianhuMoMo/DSH-shengli`。
- **新增** 一键安装脚本 `install.ps1`(UTF-8 BOM,兼容 PowerShell 5.1)/ `install.sh`。
- **新增** `test/state.test.mjs`(19 项)+ `.github/workflows/check.yml`。
- **新增** 设置页:全部公式可调、语音情感参数预览、恢复初始数据。
- 事件库扩到 20 种姿势 × 2 条描述。
- 状态文件改为 `data/state.json`(不入库),另加 `data/boot.json` 启动诊断。
- 许可证沿用 GPL-3.0。

## 0.1.0

初始版本。

- 侧边栏独立入口 + 整页状态档案(蓝 / 粉 / 紫亚克力)。
- 手绘矢量子宫模型(静态)。
- tokens → 精液、对话时长 → 情欲、小时 → 性压抑的基础模型。
- 事件中心(预设文案)、语音情感参数。
