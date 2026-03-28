# docs/golden-principles.md — 黄金原则

## 什么是黄金原则

黄金原则是一组 **有态度的、可机械化执行的规则**，
用于保持代码库对未来 AI 会话的可读性和一致性。

AI 会复制仓库中已有的模式——包括不好的模式。
随时间推移，这必然导致漂移。
黄金原则的作用是：人类的品味捕获一次，然后在每一行代码上持续强制执行。

---

## 原则 1：仓库是唯一真相来源

- 所有知识必须存在于仓库内的版本化产物中（代码、markdown、schema）
- 如果一个架构决策是在对话中做出的，它必须被记录到 docs/decisions/ 中
- 任何 AI 无法在仓库中发现的信息，等于不存在

## 原则 2：约束优于自由

- 约束解空间让 AI 更高效，不是更慢
- 值得写进文档的规则就值得用 linter 强制执行
- 自定义 lint 的错误信息本身就是修复指导——把修复方法注入 AI 的上下文中

## 原则 3：当 AI 犯错，修环境

- 当 AI 遇到困难，修复方法几乎不是"重试"
- 诊断缺了什么：工具？护栏？文档？抽象？
- 把缺失的能力补到仓库里，让 AI 自己写修复

## 原则 4：无聊技术优先

- 优先选择可组合的、API 稳定的、在训练数据中有充分表示的技术
- 如果外部库行为不透明，自己重新实现一个轻量版可能更好
  （紧密集成、完全可理解、无隐式行为）
- 避免"魔法"框架——AI 无法推理它看不见的隐式行为

## 原则 5：显式重复优于隐式耦合

- 如果两段逻辑各自独立更容易理解，允许它们重复
- 过度的 DRY 引入抽象耦合，降低 AI 对单个功能的独立理解能力
- 只有当共享逻辑真正代表一个不变量（invariant）时，才提取到 providers/

## 原则 6：合同式注释

每个文件顶部的结构化文件头：

```typescript
/**
 * @module domain-name/layer
 * @description 一句话描述职责
 *
 * @dependencies 显式列出导入的模块
 * @side-effects 列出所有副作用（DOM 操作、文件写入、事件注册等）
 * @invariants 列出不变量（什么是这个模块永远不会做的事）
 */
````

每个导出函数的合同式注释：

```typescript
/**
 * @precondition  调用前必须满足的条件
 * @postcondition 调用后保证成立的条件
 * @throws        从不抛出 / 或列出可能的异常
 * @example       一个输入输出示例
 */
```

## 原则 7：测试即可执行的行为规范

- 每个导出函数必须有对应测试
- 测试覆盖：正常路径 + 边界情况 + 错误路径
- 测试组织像行为文档一样可读（describe 嵌套按场景分组）
- 如果行为无法通过测试表达（如 UI），在 `<domain>.spec.md` 中文字描述

## 原则 8：设置的非破坏性演进

- Settings 结构必须包含 `version: number` 字段
- 每次变更 Settings 结构，必须实现显式迁移函数
- 旧数据必须能被新版本正确读取

## 原则 9：清洁的生命周期

- `main.ts` 的 `onload()` 只做注册，不含业务逻辑
- 每个域暴露 `register(plugin, providers): cleanup` 函数
- `onunload()` 调用所有域的 cleanup
- 所有事件监听、DOM 元素、定时器必须在卸载时清理

---

## 代码风格（机械化执行）

### 类型系统

- 所有函数必须有完整的参数类型和返回值类型标注
- 使用 Discriminated Unions 表达状态和分支
- 禁止 `any`；Obsidian API 返回 any 时立即断言为具体类型

### 函数设计

- 每个函数只做一件事
- 参数超过 3 个时使用具名选项对象
- 禁止布尔参数（用具名选项替代）
- 纯函数优先；有副作用在函数名中体现

### 错误处理

- 使用 Result<T, E> 模式处理可预期错误
- 只在真正异常时用 try-catch
- 每个错误携带足够的上下文信息
- 为每个域定义具体的错误类型（discriminated union）

### 禁止事项

- ❌ any 类型
- ❌ barrel exports（index.ts re-export）
- ❌ 装饰器（decorator）
- ❌ 超过一层的自定义继承（继承 Obsidian 基类可以，不要再往下继）
- ❌ console.log（使用项目日志工具）
- ❌ 超过 2 层的 Promise 链（用 async/await）
- ❌ 模糊命名的文件（utils.ts / helpers.ts / common.ts）
- ❌ 未更新 docs/ 就新增功能域
- ❌ 禁止添加浏览器测试相关代码（如 Puppeteer, Playwright, Cypress）
- ❌ 禁止手动配置 sourcemap（交由构建工具自动处理）
- ❌ 禁止绕过构建验证规则（见上方"构建验证规则"）
- ❌ 不要在 `main.ts` 中编写具体的业务逻辑
- ❌ 不要在一个文件中混合多种职责
- ❌ 不要直接操作 DOM，使用 Obsidian 提供的 API
- ❌ 不要忽略错误处理和用户反馈
- ❌ 不要绕过构建、测试与调试约束

## Obsidian 插件性能准则

### onload() 性能（强制）

- `onload()` 必须在 **100ms 以内**完成。耗时操作（文件扫描、网络请求、
  大量数据加载）必须延迟到 `onLayoutReady` 回调或首次使用时触发。
- 禁止在 `onload()` 中执行同步阻塞操作。

### 资源生命周期

- 所有 `registerEvent()`、`registerInterval()`、`registerDomEvent()` 必须
  通过 `this.register()` 或 `this.registerEvent()` 绑定到插件生命周期，
  确保 `onunload()` 时自动清理。
- 手动创建的 `setTimeout`、`setInterval`、`MutationObserver`、
  `ResizeObserver` 必须在 `onunload()` 中显式清理。
- 禁止出现"注册了但不清理"的孤立监听器。

### 大数据处理

- 超过 1000 条记录的批量操作必须使用 `requestIdleCallback` 或分批处理，
  避免阻塞 UI 线程。
- 文件读写操作必须使用 `async/await`，禁止使用同步 fs API。

## Obsidian API 兼容性

- 代码必须兼容当前 Obsidian **稳定版**的 API，不依赖 Insider Build 专属功能
- 只使用 `obsidian` 模块的公开导出，**禁止**访问 `app.internalPlugins`、
  `app.plugins.plugins` 等私有/未文档化属性
- 使用私有 API 的临时方案必须标注 `// HACK:` 并记录移除条件
- `manifest.json` 中的 `minAppVersion` 必须与实际使用的最低 API 版本一致
