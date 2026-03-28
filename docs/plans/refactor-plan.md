# 重构执行计划

## 阶段一：搭建 Harness 基础设施（先建环境，再迁代码）

### 步骤 2：建立机械化执行工具

- 实现 infra/lint-arch.ts：扫描 import 语句，验证依赖方向
  - 错误信息必须包含修复指导（这是关键——lint 错误信息即 AI 的学习材料）
- 实现 infra/lint-taste.ts：命名规范、文件大小、no-any、no-console 等
- 实现 infra/arch.test.ts：结构测试
- 将以上集成到 npm scripts 和 CI

### 步骤 3：建立 Providers

- 创建 providers/obsidian-api.ts：Obsidian API 的类型安全薄封装
- 创建 providers/settings.ts：设置读写接口
- 创建 providers/event-bus.ts：域间通信（如果需要）
- 创建 providers/providers.types.ts：接口定义

## 阶段二：分析现有代码

### 步骤 4：生成分析报告

- 阅读当前全部代码
- 列出所有功能点 → 映射为未来的域（domains）
- 识别当前的依赖关系（谁导入了谁）
- 识别问题：过深抽象、隐式依赖、模糊命名、巨型文件、隐式全局状态
- 将分析结果写入 docs/plans/refactor-analysis.md

## 阶段三：逐域迁移

### 步骤 5：逐个域迁移（每个域重复以下流程）

1. 创建 `domains/<name>/` 目录结构（types.ts, config.ts, service.ts, ui.ts）
2. 将相关代码迁入，按层拆分
3. 将 Obsidian API 直接调用替换为 providers/ 调用
4. 消除不必要的抽象层（扁平化）
5. 补充完整类型标注
6. 添加合同式注释（文件头 + 函数级）
7. 写 `<domain>.spec.md`（行为规格说明）
8. 补充/迁移测试到 `<domain>.test.ts`
9. 运行 lint:arch + lint:taste + test，确保零违规
10. 更新 docs/architecture.md 的依赖图

## 阶段四：验证与评分

### 步骤 6：全局验证

- 全量构建 `npm run build` 通过
- 全量测试 `npm run test` 通过
- 全量 lint `npm run lint` 零违规
- docs/architecture.md 与实际代码完全一致
- 删除所有旧文件和死代码

### 步骤 7：质量评分

- 为每个域填写 docs/quality-grades.md 评分
- 运行 docs/garbage-collection.md 中的清理检查项
- 记录已知的技术债和改进空间

### 步骤 8：最终验证

- 确认插件在 Obsidian 中正常加载、运行、卸载
- 确认 CLAUDE.md 中的所有指针指向真实存在的文件
- 确认任何一个新的 AI 会话，只靠 CLAUDE.md 就能找到所有需要的上下文
