# CLAUDE.md — Obsidian Plugin Harness (Table of Contents)

> **文档定位**
> 本文件是当前项目的长期项目指令文件，供 Claude Code 及其他 AI 编程代理
> 持续使用。除非用户明确提出一次性临时要求，本文件中的规则视为长期有效
> 的项目约束与协作规范。在不违反系统或平台级规则的前提下，涉及本项目的
> 代码生成、修改、审查与建议，应优先遵循本文件及其引用的 docs/ 子文档。

- 保持此文件在 ~100 行以内，它是地图，不是百科全书
- 深层的规范和上下文全部在 docs/ 目录中。

## 项目身份

- Obsidian 插件，TypeScript，完全由 AI 维护和开发
- 仓库是唯一的事实来源（Single Source of Truth）
- 如果信息不在仓库里，对 AI 来说它就不存在

## 快速命令

```bash
npm install          # 安装依赖
npm run build        # 构建插件
npm run dev          # 开发模式（热重载）
npm run test         # 运行全部测试
npm run lint         # 运行 linter（含架构约束检查）
npm run lint:arch    # 仅运行架构依赖方向检查
npm run lint:taste   # 仅运行品味不变量检查（命名、日志、文件大小）
npm run cleanup      # 运行垃圾回收（检测漂移、过期文档、死代码）
```

### 构建验证规则（强制）

- 🚫 验证阶段**严禁**依赖 `npm run dev` 或监听模式替代真实 Obsidian 环境中的 build 产物验证
- ✅ 必须通过 `npm run build` 产生产物后，在真实 Obsidian 环境中验证
- ✅ 信任 Obsidian 自身的调试能力，不引入外部浏览器测试框架

## 架构概览

采用分域分层架构。每个业务域内部遵循固定的依赖方向：

```text
Types → Config → Service → UI
```

跨域关注点（设置、Obsidian API 封装、事件总线）通过 Providers 注入。  
详细规则见 → `docs/architecture.md`

## 目录结构

```text
src/
├── domains/              # 业务域（每个功能一个域）
│   └── <domain-name>/
│       ├── types.ts      # 该域的类型定义（Types 层）
│       ├── config.ts     # 该域的配置与默认值（Config 层）
│       ├── service.ts    # 该域的业务逻辑（Service 层）
│       ├── ui.ts         # 该域的 UI 组件（UI 层）
│       ├── <domain>.test.ts
│       └── <domain>.spec.md   # 行为规格说明
├── providers/            # 跨域关注点的显式接口
├── infra/                # 构建、linter、结构测试
│   ├── lint-arch.ts      # 架构依赖方向检查器
│   ├── lint-taste.ts     # 品味不变量检查器
│   └── cleanup.ts        # 垃圾回收脚本
├── main.ts               # 入口，仅注册和初始化
docs/
├── architecture.md       # 分层架构规则 + 依赖图 + 约束
├── golden-principles.md  # 黄金原则（机械化规则）
├── quality-grades.md     # 各域和各层的质量评分
├── designs/              # 功能设计文档（每个功能一个）
│   └── <feature>.md
├── plans/                # 执行计划
└── decisions/            # 架构决策记录（ADR）
```

## 核心原则（摘要）

1. 约束即加速器——约束解空间让 AI 更高效，不是更慢
2. 机械化执行优于文档约定——值得写下的规则就值得用 linter 强制执行
3. 仓库即唯一真相——所有知识必须在仓库内可发现
4. 当 AI 犯错，修环境不是"重试"——诊断缺了什么（工具/护栏/文档），补进仓库
5. 持续偿还技术债——垃圾回收比集中清理更有效
6. 无聊技术优先——可组合、API 稳定、训练数据中表示充分的技术

详细版 → `docs/golden-principles.md`

## 禁令（全局强制）

详细禁令清单 → `docs/golden-principles.md` § 禁止事项

摘要：不在 main.ts 写业务逻辑、不混合职责、不直接操作 DOM、
不绕过构建验证、不引入浏览器测试框架、不手动改构建产物。

## Obsidian 特定文件保护

`manifest.json`、`main.js`、`styles.css`、`data.json` 由构建管线
或 Obsidian 运行时管理，不得手动编辑或删除。详见 → `docs/golden-principles.md` §文件保护

## 补充文档指针

| 文档                          | 用途                                   |
| ----------------------------- | -------------------------------------- |
| `docs/architecture.md`        | 分层架构、依赖方向、文件尺寸规则       |
| `docs/golden-principles.md`   | 编码品味、命名、错误处理、性能         |
| `docs/quality-grades.md`      | 质量评分记录                           |
| `docs/garbage-collection.md`  | 垃圾回收与提交前检查清单               |
| `docs/cross-platform.md`      | 跨平台开发规范（Windows/macOS）        |
| `docs/debugging.md`           | 调试信息管理与 DebugLogger 规范        |
| `docs/i18n.md`                | 双语（中/英）支持规范                  |
| `docs/plans/refactor-plan.md` | 重构执行计划                           |
| `docs/spec-guide.md`          | 域行为规格（spec.md）编写指南与模板    |

## 工作流程

1. 接到任务 → 先读相关的 docs/ 和 spec.md
2. 理解上下文 → 制定计划
3. 执行变更 → 写代码 + 写/更新测试
4. 运行 `npm run lint` + `npm run test` 验证
5. 如果新增了域或改了架构 → 更新 `docs/architecture.md`
6. 如果改了行为 → 更新对应的 `spec.md`
