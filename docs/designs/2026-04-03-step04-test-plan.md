# Step 04 最小测试策略：本地 Skill CRUD 操作

## 背景

- **Step 02 基础**：`LocalVaultSkillSource` 已实现扫描与读取
- **Step 03 基础**：`SkillRegistry` + `SkillScannerService` facade 已就位
- **Step 04 目标**：仅限本地 Skill 的 create/update/remove/setEnabled
- **不包含**：设置页 UI、执行器、会话态

---

## 1. 保留不动的现有测试

### 1.1 `skills.test.ts` 中保留的测试

以下测试已经覆盖了 **只读路径**，不应在 Step 04 中修改：

✅ **保留**：`SkillScannerService 扫描并缓存有效技能`

- 覆盖：扫描、缓存、`findByName` 查询
- 原因：Step 04 不改读取逻辑

✅ **保留**：`SkillRegistry 统一快照查询并保留重复名称 warning`

- 覆盖：Registry 快照、去重、`findById`/`findByName`
- 原因：Registry 查询逻辑无需变更

✅ **保留**：`SkillScannerService 对重复技能名保留 warning 并覆盖旧定义`

- 覆盖：重复名称处理
- 原因：只读行为

✅ **保留**：所有 parser 相关测试

- `parseSkillMetadata` 的各种 frontmatter 解析场景
- `stripSkillFrontmatter` 逻辑
- 原因：Step 04 只写入，不改解析规则

---

## 2. 应新增的最小测试清单

### 2.1 create 操作测试（4 个）

| 测试名称 | 覆盖场景 | 断言重点 |
|---------|---------|---------|
| `createSkill 应创建目录和 SKILL.md 文件` | 基础创建流程 | 1) 调用 `ensureVaultFolder(basePath)`<br>2) 调用 `writeVaultFile(SKILL.md, 完整内容)`<br>3) frontmatter 包含 name, description, enabled<br>4) 正文包含传入的 bodyContent |
| `createSkill 应生成完整 frontmatter 结构` | frontmatter 完整性 | when_to_use、arguments、execution、allowed_tools 都正确序列化 |
| `createSkill 应拒绝重复名称` | 防重复创建 | 1) 先 scan 一次<br>2) 再 create 同名 skill 应抛异常 |
| `createSkill 应自动启用新 Skill` | 默认行为 | frontmatter.enabled 默认为 true |

### 2.2 update 操作测试（3 个）

| 测试名称 | 覆盖场景 | 断言重点 |
|---------|---------|---------|
| `updateSkill 应保留原有 frontmatter 和 body` | 部分更新 | 只修改 description，其他字段（name, when_to_use, arguments）不变 |
| `updateSkill 应能更新 execution 和 allowed_tools` | 复杂字段更新 | YAML 序列化正确，格式符合 Obsidian 风格 |
| `updateSkill 应拒绝修改不存在的 Skill` | 错误处理 | skill 不存在时抛异常 |

### 2.3 remove 操作测试（3 个）

| 测试名称 | 覆盖场景 | 断言重点 |
|---------|---------|---------|
| `removeSkill 应删除整个 Skill 目录` | 完整删除 | 调用 `deleteVaultPath(basePath)`，而非只删 SKILL.md |
| `removeSkill 应拒绝删除不存在的 Skill` | 错误处理 | skill 不存在时抛异常 |
| `removeSkill 后 registry 快照应同步更新` | 缓存一致性 | 1) create skill<br>2) scan<br>3) remove skill<br>4) refresh registry<br>5) findByName 返回 undefined |

### 2.4 setEnabled 操作测试（3 个）

| 测试名称 | 覆盖场景 | 断言重点 |
|---------|---------|---------|
| `setEnabled 应只修改 frontmatter.enabled 字段` | 精确更新 | 1) 读原文件<br>2) 只改 enabled: true/false<br>3) 其他 frontmatter 和 body 完全不变 |
| `setEnabled 应支持 true ↔️ false 双向切换` | 启停切换 | 1) false → true<br>2) true → false<br>3) 每次都验证文件内容 |
| `setEnabled 应拒绝操作不存在的 Skill` | 错误处理 | skill 不存在时抛异常 |

### 2.5 跨操作集成测试（2 个）

| 测试名称 | 覆盖场景 | 断言重点 |
|---------|---------|---------|
| `create → update → setEnabled → remove 完整流程` | CRUD 生命周期 | 1) create<br>2) update description<br>3) setEnabled(false)<br>4) scan 确认 enabled=false<br>5) remove<br>6) scan 确认不存在 |
| `并发 refresh 时不应重复写入` | 防竞态 | 利用 `refreshPromise` 复用机制，确保多次调用只触发一次 scan |

---

