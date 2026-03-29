# quick-actions 域规格

## 目标

- 承载快捷操作的 Markdown 持久化、嵌套分组约束与 AI 执行逻辑
- 通过 `ObsidianApiProvider` 访问 Vault、系统提示词与通知能力
- 为 editor/settings 壳层提供最小 service 接缝，旧路径仅保留 shim

## 分层

- `service-data.ts`
  - 负责 `quick-actions/*.md` 的读取、写入、删除与运行时同步
- `service-execution.ts`
  - 负责模板解析、系统提示词拼装与 provider 请求组装
- `service-data-utils.ts`
  - 负责 frontmatter 解析、标准化与 Markdown 记录组装
- `service-group-helpers.ts`
  - 负责嵌套层级、拓扑校验与顶层排序

## 约束

- 不直接导入 `obsidian`
- 宿主能力只能通过 `src/providers/providers.types.ts` 中的 `ObsidianApiProvider`
- `src/editor/selectionToolbar/*` 中迁出的旧路径只保留 re-export shim
