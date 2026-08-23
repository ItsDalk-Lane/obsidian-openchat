# 同步缺口矩阵：上游 v0.8.2 → v0.8.8 积压回移

基准：fork 已同步 v0.8.1（adapted）与 v0.8.9 主体（c2c541b）。
本矩阵覆盖上游 b4f4576(v0.8.1)..0877bff(v0.8.8) 区间的 112 个实质性条目。
判定：PORT=待回移 / SKIP=跳过 / DONE=已回移（含 fork 原生等价）。

上游 SHA 速查：v0.8.2=b6116d1, v0.8.3=804810e, v0.8.5=cbb080d, v0.8.6=dfab585, v0.8.7=07f873c, v0.8.8=0877bff。
注意：本地 v0.8.2 标签是 fork 自己打的（a579332），不是上游的。

## Wave 1 — 消息渲染与流式 UX

| SHA | 内容 | 判定 |
|---|---|---|
| a8ba47e | CJK 按 ~1 token 计入 TPS 估算 | PORT（fork 均匀 /4，MessageView.tsx:468） |
| f355928 | 单个波浪线不判为删除线（CJK 区间） | PORT |
| 5ae7152 | markdown 预览中 YAML frontmatter 渲染为元数据卡片 | PORT |
| a3a79de | diff 内 hunk 行不再误解析为文件头 | PORT |
| 9ebe18a | 100KB+ 超大消息渲染保护防浏览器卡死 | PORT |
| d258d8d | 用户消息气泡高度上限 + 滚动条 | PORT |
| 5d6342a | 流式期间跳过语法高亮（性能） | PORT |
| 90959d1 | minimap 大纲渲染数学公式 | PORT |
| dc4c0ec | 附着正文/嵌套列表中的 display math 围栏归一化 | PORT |
| 44e595f | 编辑消息时恢复图片 | PORT |
| e851d30 | 聊天图片点击预览 | PORT |
| 27cd09d | 用户消息中折叠斜杠命令展开 | PORT |

## Wave 2 — 模型配置与认证

| SHA | 内容 | 判定 |
|---|---|---|
| 83c3757 | 忽略空白模型配置行 | PORT |
| 81767f4 | 模型切换响应性修复 | PORT |
| 0999006 | 会话重载后刷新模型列表 | PORT |
| 556e2ec | provider/压缩错误浮出 | PORT |
| 4fc2995 | 模型加载失败安全浮出 | PORT |
| ac81a96 | 模型配置原子写入（atomic-file） | PORT |
| e932d97 | API key 保存后不再挂起 | PORT |
| 0b0d04c | 双认证 provider（Anthropic/Copilot/Codex）列入 Models 面板 | PORT |
| 894babf | 模型选择器过滤 | PORT |
| faccb23 | enabledModels glob 解析 | DONE（c2c541b lib/model-scope.ts） |

## Wave 3 — 会话/侧边栏/工作区

| SHA | 内容 | 判定 |
|---|---|---|
| 8640559 | 会话 token 统计显示平均缓存命中率 | PORT |
| 360667c | 会话统计估算活跃时长 | PORT |
| f3c5aa5 | 活跃时长与 session info 对齐（重构） | PORT（与上条合并） |
| 06bb7ac | 压缩后恢复标题生成 | PORT |
| 3ea687c | 自动命名剥离技能 XML | PORT |
| 47cc7ef | Shift+Delete 无确认删除会话 | PORT |
| ec3c419 | 重命名输入预填会话标题并全选 | PORT |
| 30faaf7 | 文件浏览器折叠状态持久化 | PORT |
| d67b196 | worktree 间保留文件标签 | PORT |
| a192ec9 | 项目切换时清理失效文件标签 | PORT |
| 24ccee0 | worktree 切换器下拉过滤 | PORT |
| f61a3f7 | 重开当前会话不重载 | PORT |
| c8692e4 | 切换工作区恢复最后打开的会话 | PORT |
| 776fcb1 | 工作区选择器显示运行中/未读活动 | PORT |
| 044af0e | agent 会话结束浏览器通知 | PORT |
| 598c3c6 | 其他工作区任务完成提示音 | PORT |
| d2d7f22 | 瞬态会话保持可访问 | PORT（fork 有部分原生实现，对齐上游语义） |
| edf4c5d | 关闭时释放 agent 会话 | PORT |
| 68223e0 | prompt 完成后保留 agent 事件流 | PORT |
| 6ac87ec | 保留被拒的 prompt 提交 | PORT |
| 51e0510 | 每轮回复下列出写入文件 + HTML 预览 | PORT |
| 88f7a77 | 写入文件标签的主题感知图标 | PORT（与上条合并） |
| 125e55d | 减少跨窗口 SSE 使用 | 待核（fork SSE 架构不同） |
| c87a9a4 | 分支按首条消息标注 | DONE（fork 原生 BranchNavigator.getLabel） |
| 2e9e0d6 | 文件查看器状态跨标签保留 | → Wave 4 |
| d251bb3 | 防止 prompt 锚点更新循环 | 待核（fork 有自己的锚点机制） |

## Wave 4 — 文件查看器与 explorer

| SHA | 内容 | 判定 |
|---|---|---|
| 2e9e0d6 | 标签切换保留查看器状态（file-tab-state） | PORT（适配 WorkbenchTab/Artifact 模型） |
| ab0ea58 | mermaid 预览状态保留 | PORT |
| b3e1eed | Windows 下 git 路径比较修复 | PORT |
| ab614db | 文件查看器统一 @mention 动作 | PORT（fork 已有 Ctrl/Cmd+I 行引用，对齐上游入口） |
| 1a3abc1/6e0b9d1 | explorer 快速变更查看器 | PORT |
| 313727a | explorer 状态标志对齐 | 待核 |