## 3. 各操作最值得锁定的兼容行为

### 3.1 create

| 兼容行为 | 为什么重要 | 测试方式 |
|---------|-----------|---------|
| **自动创建目录** | 用户不需要手工建文件夹 | mock `ensureVaultFolder`，断言调用参数 |
| **frontmatter 格式稳定** | 向下兼容旧 parser | 写入后能被 `parseSkillMetadata` 解析回原值 |
| **防重复名称** | 保证 `findByName` 唯一性 | 断言抛异常 |
| **模板正文可自定义** | 支持空正文 / 自定义模板 | 传入不同 bodyContent，验证写入结果 |

### 3.2 update

| 兼容行为 | 为什么重要 | 测试方式 |
|---------|-----------|---------|
| **保留手工编辑的字段** | 不丢失用户自定义内容 | 读原文件，部分更新，断言未更新字段不变 |
| **YAML 数组/对象格式** | 兼容 Obsidian 渲染 | arguments: `[{name, description}]` 保持多行格式 |
| **不改 skill 路径** | basePath 和 skillFilePath 是不可变标识 | 断言调用 `writeVaultFile` 的路径参数与原文件一致 |

### 3.3 remove

| 兼容行为 | 为什么重要 | 测试方式 |
|---------|-----------|---------|
| **删除整个目录** | 连带删除 assets、附件 | 断言调用 `deleteVaultPath(basePath)` 而非 `skillFilePath` |
| **registry 立即失效** | 避免悬空引用 | remove 后调用 `registry.refresh()`，断言 `findByName` 返回 undefined |
| **不删除其他 skill** | 隔离性 | 创建多个 skill，删除一个，其他仍可查询 |

### 3.4 setEnabled

| 兼容行为 | 为什么重要 | 测试方式 |
|---------|-----------|---------|
| **只改 enabled 字段** | 不触发意外的文件变更 | 逐字节对比其他 frontmatter 和 body |
| **幂等性** | 重复调用不出错 | setEnabled(true) 两次，文件内容一致 |
| **立即生效** | refresh 后查询到新状态 | 1) setEnabled<br>2) refresh<br>3) `findByName().metadata.enabled` 为预期值 |

---

## 4. 如何模拟 provider 写文件/删目录

### 4.1 扩展现有 `createFakeProvider`

在 `skills.test.ts` 中已有 `createFakeProvider`，需扩展以下能力：

```typescript
interface FakeProviderOptions {
  // ... 现有 options
  onWriteFile?: (path: string, content: string) => void;  // 新增
  onDeletePath?: (path: string) => void;                 // 新增
}

function createFakeProvider(options?: FakeProviderOptions): SkillsRuntimeHostPort & {
  // ... 现有方法
  writeVaultFile(path: string, content: string): Promise<void>;  // 新增
  deleteVaultPath(path: string): Promise<void>;                 // 新增
  getWrittenFiles(): Map<string, string>;                       // 新增工具方法
  getDeletedPaths(): string[];                                  // 新增工具方法
}
```

### 4.2 实现写入 mock

```typescript
// 内存存储
const writtenFiles = new Map<string, string>();
const deletedPaths: string[] = [];

async writeVaultFile(path: string, content: string): Promise<void> {
  const normalized = this.normalizePath(path);
  writtenFiles.set(normalized, content);
  files.set(normalized, content);  // 同步更新可读内容
  options?.onWriteFile?.(normalized, content);
}

async deleteVaultPath(path: string): Promise<void> {
  const normalized = this.normalizePath(path);
  deletedPaths.push(normalized);
  
  // 删除目录下所有文件
  for (const [key] of files) {
    if (key === normalized || key.startsWith(`${normalized}/`)) {
      files.delete(key);
    }
  }
  for (const [key] of folders) {
    if (key === normalized || key.startsWith(`${normalized}/`)) {
      folders.delete(key);
    }
  }
  
  options?.onDeletePath?.(normalized);
}
```

### 4.3 测试示例

```typescript
test('createSkill 应写入正确的文件内容', async () => {
  const provider = createFakeProvider({ folders: { ... } });
  const source = new LocalVaultSkillSource(provider, { getAiDataFolder: () => 'AI Data' });
  
  await source.createSkill({
    name: 'test-skill',
    description: 'A test skill',
    bodyContent: 'This is the skill body.',
  });
  
  const written = provider.getWrittenFiles();
  assert.equal(written.size, 1);
  
  const content = written.get('AI Data/skills/test-skill/SKILL.md');
  assert.ok(content?.includes('name: test-skill'));
  assert.ok(content?.includes('description: A test skill'));
  assert.ok(content?.includes('enabled: true'));
  assert.ok(content?.includes('This is the skill body.'));
});
```

---

