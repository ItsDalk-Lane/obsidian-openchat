# pi-subagents 阻塞项

## 内置角色数量与任务书不一致

- 任务书写“8 个内置角色”，但已安装的 `pi-subagents@0.37.2` 源码常量列出 9 个：`advisor`、`context-builder`、`delegate`、`oracle`、`planner`、`researcher`、`reviewer`、`scout`、`worker`（`node_modules/pi-subagents/src/agents/agents.ts:37-47`）。
- 包根 `node_modules/pi-subagents/agents/*.md` 实际也有 9 个文件。
- 影响：不能在不违背当前依赖源码的情况下把 UI 固定为 8 个。继续做不受影响部分，UI 按实际发现结果动态展示 9 个；角色产品口径留给管理者确认。

## 兼容目录超出 README 情报

- 源码除任务书所述目录外，还读取用户兼容目录 `~/.agents` 和项目兼容目录 `<项目根>/.agents`（`node_modules/pi-subagents/src/agents/agents.ts:1493-1506,1537-1566`）。
- 影响：列表必须把这些现有文件纳入 user/project 域，避免用户已有配置“消失”；新写入仍使用源码返回的首选目录。
