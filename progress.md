# 会话进度

## 2026-03-31

- 已读取项目 `CLAUDE.md`、`docs/architecture.md`、`docs/golden-principles.md`、
  `docs/garbage-collection.md`。
- 已读取全局质量/操作规范，并确认需要以正式审计方式留档。
- 已确认工作树存在聊天相关脏改动，后续操作必须避免覆盖。
- 已初始化本次任务的规划文件。
- 已确认聊天 UI 删除历史与当前多模型/模板功能保留范围。
- 已执行最小清理：
  - 删除未引用的 `src/components/chat-components/hooks/useSlashCommand.ts`
  - 删除未使用的 `SlashCommandMenuProps`
  - 删除 `getPromptTemplateContent()` / `hasPromptTemplateVariables()`
  - 清理 chat 类型中已废弃的模板系统提示词残留字段
- 已追加 MCP 模式链路清理：
  - 删除未引用的 `src/components/chat-components/McpModeSelector.tsx`
  - 删除 `mcpToolMode` / `mcpSelectedServerIds` 状态与公开 API
  - 将 `ChatToolRuntimeResolver` 收敛为单一路径，保留显式过滤语义
- 已删除 `ChatSettings.enableSystemPrompt` 残留字段及默认值。
- 已完成验证：
  - `npm run test:chat-core`
  - `npm run test:domains`
  - `npm run lint:arch`
  - `npm run lint:taste`
  - `npm run build`
- 已完成 MCP 三模式链路验证：
  - `rg` 确认 `McpModeSelector`、`mcpToolMode`、`mcpSelectedServerIds`、
    `setMcpToolMode`、`setMcpSelectedServerIds`、`McpToolMode` 引用为 0

## 2026-04-02

- 已读取并核对：
  - 当前仓库工具 runtime 与 tool surface 相关源码
  - 两份外部分析文档
  - 现有工具 surface ADR 与 release note
- 已输出内置工具架构升级主文档：
  - `docs/designs/2026-04-02-builtin-tool-architecture-upgrade.md`
- 已输出配套实施与新增工具目录文档：
  - `docs/designs/2026-04-02-builtin-tool-implementation-and-catalog.md`