## 5. 哪些测试不要在这一步做

### 5.1 ❌ 不做 UI 测试

- **原因**：Step 04 只做底层 CRUD，Step 06-08 才做设置页
- **例子**：不测试"点击删除按钮"、"模态框表单提交"

### 5.2 ❌ 不做执行器测试

- **原因**：Step 10-12 才做执行器
- **例子**：不测试 `invoke_skill` 工具调用、`/skill` slash command

### 5.3 ❌ 不做会话态测试

- **原因**：Step 09 才引入 `SkillSessionState`
- **例子**：不测试"主任务帧"、"返回包"、"上下文隔离"

### 5.4 ❌ 不做远程 skill source 测试

- **原因**：Step 04 只实现 `LocalVaultSkillSource` 的写操作
- **例子**：不测试"GitHub skill marketplace"、"HTTP skill registry"

### 5.5 ❌ 不做权限/冲突检测

- **原因**：超出最小范围，留给 Step 14 或后续迭代
- **例子**：不测试"只读 Vault"、"文件系统权限错误"、"并发写入冲突"

### 5.6 ❌ 不做 Obsidian API 真实环境测试

- **原因**：单元测试用 fake provider，真实环境验证留给 E2E 或手工测试
- **例子**：不在 Obsidian 插件沙盒里执行测试

### 5.7 ❌ 不做性能测试

- **原因**：Step 04 优先功能正确性
- **例子**：不测试"创建 1000 个 skill 的耗时"

---

## 6. 验收清单

### 6.1 代码完成标志

- [ ] `LocalVaultSkillSource` 新增 4 个方法：
  - `createSkill(params: CreateSkillParams): Promise<SkillDefinition>`
  - `updateSkill(skillId: SkillId, updates: SkillUpdates): Promise<void>`
  - `removeSkill(skillId: SkillId): Promise<void>`
  - `setEnabled(skillId: SkillId, enabled: boolean): Promise<void>`
- [ ] `SkillSource` 接口扩展（如需要的话，或只在 LocalVaultSkillSource 实现）
- [ ] 类型定义：`CreateSkillParams`、`SkillUpdates` 加入 `types.ts`

### 6.2 测试完成标志

- [ ] 15 个新增测试全部通过（4 + 3 + 3 + 3 + 2）
- [ ] 现有只读测试 0 个失败
- [ ] 测试覆盖率：source.ts 写操作部分达到 80%+
- [ ] `npm test` 一次性通过，耗时不超过现有基准 + 20%

### 6.3 文档完成标志

- [ ] `docs/designs/2026-04-03-skill-system-codex-roadmap.md` Step 04 标记为"已完成"
- [ ] `task_plan.md` 更新进度
- [ ] `findings.md` 记录实现中的关键决策（如 frontmatter 序列化格式）
- [ ] `progress.md` 记录"下一步应执行 Step 05"

---

## 7. 实施建议

### 7.1 TDD 顺序

1. **先写 create 测试** → 实现 → 通过
2. **再写 setEnabled 测试** → 实现 → 通过（最简单，只改一个字段）
3. **再写 update 测试** → 实现 → 通过（复杂度中等）
4. **再写 remove 测试** → 实现 → 通过（需要清理缓存逻辑）
5. **最后写集成测试** → 验证整体流程

### 7.2 Mock 策略

- **优先用 fake provider**：扩展现有 `createFakeProvider`，而非引入新的 mock 库
- **验证调用参数**：不只验证结果，也验证 `writeVaultFile` / `deleteVaultPath` 的参数
- **模拟边界情况**：YAML 解析失败、文件写入失败（throw Error）

### 7.3 边界值测试重点

| 边界情况 | 测试场景 |
|---------|---------|
| 空正文 | create 时 bodyContent = '' |
| 超长 description | description 长度 = MAX_SKILL_DESCRIPTION_LENGTH |
| 特殊字符 | skill name 包含 `-`、`_` |
| 嵌套数组 | arguments 有 3 层嵌套（验证 YAML 序列化） |

---

## 8. 成功标志

当以下条件**全部满足**时，Step 04 验收通过：

1. ✅ 所有 15 个新测试通过
2. ✅ 所有现有测试仍然通过（0 regression）
3. ✅ 可以通过测试证明：create → scan → update → scan → setEnabled → scan → remove → scan 整个生命周期
4. ✅ fake provider 的 `getWrittenFiles()` 和 `getDeletedPaths()` 正确追踪了所有写操作
5. ✅ `npm run lint` 无新增违规
6. ✅ 无 TODO 注释残留在新增代码中
7. ✅ roadmap 文档、task_plan.md、progress.md 已更新

---

**下一步**：执行 Step 05（让现有 service.ts / ui.ts 接入新主干）
