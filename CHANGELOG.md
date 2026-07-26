# Changelog

## 2026-07-27 - 修复桌面端启动慢/长时间无窗口

- 问题:双击 `Pi-Web-Desktop.vbs` 后长时间没有任何窗口出现;日志显示 Next 已 `Ready` 但 Electron 健康检查全部"失败",白等约 19 秒才开窗。
- 原因一(`electron/main.js` `waitForServer`):3 秒超时后 `req.destroy()` 会再次触发 `error` 事件,同一次失败被计数两次并派生出重复检查链,60 次重试约 19 秒就耗尽;且 3 秒超时对冷启动首次请求(中间件/页面模块初始化)过于苛刻。
- 修复一:每次探测用 `settled` 标志保证只结算一次,`error` 改 `once` 注册;单次超时放宽到 8 秒,重试间隔 500ms、上限 120 次。
- 原因二:窗口要等服务器通过健康检查后才创建,启动期间零视觉反馈;启动中重复双击还会被单实例锁静默退出。
- 修复二:`app.whenReady` 后立即创建窗口并加载 `electron/loading.html`(新增,深色启动页 + 加载动画);服务器就绪后再 `loadURL` 切换到真实界面;健康检查最终失败时兜底仍尝试加载真实地址(服务器可能实际可用)。
- 影响范围:`electron/main.js`、`electron/loading.html`(新增,已随 `electron/**/*` 进入打包清单)。
- 验证方式:`node --check electron/main.js`、`npm run lint`。

## 2026-07-26 - 最终架构阶段推进：Capability/Policy/Evaluation/Context/Workspace 基线

- 新增 Runtime/Capability 基础接口：
  - `GET /api/runtimes`
  - `GET /api/capabilities`
  - `GET|PUT /api/tasks/:id/capabilities`
  - `POST /api/tasks/:id/capabilities/:capabilityId/invoke`
- 新增 Effect/Policy/Approval 流程基线：
  - `GET /api/tasks/:id/approvals`
  - `POST /api/tasks/:id/approvals/:approvalId`
  - 能力调用支持 `blocked / approval_required / completed` 三态返回
- 新增 Evidence/Evaluation/Completion Gate：
  - `GET /api/tasks/:id/evidence`
  - `GET|POST /api/tasks/:id/evaluate`
  - `POST /api/tasks/:id/complete`（要求最近评估通过）
- 新增 Context Compiler 与动态 Workspace 贡献接口：
  - `GET /api/tasks/:id/compiled-context`
  - `GET /api/tasks/:id/workspace`
- 新增持久化迁移 `003_capability_policy_evaluation_workspace`，引入能力描述、任务能力绑定、审批、证据、评估、工作台贡献表。
- 新增 `GET /api/doctor` 运行诊断接口（schema/runtime/task 计数与基础告警）。
- 新增维护接口：`POST /api/kernel/backup`（SQLite 备份）与 `POST /api/kernel/retention`（事件保留清理，含每任务最近事件保留底线）。
- 安全加固：新增可选 `PI_WEB_LAN_API_TOKEN`（非 loopback API 必须带 token）并保留 same-origin 校验，作为浏览器调用链路的基础 CSRF 防护。

## 2026-07-26 - 补同步:输入历史回填 + 缓存写用量显示

 cherry-pick 自上游:`f66347f`(feat: add input history recall)、`105c4fc`(Show cache write usage in messages)。

### 新增:输入历史回填

- 修改目的:让用户可以复用当前会话中已经发送过的输入,而不需要重新输入或从聊天记录中复制。
- 修改内容:当输入框为空且没有正在生成回复时,按 `ArrowUp` 打开输入历史菜单;继续使用 `ArrowUp` 和 `ArrowDown` 选择记录,按 `Enter`(或 `Tab`)将选中的内容填回输入框。填入后允许继续编辑,下一次按 `Enter` 才会发送。`Escape` 或点击菜单外部关闭菜单。
- 排序与焦点规则:历史按时间从旧到新显示,最新输入位于列表底部;首次按 `ArrowUp` 打开菜单时,焦点默认落在最新输入。
- 数据范围:只读取当前会话的非空文本用户消息;相同文本只保留一条;最多显示最近 50 条不同输入。
- 影响范围:
  - `components/ChatInput.tsx`:新增历史菜单、键盘导航、选中回填和关闭逻辑。
  - `components/ChatWindow.tsx`:从当前会话消息中整理输入历史,并传入输入组件。

### 新增:消息显示缓存写用量

- 修改内容:助手消息的用量统计中,在"缓存读"之外新增"缓存写"(cacheWrite)展示;缓存读文案由"缓存"改为"缓存读"以作区分。
- 影响范围:`components/MessageView.tsx` 的 `formatUsage()`(保留本 fork 的中文文案风格)。

### 说明

- Cmd+I 引用文件选中行功能(上游 `a3810ba`)已在 v0.8.1 同步中带入,本次无需重复移植。
- 验证方式:`npm run check`(typecheck + lint + 单测 + pi 适配层契约测试)。

## 2026-07-26 - 同步上游 v0.8.1

上游基线记录:

- Upstream tag: `v0.8.1`
- Upstream commit: `678d01243ab4fccf0241280c31d05026efda3b9e`
- Fork 同步基线(merge-base with `upstream/main`):
  `0d1d0d1a36dd8a4ead77648ad2fc18e2b1291e55`(`v0.8.0-3-g0d1d0d1`)

### 同步自上游 v0.8.1

- 引入 API 安全加固:Origin 校验、路径真实路径校验、上传请求体与图片附件限制。
- 新增可浏览目录选择器(后端浏览路由 + 侧边栏目录选择弹窗)。
- 修复会话运行态与侧边栏刷新一致性问题,补齐会话路径规范化处理(Windows 友好)。
- 增强模型错误可见性:`/api/models` 错误链路透传到输入区。
- 增强 Markdown / FileViewer:Mermaid 预览与放大、行号引用 mention、本地图片预览。
- 同步 CLI 启动行为:默认 loopback、`PI_WEB_HOSTNAME`、Node 最低版本校验。
- 升级 Pi SDK 依赖到 `0.82.1`,并同步 `engines.node >= 22.19.0`。

### 本 fork 适配改动

- 保留 fork 的身份字段与发布策略(`name` / `description` / `bin` / `repository` / `publish` 相关配置)。
- 保留并兼容 fork 的 Pi adapter 架构,将图片校验落在 `lib/adapters/pi` 层而非直接内联到旧调用层。
- 保留中文化 UI 文案与 Electron 运行链路,并在新功能点补齐中文文案。
- fork 版本号按上游主版本推进为:`0.8.1-fork.0`。
