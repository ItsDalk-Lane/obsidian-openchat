# Changelog

## 2026-07-26 - 同步上游 v0.8.1

上游基线记录：

- Upstream tag: `v0.8.1`
- Upstream commit: `678d01243ab4fccf0241280c31d05026efda3b9e`
- Fork 同步基线（merge-base with `upstream/main`）：
  `0d1d0d1a36dd8a4ead77648ad2fc18e2b1291e55`（`v0.8.0-3-g0d1d0d1`）

### 同步自上游 v0.8.1

- 引入 API 安全加固：Origin 校验、路径真实路径校验、上传请求体与图片附件限制。
- 新增可浏览目录选择器（后端浏览路由 + 侧边栏目录选择弹窗）。
- 修复会话运行态与侧边栏刷新一致性问题，补齐会话路径规范化处理（Windows 友好）。
- 增强模型错误可见性：`/api/models` 错误链路透传到输入区。
- 增强 Markdown / FileViewer：Mermaid 预览与放大、行号引用 mention、本地图片预览。
- 同步 CLI 启动行为：默认 loopback、`PI_WEB_HOSTNAME`、Node 最低版本校验。
- 升级 Pi SDK 依赖到 `0.82.1`，并同步 `engines.node >= 22.19.0`。

### 本 fork 适配改动

- 保留 fork 的身份字段与发布策略（`name` / `description` / `bin` / `repository` / `publish` 相关配置）。
- 保留并兼容 fork 的 Pi adapter 架构，将图片校验落在 `lib/adapters/pi` 层而非直接内联到旧调用层。
- 保留中文化 UI 文案与 Electron 运行链路，并在新功能点补齐中文文案。
- fork 版本号按上游主版本推进为：`0.8.1-fork.0`。