## Wave 5 — 输入与杂项

| SHA | 内容 | 判定 |
|---|---|---|
| d60c547 | 只读工具预设偏好 | PORT |
| d63b55a | 技能面板与斜杠面板休眠技能分组 | PORT |
| caa3bb8 | 扩展对话框提示音 | PORT |
| 248aaf4 | Windows 驱动器选择器 | PORT（web 端补充，Electron 已有原生） |
| 9d1721f | 侧边栏拖拽调宽 + localStorage 持久化 | PORT |
| fcfac31 | 移动端输入框回车换行 | PORT（从上游移动端大改单独摘取） |
| 1e20164 | 开发模式允许回环 origin | PORT（改 request-security） |
| def8fb4 | DNS rebinding 修复（可移植部分） | PORT（fork request-security 已有 v0.8.1 基线，补差量） |
| 98f09d7 | DOCX 预览 Safari 同源 | PORT |
| 5179734 | agent 消息开销性能优化 | PORT |
| 58d650e | PATCH /api/skills 允许切换全局安装技能 | 待核 |
| 27935aa | 插件包安装改进 | 待核 |
| 101d08e | 持久化显式新会话偏好 | 待核 |
| d35c61f | 保留扩展注入消息的流式 | 待核 |
| 3d9acf6 | agent 需要关注时通知 | 待核（fork 仅完成通知） |
| 9e4ca65 | 扩展 widget 渲染在编辑器旁 | 待核（fork ExtensionStatusBar 布局不同） |
| a6ba057 | 工厂式扩展 widget | 待核 |
| 0475e14 | 移动端工具栏大改 | SKIP（仅摘取 fcfac31） |
| 8a33ba4/658de52/19e6d25/864b8a1 | 扩展状态栏系列 | DONE/SKIP（fork 原生 ExtensionStatusBar） |
| 5cddc13 | 未信任项目扩展门控 | 待核（fork 86a2222 已有 project trust gating） |

## Wave 6 — 大件

| SHA | 内容 | 判定 |
|---|---|---|
| c1f0f04+c3b741e | 定价预设 + 模型发现 + 设置简化 | PORT（lib/model-catalog 移植，API 翻译到 server/api） |
| 48e8300 | 可选密码认证（PI_WEB_PASSWORD） | PORT（web-auth 移植 + Hono 中间件） |
| 9716166 | 受限模式/项目信任 | 待核（fork 86a2222 已含 project trust gating） |

## 确认跳过（架构不适用 / fork 已有）

- PWA 全家：6885309, d362764, 0ada6c7, 5eb71d8, 99d4ea1（fork 为 Electron 桌面端）
- 297e3b6 上游 i18n（fork 有自己的 lib/i18n）；7ea863e 上游 locale 检测同 SKIP
- dc65365 Catppuccin 图标（fork 有自己的 FileIcons）；93716a5 其暗色图标修复随之 SKIP
- 2517174 npm 更新通知（fork 用 GitHub Releases + electron-updater）
- b8a3c53 hydration 修复（fork 为 Vite SPA 无 SSR；纯客户端部分无对应面）
- 05db5b2 Pi 0.84 流式增量协议（c2c541b 已随 streaming-message/agent-event-wire 回移）
- 243016e 流式中附图（fork 原生已支持）
- 7152653/#502、16ef4a2、af0b592 及全部 app/** Next 路由、bin/ 包装器、docs/CI/release、pi-SDK bump（CHANGELOG 已记录跳过）
- dbd583b minimap 导航大改、3a37c04 随屏滚动（fork 有原生实现，若 Wave 1 的 90959d1 移植中发现缺口再补）
- 776f801 系统外观主题模式（待核 useTheme；若 fork 无 system 跟随则 PORT）
- a3f6167 侧边栏下游 context-menu hook（fork 删了 subagents，此 hook 为其服务，SKIP）

## 完成记录（2026-08-23）

六波提交全部完成。最终判定汇总：
- **已回移**：Wave 1 全部（90959d1 除外）；Wave 2 全部；Wave 3 除 d2d7f22（客户端机制按设计保留）与 6ac87ec 服务端部分；Wave 4 除 quick-changes（1a3abc1/6e0b9d1）与 ab0ea58（fork 原生方案）；Wave 5 除 d63b55a/5179734/1e20164/def8fb4；Wave 6 密码认证 + 3d9acf6 核心。
- **暂缓（DEFER）**：c1f0f04+c3b741e 定价预设/模型发现、1a3abc1/6e0b9d1 快速变更查看器、d63b55a 休眠技能分组、5179734 消息开销、101d08e 启动偏好、6ac87ec 服务端部分。
- **跳过（SKIP）**：PWA 全家、上游 i18n、Catppuccin 图标、npm 更新通知、hydration、minimap 大改、Next.js 专属项。
- **fork 原生等价确认**：d67b196/a192ec9、edf4c5d、68223e0、c87a9a4、9716166、58d650e、9e4ca65、8a33ba4 系列等。
- **额外修复**：jiti 双模块实例导致 I18nProvider 测试全挂（统一测试导入路径）；.research/ eslint 忽略；directory-browser symlink 测试在 Windows 需开发者模式（环境限制，非代码问题）；ChatWindow.empty.test.mjs 的 zustand mock 失效为预存在问题。