- 已输出 Codex 分步实施路线图文档：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md`
- 已把关键设计结论同步写入 `task_plan.md`、`findings.md`、`progress.md`
- 已完成路线图 Step 23 的最终回归修复与复验：
  - 修复 `src/tools/integration/dataview-query/service.ts` 的空 `catch`
  - 修复 `src/tools/runtime/BuiltinToolExecutor.ts` 的未使用 caught error
  - 新增 `src/tools/canvas/_shared/canvas-document-types.ts`，将
    `canvas-document.ts` 压回 500 行限制内
  - 清理 Vault / Web 兼容入口中的 barrel re-export
  - 将 `src/tools/vault/filesystemWrapperSupport.ts` 收敛为纯窄 builder，避免测试时提前加载
    `obsidian` 运行时依赖
- 已完成 Step 23 最终验证：
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- 已执行路线图 Step 07：
  - 新增 Vault 搜索工具目录：
    `src/tools/vault/search-content/**`
  - 新增 Vault 索引工具目录：
    `src/tools/vault/query-index/**`
  - 将 `search_content` 的 description / schema / service / tool 工厂迁入
    `src/tools/vault/search-content/**`
  - 将 `query_index` 的 description / schema / service / tool 工厂迁入
    `src/tools/vault/query-index/**`
  - 将 `src/tools/vault/filesystemSearchHandlers.ts` 收敛为薄桥接：
    继续注册 `move_path` / `find_paths` / `delete_path` / `stat_path`，
    并复用 `createSearchContentTool(app)` / `createQueryIndexTool(app)`
  - 将 `src/tools/vault/filesystemToolDescriptions.ts` 中
    `SEARCH_CONTENT_DESCRIPTION` / `QUERY_INDEX_DESCRIPTION`
    收敛为从新目录导入
  - 将 `src/tools/vault/filesystemQueryIndex.ts` 与
    `src/tools/vault/filesystemToolParsers.ts` 改为依赖新目录中的 `QueryIndexArgs`
  - 将 `src/core/chat/services/chat-tool-discovery-blueprint-presets.ts` 中
    `search_content` / `query_index` 从 builtin override 收敛到 legacy bridge，
    保留测试 stub 与无邻近 metadata 兼容对象的兜底能力
  - 新增 `src/tools/vault/search-step7.test.ts`，覆盖 Step 07 的目录落点、
    schema 默认值与 legacy 桥接
- 已完成 Step 07 定向验证：
  - `npx tsx --test src/tools/vault/search-step7.test.ts`
  - `npx tsx --test src/core/agents/loop/tool-call-argument-completion.test.ts src/core/chat/services/chat-tool-task-signature.test.ts src/core/chat/services/tool-selection-regression.test.ts`
- 下一步应执行：
  - 真实 Obsidian 手工 smoke test 与发布准备
- 已执行路线图 Step 01：
  - 扩展 `src/tools/runtime/types.ts`
  - 新增 `src/tools/runtime/build-tool.ts`
  - 在 `src/tools/runtime/tool-result.ts` 增加内置工具结果序列化辅助函数
  - 新增 `src/tools/runtime/build-tool.test.ts`
- 已完成 Step 01 定向验证：
  - `npx tsx --test`
    `src/tools/runtime/build-tool.test.ts`
    `src/core/agents/loop/tool-executor-runtime-flags.test.ts`
    `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
  - `npx tsx --test`
    `src/tools/runtime/build-tool.test.ts`
    `src/core/agents/loop/tool-executor-runtime-flags.test.ts`
    `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
    `src/core/chat/services/tool-selection-regression.test.ts`
- 已执行 `npx tsc --noEmit`：
  - 确认仓库存在与本轮无关的全量类型错误基线
  - 二次筛查确认 `src/tools/runtime/build-tool.ts`、`src/tools/runtime/types.ts`、
    `src/tools/runtime/tool-result.ts`、`src/tools/runtime/build-tool.test.ts`
    无新增类型报错
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 02
- 已执行路线图 Step 02：
  - 升级 `src/tools/runtime/BuiltinToolExecutor.ts` 执行流水线
  - 新增 `src/tools/runtime/builtin-tool-executor-support.ts` 承载执行器纯辅助逻辑
  - 扩展 `src/core/agents/loop/tool-call-validation.ts` 以映射业务校验/权限/输出校验错误
  - 扩展 `src/core/agents/loop/types.ts` 与 `src/types/tool.ts`，加入确认与进度回调类型
  - 升级 `src/core/chat/services/chat-plan-sync-service.ts` 的 builtin 调用注入签名，保留 `write_plan` guard
  - 补充 `src/core/agents/loop/tool-executor-runtime-flags.test.ts` 覆盖新流水线
- 已完成 Step 02 定向验证：
  - `npx tsx --test`
    `src/core/agents/loop/tool-executor-runtime-flags.test.ts`
    `src/core/agents/loop/tool-call-validation.test.ts`
    `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - 二次筛查确认 `src/tools/runtime/BuiltinToolExecutor.ts`
  - `src/core/agents/loop/tool-call-validation.ts`
  - `src/core/agents/loop/types.ts`
  - `src/types/tool.ts`
  - `src/core/chat/services/chat-plan-sync-service.ts`
  - `src/core/agents/loop/tool-executor-runtime-flags.test.ts`
  - 以上文件无新增类型报错
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 03
- 已执行路线图 Step 03：
  - 升级 `src/tools/runtime/register-tool.ts`，让 `registerBuiltinTool()` 同时兼容旧的
    `(name, options, handler)` 入口与直接接收 `BuiltinToolInput` 的新 shape
  - 升级 `src/tools/runtime/tool-registry.ts`，在注册时统一走 `buildBuiltinTool()`，
    并向 `BuiltinToolInfo` 透传邻近 `surface` / `runtimePolicy`
  - 升级 `src/core/chat/services/chat-tool-discovery-catalog.ts`，让
    `createBuiltinToolDefinition()` 和 `attachToolSurfaceMetadata()` 读取并合并邻近
    `surface` / `runtimePolicy` 元数据
  - 新增 `src/tools/runtime/register-tool.test.ts` 覆盖旧/新 shape 注册路径
  - 扩展 `src/core/chat/services/chat-tool-wrapper-surface.test.ts`，验证邻近
    `surface/runtimePolicy` 会影响 discovery 与 executable schema
- 已完成 Step 03 定向验证：
  - `npx tsx --test`
    `src/tools/runtime/register-tool.test.ts`
    `src/tools/runtime/build-tool.test.ts`
    `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
    `src/core/chat/services/tool-selection-regression.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认 `src/tools/runtime/register-tool.ts`
  - `src/tools/runtime/tool-registry.ts`
  - `src/core/chat/services/chat-tool-discovery-catalog.ts`
  - `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
  - `src/tools/runtime/register-tool.test.ts`
  - 以上文件无新增类型报错
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 04
- 已执行路线图 Step 04：
  - 新增 `src/tools/runtime/tool-module-layout.ts`，固化 `tool.ts`、`schema.ts`、
    `description.ts`、`service.ts` 与 `_shared` 的目录约定
  - 新增 `src/tools/vault/_shared/helpers.ts`、`path.ts`、`result.ts`、`query.ts`，
    为 Vault 域建立稳定的共享 helper 出口
  - 新增 Vault 单工具目录骨架：
    `src/tools/vault/read-file/**`
    `src/tools/vault/read-media/**`
    `src/tools/vault/open-file/**`
  - 新增 Web 单工具目录骨架：
    `src/tools/web/fetch/**`
    `src/tools/web/fetch-webpage/**`
    `src/tools/web/fetch-webpages-batch/**`
  - 新增 `src/tools/runtime/tool-module-layout.test.ts`，验证目录约定常量与骨架文件存在
- 已完成 Step 04 定向验证：
  - `npx tsx --test src/tools/runtime/tool-module-layout.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认 `src/tools/runtime/tool-module-layout.ts`
  - `src/tools/vault/_shared/**`
  - `src/tools/vault/read-file/**`
  - `src/tools/vault/read-media/**`
  - `src/tools/vault/open-file/**`
  - `src/tools/web/fetch/**`
  - `src/tools/web/fetch-webpage/**`
  - `src/tools/web/fetch-webpages-batch/**`
  - 以上文件无新增类型报错
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 05
- 已执行路线图 Step 05：
  - 将 `src/tools/vault/read-file/**` 从骨架升级为真实工具目录：
    新增本地 description，补齐 `service.ts` 读取逻辑与 `tool.ts` 工厂、
    `runtimePolicy`、`getToolUseSummary()`、`getActivityDescription()`
  - 将 `src/tools/vault/read-media/**` 从骨架升级为真实工具目录：
    新增本地 description，补齐媒体读取 `service.ts` 与 `tool.ts` 工厂、
    摘要/活动描述
  - 将 `src/tools/vault/open-file/**` 从骨架升级为真实工具目录：
    新增本地 schema、description、service 与 `tool.ts` 工厂
  - 在 `src/tools/vault/open-file/tool.ts` 补齐邻近 `surface` 元数据，
    明确“何时不要用”与“已知且稳定目标”语义
  - 将 legacy 入口改为薄桥接：
    `src/tools/vault/filesystemReadWriteHandlers.ts` 改为直接注册
    `createReadFileTool(app)` / `createReadMediaTool(app)`
    `src/tools/vault/nav-tools.ts` 改为直接注册 `createOpenFileTool(app)`
  - 将 `src/tools/vault/filesystemToolDescriptions.ts` 中
    `READ_FILE_DESCRIPTION` / `READ_MEDIA_DESCRIPTION` 收敛为从新目录 re-export
  - 新增 `src/tools/vault/read-navigation-step5.test.ts`，覆盖 Step 05 的目录落点、
    legacy 桥接与 `open_file` 邻近语义
- 已完成 Step 05 定向验证：
  - `npx tsx --test`
    `src/tools/runtime/tool-module-layout.test.ts`
    `src/tools/vault/read-navigation-step5.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - 全量 `tsc` 仍因仓库既有基线报错退出
  - `rg` 二次筛查确认以下文件未出现新增类型错误：
    `src/tools/vault/read-file/**`
    `src/tools/vault/read-media/**`
    `src/tools/vault/open-file/**`
    `src/tools/vault/filesystemReadWriteHandlers.ts`
    `src/tools/vault/nav-tools.ts`
    `src/tools/vault/read-navigation-step5.test.ts`
  - 期间发现并修复一处本步新增类型问题：
    `OpenFileArgs` 需要显式满足 `Record<string, unknown>` 才能走
    `registerBuiltinTool()` 的新 shape 入口
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 06
- 已执行路线图 Step 06：
  - 新增 discover 工具目录：
    `src/tools/vault/find-paths/**`
    `src/tools/vault/list-directory-flat/**`
    `src/tools/vault/list-directory-tree/**`
    `src/tools/vault/list-vault-overview/**`
  - 将 `find_paths` 的 description / schema / service / tool 工厂迁入
    `src/tools/vault/find-paths/**`
  - 将 `list_directory_flat`、`list_directory_tree`、`list_vault_overview` 的
    description / schema / service / tool 工厂迁入各自目录
  - 将 `src/tools/vault/filesystemSearchHandlers.ts` 改为复用
    `createFindPathsTool(app)`，保留其余 legacy 搜索/写入注册逻辑不变
  - 将 `src/tools/vault/filesystemWrapperTools.ts` 改为复用三个新的目录 discover
    工厂，保留 wrapper 工具名兼容
  - 将 `src/tools/vault/filesystemWrapperSupport.ts` 收敛为兼容 re-export 层，
    继续向外暴露 wrapper schema 与参数构造器
  - 将 `src/tools/vault/filesystemToolDescriptions.ts` 中
    `FIND_PATHS_DESCRIPTION` 收敛为从新目录 re-export
  - 新增 `src/tools/vault/discover-step6.test.ts`，覆盖 discover surface、
    schema 约束与 legacy 桥接
- 已完成 Step 06 定向验证：
  - `npx tsx --test`
    `src/tools/vault/discover-step6.test.ts`
    `src/tools/runtime/tool-module-layout.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - 全量 `tsc` 仍因仓库既有基线报错退出
  - `rg` 二次筛查确认以下文件未出现新增类型错误：
    `src/tools/vault/find-paths/**`
    `src/tools/vault/list-directory-flat/**`
    `src/tools/vault/list-directory-tree/**`
    `src/tools/vault/list-vault-overview/**`
    `src/tools/vault/filesystemSearchHandlers.ts`
    `src/tools/vault/filesystemWrapperTools.ts`
    `src/tools/vault/filesystemWrapperSupport.ts`
    `src/tools/vault/discover-step6.test.ts`
  - 期间发现并修复两类本步新增类型问题：
    `find_paths` 的 `TFile` / `TFolder` 需要以值导入参与 `instanceof`
    三个目录 wrapper 的 builder 需要补齐 `ListDirectoryArgs` 默认字段
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 07
- 已执行路线图 Step 15：
  - 新增 Workflow 工具目录：
    `src/tools/workflow/ask-user/**`
  - 新增 `src/tools/workflow/workflow-tools.ts`，将 `ask_user` 接入
    `BuiltinToolsRuntime`
  - 为 `ask_user` 补齐：
    邻近 `surface` 元数据、输入校验、执行摘要与活动描述
  - `ask_user` 现在支持两种回答路径：
    选项选择返回 `selected_value`
    自由文本返回 `free_text`
  - 扩展通用工具执行契约：
    `ToolExecutionOptions` / `BuiltinToolExecutionContext` 新增用户澄清请求类型
    `ToolErrorContext.kind` 新增 `tool-user-input`
  - 升级 `BuiltinToolExecutor` 与 provider tool loop：
    `requestToolUserInput` 已贯通 OpenAI / Claude / Ollama / Poe 相关执行链路
    无宿主输入能力时会返回结构化失败，不再误走权限确认流
  - 新增宿主澄清弹窗：
    `src/components/modal/ToolUserInputModal.ts`
    `ChatConsumerHost` 现在可通过 modal 向用户请求选项或自由文本回答
  - 新增 `src/tools/workflow/workflow-step15.test.ts`，覆盖 Step 15 的回答路径、
    执行器接线与结构化失败行为
- 已完成 Step 15 定向验证：
  - `npx tsx --test`
    `src/tools/workflow/workflow-step15.test.ts`
    `src/core/agents/loop/tool-executor-runtime-flags.test.ts`
    `src/core/chat/services/chatGenerationFacade.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下关键词未出现本步新增类型错误：
    `workflow-step15`
    `ask-user`
    `ToolUserInput`
    `requestToolUserInput`
    `tool-user-input`
    `ToolUserInputModal`
    `BuiltinToolUserInput`
  - 全量 `tsc` 仍存在与本步无关的历史错误基线；本轮口径仍为“改动文件无新增相关类型错误”
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 14
- 已执行路线图 Step 16：
  - 新增 Vault 工具目录：
    `src/tools/vault/append-daily-note/**`
  - 新增 `src/tools/vault/_shared/daily-note.ts`，收敛 daily note 配置读取、
    目标路径解析、标题归一化与按 section 插入正文的共享 helper
  - 将 `append_daily_note` 的 description / schema / service / tool 工厂落到
    `src/tools/vault/append-daily-note/**`
  - 在 `src/tools/vault/filesystemReadWriteHandlers.ts` 中接入
    `createAppendDailyNoteTool(app)`，保持 legacy 注册入口继续可用
  - `append_daily_note` 现在只暴露：
    `date`
    `content`
    `section_heading`
  - 工具内部现在会：
    读取 `.obsidian/daily-notes.json`
    结合 `folder + format` 解析目标 daily note 路径
    自动补齐 `.md`
    在需要时按标题创建或追加对应 section
  - 收敛一处实现细节：
    `normalizeAppendDailyNoteArgs()` 现在只归一化一次 `section_heading`
    `parseDailyNoteDate()` 的 `momentValue` 类型改为 `ReturnType<typeof moment>`
  - 新增 `src/tools/vault/append-daily-note-step16.test.ts`，覆盖 Step 16 的 schema 边界、
    内部路径解析源码约束与 legacy 注册桥接
- 已完成 Step 16 定向验证：
  - `npx tsx --test src/tools/vault/append-daily-note-step16.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下关键词未出现本步新增类型错误：
    `append-daily-note`
    `append_daily_note`
    `daily-notes.json`
    `resolveDailyNoteTarget`
    `appendToDailyNoteContent`
  - 全量 `tsc` 仍存在与本步无关的历史错误基线；本轮口径仍为“改动文件无新增相关类型错误”
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 14
- 已执行路线图 Step 17：
  - 新增 Vault 工具目录：
    `src/tools/vault/property-edit/**`
  - 新增 `src/tools/vault/_shared/frontmatter.ts`，收敛 frontmatter 的 YAML 解析、
    对象校验与回写逻辑
  - 将 `property_edit` 的 description / schema / service / tool 工厂落到
    `src/tools/vault/property-edit/**`
  - 在 `src/tools/vault/filesystemReadWriteHandlers.ts` 中接入
    `createPropertyEditTool(app)`，保持 legacy 注册入口继续可用
  - `property_edit` 现在只暴露：
    `file_path`
    `operations`
  - `operations` 现在支持四类 frontmatter 结构化变更：
    `set`
    `delete`
    `append`
    `remove`
  - 属性值转换复用了现有 `convertFrontmatterValue()` 逻辑，可对 checkbox、number、
    date、tags、multitext 等属性做一致转换
  - 删除型属性操作现在会进入确认流：
    `delete` / `remove` 走 ask
    `set` / `append` 直接放行
  - 新增 `src/tools/vault/property-edit-step17.test.ts`，覆盖 Step 17 的 schema 边界、
    frontmatter helper 源码约束与 legacy 注册桥接
- 已完成 Step 17 定向验证：
  - `npx tsx --test src/tools/vault/property-edit-step17.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下关键词未出现本步新增类型错误：
    `property-edit`
    `property_edit`
    `frontmatter.ts`
    `parseFrontmatterDocument`
    `serializeFrontmatterDocument`
  - 全量 `tsc` 仍存在与本步无关的历史错误基线；本轮口径仍为“改动文件无新增相关类型错误”
- Step 17 额外修正说明：
  - 定向测试初版对源码字符串中的反引号匹配过窄，已调整为匹配转义后的源码文本，
    不影响工具实现本身
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 14
- 已执行路线图 Step 18：
  - 新增 Graph 工具目录：
    `src/tools/graph/backlink-analyze/**`
  - 新增 `src/tools/graph/graph-tools.ts`，收敛 graph 域内置工具聚合入口
  - 将 `backlink_analyze` 的 description / schema / service / tool 工厂落到
    `src/tools/graph/backlink-analyze/**`
  - 在 `src/tools/runtime/BuiltinToolsRuntime.ts` 中接入
    `createGraphTools(options.app)`，保持 graph 工具作为 core builtin 能力可发现
  - `backlink_analyze` 现在只暴露：
    `file_path`
    `include_outgoing`
    `include_unresolved`
    `depth`
  - 当前阶段的图谱分析边界已锁定为一跳：
    `validateInput()` 会拒绝 `depth=2`
    输出仅包含 `incoming`、`outgoing`、`mutual`、`unresolved`
  - incoming 现在复用了 metadata cache 的 `getBacklinksForFile(file)`
  - outgoing 现在聚合了 metadata cache 中的：
    `links`
    `frontmatterLinks`
    `embeds`
  - unresolved 现在返回无法解析的一跳链接文本集合
  - 新增 `src/tools/graph/backlink-step18.test.ts`，覆盖 Step 18 的 schema 边界、
    service 源码约束与 runtime 接线
- 已完成 Step 18 定向验证：
  - `npx tsx --test src/tools/graph/backlink-step18.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下关键词未出现本步新增类型错误：
    `backlink-step18`
    `backlink-analyze`
    `backlink_analyze`
    `createGraphTools`
    `builtin.graph.backlink`
  - 全量 `tsc` 仍存在与本步无关的历史错误基线；本轮口径仍为“改动文件无新增相关类型错误”
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 14
- 已执行路线图 Step 19：
  - 新增 Obsidian 命令工具目录：
    `src/tools/obsidian/commands/**`
  - 将 `list_commands` 的 description / schema / service / tool 工厂落到
    `src/tools/obsidian/commands/list-commands/**`
  - 将 `run_command` 的 description / schema / service / tool 工厂落到
    `src/tools/obsidian/commands/run-command/**`
  - 新增 `src/tools/obsidian/commands/obsidian-tools.ts`，收敛命令工具聚合入口
  - 在 `src/tools/runtime/BuiltinToolsRuntime.ts` 中接入
    `createObsidianCommandTools(options.app)`，保持命令工具作为 core builtin 能力可发现
  - `list_commands` 现在只暴露：
    `query`
    `plugin_id`
    `max_results`
  - `run_command` 现在只暴露：
    `command_id`
  - `list_commands` 现在基于 `app.commands.listCommands()` 做 discover，
    并按名称、命令 id 与插件前缀进行筛选
  - `run_command` 现在基于：
    `app.commands.findCommand()`
    `app.commands.executeCommandById()`
    做权限检查与实际执行
  - `run_command` 的确认已收敛到权限流：
    命令不存在时在权限检查阶段直接拒绝
    未知来源或未知风险命令会保守上调风险并要求确认
  - 新增 `src/tools/obsidian/commands/commands-step19.test.ts`，覆盖 Step 19 的 schema 边界、
    commands API 约束与 runtime 接线
- 已完成 Step 19 定向验证：
  - `npx tsx --test src/tools/obsidian/commands/commands-step19.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下关键词未出现本步新增类型错误：
    `commands-step19`
    `list_commands`
    `run_command`
    `createObsidianCommandTools`
    `workflow.obsidian.commands`
    `builtin.obsidian.commands`
  - 全量 `tsc` 仍存在与本步无关的历史错误基线；本轮口径仍为“改动文件无新增相关类型错误”
- Step 19 额外修正说明：
  - 定向测试初版把 `BuiltinToolsRuntime.ts` 的相对路径写错为 `src/runtime/**`，
    已修正到真实的 `src/tools/runtime/**`，不影响工具实现本身
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 14
- 已执行路线图 Step 08：
  - 新增写入工具目录：
    `src/tools/vault/write-file/**`
    `src/tools/vault/edit-file/**`
  - 将 `write_file` 的 description / schema / service / tool 工厂迁入
    `src/tools/vault/write-file/**`
  - 将 `edit_file` 的 description / schema / service / tool 工厂迁入
    `src/tools/vault/edit-file/**`
  - 为两个写入工具补齐：
    `validateInput()`、`checkPermissions()`、`getToolUseSummary()`、
    `getActivityDescription()` 与动态风险钩子
  - `write_file` 现在会在覆盖已有文件时进入确认流；
    `edit_file` 会在多处编辑或明显删改型编辑时进入确认流，
    `dry_run=true` 继续保持只读预览语义
  - 在 `src/core/services/fileOperationHelpers.ts` 中补充写入共享 helper：
    路径校验新增 `..` 拦截，文本替换新增“明显破坏性覆盖”判断
  - 将 `src/tools/vault/filesystemReadWriteHandlers.ts` 改为直接注册
    `createWriteFileTool(app)` / `createEditFileTool(app)`，
    保留 `read_files` / `create_directory` 等其余 legacy 注册逻辑不变
  - 将 `src/tools/vault/filesystemToolDescriptions.ts` 中
    `WRITE_FILE_DESCRIPTION` / `EDIT_FILE_DESCRIPTION`
    收敛为从新目录 re-export
  - 扩展 `src/tools/vault/_shared/result.ts` 暴露编辑共享 helper
  - 新增 `src/tools/vault/write-edit-step8.test.ts`，覆盖 Step 08 的 schema 默认值、
    新契约钩子与 legacy 桥接
- 已完成 Step 08 定向验证：
  - `npx tsx --test`
    `src/tools/vault/write-edit-step8.test.ts`
    `src/core/agents/loop/tool-executor-runtime-flags.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - 全量 `tsc` 仍因仓库既有基线报错退出
  - `rg` 二次筛查确认以下文件未出现新增类型错误：
    `src/core/services/fileOperationHelpers.ts`
    `src/tools/vault/_shared/result.ts`
    `src/tools/vault/write-file/**`
    `src/tools/vault/edit-file/**`
    `src/tools/vault/filesystemReadWriteHandlers.ts`
    `src/tools/vault/filesystemToolDescriptions.ts`
    `src/tools/vault/write-edit-step8.test.ts`
  - 期间发现并修复一处本步测试问题：
    Step 08 测试最初把描述断言写得过窄，已调整为匹配“最小连续文本”表述
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 07
- 已执行路线图 Step 09：
  - 新增破坏性工具目录：
    `src/tools/vault/move-path/**`
    `src/tools/vault/delete-path/**`
  - 将 `move_path` 的 description / schema / service / tool 工厂迁入
    `src/tools/vault/move-path/**`
  - 将 `delete_path` 的 description / schema / service / tool 工厂迁入
    `src/tools/vault/delete-path/**`
  - 为两个工具补齐：
    `validateInput()`、`checkPermissions()`、`getToolUseSummary()`、
    `getActivityDescription()` 与并发风险声明
  - `move_path` 现在会在真实存在的源路径上默认进入确认流，
    并额外阻止把路径移动到自己的子路径下
  - `delete_path` 现在会在真实存在的目标路径上默认进入 destructive 确认流，
    并在确认文案中展示文件/目录摘要
  - 将 `src/tools/vault/filesystemSearchHandlers.ts` 改为直接注册
    `createMovePathTool(app)` / `createDeletePathTool(app)`，
    保留 `search_content` / `query_index` / `stat_path` 等其余 legacy 注册逻辑不变
  - 将 `src/tools/vault/filesystemToolDescriptions.ts` 中
    `MOVE_PATH_DESCRIPTION` / `DELETE_PATH_DESCRIPTION`
    收敛为从新目录 re-export
  - 新增 `src/tools/vault/destructive-step9.test.ts`，覆盖 Step 09 的 schema 默认值、
    确认流元数据与 legacy 桥接
- 已完成 Step 09 定向验证：
  - `npx tsx --test`
    `src/tools/vault/destructive-step9.test.ts`
    `src/core/agents/loop/tool-executor-runtime-flags.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - 全量 `tsc` 仍因仓库既有基线报错退出
  - `rg` 二次筛查确认以下文件未出现新增类型错误：
    `src/tools/vault/move-path/**`
    `src/tools/vault/delete-path/**`
    `src/tools/vault/filesystemSearchHandlers.ts`
    `src/tools/vault/filesystemToolDescriptions.ts`
    `src/tools/vault/destructive-step9.test.ts`
  - 期间发现并修复一处本步新增类型问题：
    `filesystemSearchHandlers.ts` 中残留的 `registerNavTools` 调用已移除
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 07
- 已执行路线图 Step 10：
  - 新增 Web 工具目录：
    `src/tools/web/bing-search/**`
  - 将 `fetch` 的 description / schema / service / tool 工厂迁入
    `src/tools/web/fetch/**`
  - 将 `fetch_webpage` 的 description / schema / service / tool 工厂迁入
    `src/tools/web/fetch-webpage/**`
  - 将 `fetch_webpages_batch` 的 description / schema / service / tool 工厂迁入
    `src/tools/web/fetch-webpages-batch/**`
  - 将 `bing_search` 的 description / schema / service / tool 工厂迁入
    `src/tools/web/bing-search/**`
  - 将 legacy 入口收敛为薄桥接：
    `src/tools/web/fetch-tools.ts`
    `src/tools/web/fetch-wrapper-tools.ts`
    `src/tools/web/bing-search-tools.ts`
  - 为 `fetch`、`fetch_webpage`、`fetch_webpages_batch` 补齐：
    邻近 `surface` 元数据、`getToolUseSummary()`、`getActivityDescription()`
    与抓取进度上报
  - `fetch` 兼容工具现在允许仅传 `urls` 进入批量模式，并通过 `validateInput()` 保持
    “至少提供 `url` 或 `urls` 之一”的兼容语义
  - 长网页抓取命中分页截断提示时会额外上报“可继续分页读取”的进度摘要；
    批量抓取完成时会返回成功/失败统计
  - 新增 `src/tools/web/web-step10.test.ts`，覆盖 Step 10 的 schema 兼容、
    进度摘要与 legacy 桥接
- 已完成 Step 10 定向验证：
  - `npx tsx --test src/tools/web/web-step10.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下文件未出现新增类型错误：
    `src/tools/web/**`
    `src/tools/runtime/BuiltinToolsRuntime.ts`
    `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
    `src/core/chat/services/tool-selection-regression.test.ts`
  - 期间发现并修复两类本步新增类型问题：
    Web 工厂返回类型过窄，导致 wrapper 测试中的 `execute()` 参数被推成交叉类型
    `fetch` 进度事件与 `bing_search` HTML 遍历存在细节类型问题，已修正
- Step 10 额外验证说明：
  - 直接运行 `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
    与 `src/core/chat/services/tool-selection-regression.test.ts` 时，当前 Node 入口会先因
    `obsidian` 模块解析失败而退出；该问题属于仓库现有测试基线，并非本步 Web 迁移回归
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 07
- 已执行路线图 Step 11：
  - 新增 Script 工具目录：
    `src/tools/script/run-script/**`
    `src/tools/script/run-shell/**`
  - 将 `run_script` 的 description / schema / service / tool 工厂迁入
    `src/tools/script/run-script/**`
  - 将 `run_shell` 的 description / schema / service / tool 工厂迁入
    `src/tools/script/run-shell/**`
  - 将 `src/tools/script/script-tools.ts` 收敛为 legacy 聚合桥接，继续暴露
    `createScriptTools()`，并复用两个新目录工厂
  - 升级 `src/tools/runtime/script-runtime.ts`：
    新增脚本执行选项对象、abort 接线与脚本内 `call_tool()` 进度回调
  - 为 `run_script` 补齐：
    邻近 `surface` 元数据、输入校验、执行摘要、活动描述、并发语义与中断语义
  - 为 `run_shell` 补齐：
    邻近 `surface` 元数据、动态风险判断、确认流、执行摘要、活动描述与 abort 接线
  - `run_shell` 现在在桌面端默认进入确认流：
    只读命令上报 `read-only`
    破坏性命令上调到 `destructive`
    未知命令维持 `escape-hatch`
  - `run_script` 现在会在脚本内部每次调用 `call_tool()` 时回传进度消息，
    并用脚本首段内容作为工具使用摘要
  - 扩展 workflow 路由回归：
    `chat-tool-selection-coordinator.test.ts` 新增显式 `run_script` 用例
    `chat-tool-task-signature.test.ts` 新增显式 `run_script` 识别用例
    `__fixtures__/tool-selection-regression.ts` 与
    `tool-selection-regression.test.ts` 补入 `run_script` case/stub
  - 新增 `src/tools/script/script-step11.test.ts`，覆盖 Step 11 的 Script 迁移、
    shell 确认流与桌面端执行兼容
- 已完成 Step 11 定向验证：
  - `npx tsx --test src/tools/script/script-step11.test.ts`
  - `npx tsx --test src/core/chat/services/chat-tool-task-signature.test.ts`
  - `npx tsx --test src/core/chat/services/chat-tool-selection-coordinator.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下文件未出现新增类型错误：
    `src/tools/script/**`
    `src/tools/runtime/script-runtime.ts`
    `src/core/chat/services/chat-tool-selection-coordinator.test.ts`
    `src/core/chat/services/chat-tool-task-signature.ts`
    `src/core/chat/services/chat-tool-task-signature.test.ts`
    `src/core/chat/services/__fixtures__/tool-selection-regression.ts`
    `src/core/chat/services/tool-selection-regression.test.ts`
- Step 11 额外验证说明：
  - 直接运行 `src/core/chat/services/tool-selection-regression.test.ts` 时，当前 Node 入口仍会先因
    Vault 侧 `obsidian` 模块解析失败而退出；该问题属于仓库现有测试基线，并非本步 Script 迁移回归
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 07
- 已执行路线图 Step 12：
  - 新增 Time 工具目录：
    `src/tools/time/get-time/**`
    `src/tools/time/get-current-time/**`
    `src/tools/time/convert-time/**`
    `src/tools/time/calculate-time-range/**`
  - 将 `get_time` 的 description / schema / service / tool 工厂迁入
    `src/tools/time/get-time/**`
  - 将 `get_current_time`、`convert_time`、`calculate_time_range` 的
    description / schema / service / tool 工厂分别迁入各自目录
  - 将 `src/tools/time/time-tools.ts` 收敛为 legacy 兼容桥接，继续暴露
    `createTimeTools()`，并复用新的 `get_time` 工厂
  - 将 `src/tools/time/time-wrapper-tools.ts` 收敛为 wrapper 聚合桥接，继续暴露
    `createTimeWrapperTools()`，并复用三个新的 wrapper 工厂
  - 为 `get_time` 补齐：
    邻近 `surface` 元数据、执行摘要、活动描述与 `validateInput()`
  - `get_time` 现在会在 `validateInput()` 阶段完成 mode 相关参数校验：
    `current` 禁止混入 convert/range 字段
    `convert` 必须同时提供 `source_timezone`、`target_timezone`、`time`
    `range` 必须提供 `natural_time`
  - 为三个 wrapper 补齐：
    邻近 `surface` 元数据、执行摘要与更清晰的输入校验
  - 新增 `src/tools/time/time-step12.test.ts`，覆盖 Step 12 的 mode 校验前移、
    wrapper/legacy 兼容结果与 legacy 桥接
- 已完成 Step 12 定向验证：
  - `npx tsx --test src/tools/time/time-step12.test.ts`
  - `npx tsx --test src/core/chat/services/chat-tool-candidate-resolver.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下文件未出现新增类型错误：
    `src/tools/time/**`
    `src/core/chat/services/chat-tool-candidate-resolver.test.ts`
    `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
    `src/core/chat/services/tool-selection-regression.test.ts`
  - 期间发现并修复两类本步新增问题：
    `get_current_time` 与 legacy `get_time(current)` 对比时存在 1ms 级时间抖动，测试已改为秒级稳定比较
    wrapper tool 的结果类型需要显式写实，否则测试里会被推成 `unknown`
- Step 12 额外验证说明：
  - `chat-tool-wrapper-surface.test.ts` 与 `tool-selection-regression.test.ts` 本轮未直接运行，
    原因仍是它们会经由 Vault wrapper 链路先撞到 `obsidian` 模块解析基线；该问题属于仓库现有测试基线，并非本步 Time 迁移回归
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 07
- 已执行路线图 Step 13：
  - 新增 Link 工具目录：
    `src/tools/link/get-first-link-path/**`
  - 新增 Plan 工具目录：
    `src/tools/plan/write-plan/**`
  - 新增 Skill 工具目录：
    `src/tools/skill/discover-skills/**`
    `src/tools/skill/invoke-skill/**`
    `src/tools/skill/_shared/**`
  - 将 `get_first_link_path` 的 description / schema / service / tool 工厂迁入
    `src/tools/link/get-first-link-path/**`
  - 将 `write_plan` 的 description / schema / service / tool 工厂迁入
    `src/tools/plan/write-plan/**`
  - 将 `discover_skills`、`invoke_skill` 的 description / schema / service / tool 工厂迁入
    各自目录，并把共享说明与 Skill 返回格式辅助逻辑收敛到 `src/tools/skill/_shared/**`
  - 将 `src/tools/link/link-tools.ts`、`src/tools/plan/plan-tools.ts`、
    `src/tools/skill/skill-tools.ts` 收敛为 legacy 聚合桥接，继续暴露原工厂入口
  - 为四个目标工具补齐邻近 `surface` 元数据、执行摘要与活动描述
  - `get_first_link_path` 现在会在 `validateInput()` 阶段检查清理后的链接目标是否为空
  - `write_plan` 现在会在 `validateInput()` 阶段提前拦截多个 `in_progress` 任务，
    以及 `done` / `skipped` 缺少 `outcome` 的情况
  - Skill 工具继续保持特殊返回格式兼容：
    `discover_skills` 成功时返回对象结果，失败时返回错误字符串
    `invoke_skill` 继续返回带 `Base Path`、`<invocation-args>`、
    `<command-name>` 的字符串结果
  - 新增 `src/tools/link-plan-skill-step13.test.ts`，覆盖 Step 13 的目录迁移、
    legacy 桥接、Skill 返回格式与 Link / Plan 行为兼容
- 已完成 Step 13 定向验证：
  - `npx tsx --test src/tools/link-plan-skill-step13.test.ts`
  - `npx tsx --test src/tools/skill/skill-tools.test.ts`
  - `npx tsx --test src/core/chat/services/chat-tool-task-signature.test.ts`
  - `npx tsx --test src/core/chat/services/chat-tool-selection-coordinator.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下文件未出现新增类型错误：
    `src/tools/link/**`
    `src/tools/plan/write-plan/**`
    `src/tools/skill/**`
    `src/tools/link-plan-skill-step13.test.ts`
    `src/core/chat/services/chat-tool-task-signature.test.ts`
    `src/core/chat/services/chat-tool-selection-coordinator.test.ts`
  - 期间发现并修复一处既有测试类型问题：
    `skill-tools.test.ts` 中 `invoke_skill` 的执行结果需要显式断言为 `string`，
    否则经由宽泛 `BuiltinTool[]` 工厂查找后会被推成 `unknown`
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 07
- 已执行路线图 Step 14：
  - 将 `src/core/chat/services/chat-tool-discovery-blueprints.ts` 从“大而全 builtin 真相表”
    收敛为三层结构，并把大体量预设拆到
    `src/core/chat/services/chat-tool-discovery-blueprint-presets.ts`，
    以满足单文件 500 行约束：
    - `BUILTIN_TOOL_SURFACE_OVERRIDES`：只保留仍未迁到邻近 `surface` 的 builtin 例外
    - `BUILTIN_TOOL_LEGACY_BRIDGES`：只在 builtin 缺少邻近 `surface` 时兜底
    - `NON_BUILTIN_SURFACE_OVERRIDES`：保留 `sub-agents` 等非 `BuiltinTool` 例外
  - 在 `src/core/chat/services/chat-tool-discovery-catalog.ts` 中改为：
    - builtin 若存在邻近 `surface`，优先以邻近元数据为事实来源
    - builtin 若缺少邻近元数据，回退到 legacy bridge / override
    - 非 builtin 继续走 non-builtin override 或通用 fallback
  - 新增
    `src/core/chat/services/chat-tool-discovery-blueprints-step14.test.ts`，
    覆盖 migrated builtin 邻近元数据优先、legacy bridge 兜底和
    `sub-agents` 独立体系断言
  - 在 `src/tools/sub-agents/subAgentTools.ts` 增加注释，明确
    `sub-agents` 故意保留在 `ToolDefinition + ToolExecutor` 体系中
  - 为 sub-agent 兼容类型补齐：
    `src/tools/sub-agents/types.ts` 新增 `SubAgentInfo`、
    `SubAgentScannerOptions` 的兼容导出
  - 修复 `src/tools/sub-agents/SubAgentToolExecutor.test.ts`
    的类型断言方式，使其通过定向 `tsc` 筛查
  - 核查了 `src/core/chat/services/chat-tool-runtime-resolver-support.ts`，
    结论是该文件继续只承载 runtime 辅助逻辑，无需承接 surface 真相
- 已完成 Step 14 定向验证：
  - `npx tsx --test`
    `src/core/chat/services/chat-tool-discovery-blueprints-step14.test.ts`
    `src/core/chat/services/chat-tool-surface-adapter.test.ts`
    `src/core/chat/services/chat-tool-candidate-resolver.test.ts`
    `src/core/chat/services/chat-tool-task-signature.test.ts`
    `src/core/chat/services/chat-tool-selection-coordinator.test.ts`
  - `npx tsx --test src/tools/sub-agents/SubAgentToolExecutor.test.ts`
- Step 14 额外验证说明：
  - 已再次直接运行
    `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
    `src/core/chat/services/tool-selection-regression.test.ts`
  - 两者依然会先经由 Vault wrapper 链路撞到 `obsidian` 模块解析失败；
    该问题属于仓库现有 Node 测试环境基线，并非本步 surface 收敛回归
- 已执行 `npx tsc --noEmit` 定向筛查：
  - `rg` 二次筛查确认以下文件未出现新增类型错误：
    `src/core/chat/services/chat-tool-discovery-blueprints.ts`
    `src/core/chat/services/chat-tool-discovery-blueprint-presets.ts`
    `src/core/chat/services/chat-tool-discovery-catalog.ts`
    `src/core/chat/services/chat-tool-runtime-resolver-support.ts`
    `src/core/chat/services/chat-tool-surface-adapter.test.ts`
    `src/core/chat/services/chat-tool-wrapper-surface.test.ts`
    `src/core/chat/services/chat-tool-candidate-resolver.test.ts`
    `src/core/chat/services/chat-tool-task-signature.test.ts`
    `src/core/chat/services/chat-tool-selection-coordinator.test.ts`
    `src/core/chat/services/tool-selection-regression.test.ts`
    `src/tools/sub-agents/**`
    `src/types/sub-agent.ts`
  - 期间发现并修复两类问题：
    builtin stub 在缺少邻近 `surface` 时会丢失既有路由语义，已补 legacy bridge 兜底
    sub-agent 兼容类型导出与测试断言方式不完整，已补齐
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 07
- 已执行路线图 Step 20：
  - 新增 MCP 资源工具目录：
    `src/tools/mcp/resources/list-mcp-resources/**`
    `src/tools/mcp/resources/read-mcp-resource/**`
    `src/tools/mcp/resources/mcp-resource-tools.ts`
  - 新增 `list_mcp_resources`：
    - 负责按 `server_id` / `query` 发现资源
    - 返回稳定的 `server_id`、`server_name`、`uri`、`name`
    - 对结果数量做 `max_results` 限制与 `truncated` 标记
  - 新增 `read_mcp_resource`：
    - 只接受精确 `server_id` + `uri`
    - 读取文本或 blob(base64) 内容
    - 对大文本和大 blob 都会返回截断后的结果与 `truncated` 标记
  - 新增 `src/domains/mcp/mcp-resources.test.ts`，覆盖
    `McpRuntimeManagerImpl.getResourcesForServer()` /
    `readResource()` 的 runtime 委托链路
  - 升级 `src/domains/mcp/types.ts`，新增
    `McpResourceInfo` / `McpResourceContent`
    以及 `McpRuntimeManager` 的资源读取契约
  - 升级 `src/domains/mcp/runtime/protocol-client.ts`：
    - 新增 `listResources()`，处理 `resources/list` 分页 `nextCursor`
    - 新增 `readResource()`，处理 `resources/read`
  - 升级 `src/domains/mcp/runtime/runtime-manager.ts`：
    - 新增 `getResourcesForServer()`
    - 新增 `readResource()`
    - 对单个 server 的资源 discover 失败做 warn + 空数组降级
  - 升级 `src/tools/runtime/BuiltinToolsRuntime.ts` 与
    `src/core/chat/services/create-chat-service-deps.ts`：
    - 将 chat runtime 持有的 `mcpManager` 注入 builtin runtime
    - 在 `builtinCoreToolsEnabled !== false` 且存在 `mcpManager` 时注册
      `createMcpResourceTools(...)`
  - 新增 `src/tools/mcp/resources/resources-step20.test.ts`，覆盖 Step 20 的 schema、
    “先列后读”服务闭环与 builtin runtime 接线
- 已完成 Step 20 定向验证：
  - `npx tsx --test`
    `src/tools/mcp/resources/resources-step20.test.ts`
    `src/domains/mcp/mcp-resources.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - 使用
    `rg "src/(tools/mcp/resources|domains/mcp/(mcp-resources.test|mcp.test|runtime/protocol-client|runtime/runtime-manager|types)|tools/runtime/BuiltinToolsRuntime|core/chat/services/create-chat-service-deps)"`
    二次筛查确认以下文件未出现新增类型错误：
    `src/tools/mcp/resources/**`
    `src/domains/mcp/types.ts`
    `src/domains/mcp/runtime/protocol-client.ts`
    `src/domains/mcp/runtime/runtime-manager.ts`
    `src/domains/mcp/mcp-resources.test.ts`
    `src/domains/mcp/mcp.test.ts`
    `src/tools/runtime/BuiltinToolsRuntime.ts`
    `src/core/chat/services/create-chat-service-deps.ts`
- Step 20 额外修正说明：
  - `mcp.test.ts` 中原有 coordinator / 状态监听测试在当前类型检查下需要补显式断言，
    已一并修到通过定向 `tsc` 筛查
  - 初版 `readResource()` 使用 `flatMap()` 时触发 union 推断不稳定，
    已改为显式数组累积，避免新增类型噪声
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 21
- 已执行路线图 Step 21：
  - 新增 Canvas 工具目录：
    `src/tools/canvas/read-canvas/**`
    `src/tools/canvas/edit-canvas/**`
    `src/tools/canvas/canvas-tools.ts`
  - 新增 `src/tools/canvas/_shared/canvas-document.ts`，负责：
    - Canvas JSON 解析与结构校验
    - 节点/连线只读视图与布局摘要构建
    - 结构化节点、位置、连线编辑操作应用
  - 新增 `read_canvas`：
    - 只接受 `.canvas` 文件路径
    - 返回 `summary`、`nodes`、`edges`
    - `summary` 包含节点数、连线数、节点类型分布与 bounds
  - 新增 `edit_canvas`：
    - 支持 `add_node` / `update_node` / `move_node` / `remove_node`
    - 支持 `add_edge` / `update_edge` / `remove_edge`
    - 删除节点时可通过 `remove_connected_edges` 控制是否一并清理关联边
    - 删除类操作已接入确认流
  - 升级 `src/tools/runtime/BuiltinToolsRuntime.ts`，在 core builtin 工具集接入
    `createCanvasTools(options.app)`
  - 新增 `src/tools/canvas/canvas-step21.test.ts`，覆盖：
    - Step 21 schema 的读写分离边界
    - 纯 helper 的 Canvas 摘要与结构化编辑闭环
    - runtime 已接入 Canvas 工具工厂的源码断言
- 已完成 Step 21 定向验证：
  - `npx tsx --test src/tools/canvas/canvas-step21.test.ts`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - 使用 `rg "src/(tools/canvas|tools/runtime/BuiltinToolsRuntime)"`
    二次筛查确认以下文件未出现新增类型错误：
    `src/tools/canvas/**`
    `src/tools/runtime/BuiltinToolsRuntime.ts`
- Step 21 额外修正说明：
  - 初版 Canvas helper 将 `nodes` / `edges` 标成只读，和结构化编辑流程冲突，
    已调整为可变数组以匹配编辑语义
  - 两个 description 中的 \`.canvas\` 文案初版存在未转义反引号，
    已修到通过定向 `tsc` 筛查
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 22
- 已执行路线图 Step 22：
  - 新增 Integration 定向测试：
    `src/tools/integration/dataview-step22.test.ts`
  - 确认 `src/tools/integration/dataview-query/**` 已形成完整单工具目录：
    - `description.ts`
    - `schema.ts`
    - `service.ts`
    - `tool.ts`
  - 确认 `src/tools/integration/integration-tools.ts` 已把 Dataview 作为可选集成域接入，
    并在插件缺失时返回空工具数组
  - 确认 `src/tools/runtime/BuiltinToolsRuntime.ts` 已注册 `createIntegrationTools(options.app)`
  - 确认 `dataview_query` 的只读边界：
    - 只暴露查询文本、上下文文件路径与结果预览裁剪参数
    - 未安装 Dataview 时不暴露，并在直调路径返回清晰不可用原因
    - 查询结果与 Markdown 预览都会按上限截断，避免超大返回体
- 已完成 Step 22 定向验证：
  - `npx tsx --test src/tools/integration/dataview-step22.test.ts`
  - `npm run build`
- 已执行 `npx tsc --noEmit` 定向筛查：
  - 使用 `grep -E "src/tools/integration/(dataview-step22|dataview-query|integration-tools)|src/tools/runtime/BuiltinToolsRuntime"`
    过滤 `npx tsc --noEmit` 输出，结果未命中以下文件的新增类型错误：
    `src/tools/integration/dataview-step22.test.ts`
    `src/tools/integration/dataview-query/**`
    `src/tools/integration/integration-tools.ts`
    `src/tools/runtime/BuiltinToolsRuntime.ts`
- Step 22 额外说明：
  - 路线图文案写的是 `src/tools/integrations/dataview-query/**`，但仓库现有域目录约定是
    `src/tools/integration/**`；本轮保持既有单数目录，不额外制造结构分叉
  - 当前 Node 测试环境没有真实 Dataview 插件，因此验证采用 fake Dataview API，
    覆盖 capability gating、执行结果与 runtime 接线，不依赖外部插件安装
- 下一步应执行：
  - `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 23

## 2026-04-02 路线图 Step 23

- 已执行最终收口与发布准备：
  - 更新 `docs/architecture.md`，补 builtin runtime 的事实来源、当前注册范围与工具调用流
  - 新增 ADR：`docs/decisions/2026-04-02-builtin-tool-runtime-catalog.md`
  - 新增 release note：`docs/releases/2026-04-02-builtin-tool-migration.md`
  - 更新 `docs/designs/2026-04-02-builtin-tool-architecture-upgrade.md` 顶部状态，
    去掉已经失真的“提议中”标记
- 已完成 Step 23 的现状核对：
  - 复核 `src/tools/runtime/BuiltinToolsRuntime.ts`，确认 4 月 2 日新增工具都已接入 builtin runtime
  - 复核 `src/core/chat/services/chat-tool-discovery-blueprints.ts`，确认中央蓝图已退回
    legacy bridge / override / non-BuiltinTool 例外角色
  - 复核 `src/tools/vault/filesystemSearchHandlers.ts`，确认 `search_content` /
    `query_index` 仍是当前唯一剩余的 builtin legacy island
- 已完成最终回归：
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- Step 23 收口说明：
  - 当前 builtin runtime 与新增工具范围已经稳定，可以进入发布准备
  - 若要求严格兑现“整条迁移链全部迁入单工具目录”，仍需回到 Step 07

## 下一步

- 路线图的最终收口步骤已完成。
- 如果下一轮目标是严格补齐遗留迁移缺口，应回到
  `docs/designs/2026-04-02-builtin-tool-codex-roadmap.md` 的 Step 07。
- 如果接受当前唯一的 Step 07 legacy 例外，下一步可以进入真实 Obsidian 手工 smoke test
  与发布准备。
