# 跨平台开发规范

> 本插件必须同时支持 Windows 和 macOS 开发与运行环境。
> 所有代码、脚本、构建流程必须在两个平台上表现一致。

## 核心原则

- 优先使用 Node.js 和 Obsidian 官方提供的跨平台 API
- 禁止依赖仅限 Windows 或仅限 macOS 的命令、Shell 写法或系统特性
- 文件监听、路径拼接、换行符处理必须同时兼容 Windows 和 macOS

---

## 路径处理（强制）

### 必须遵守

- 所有路径拼接通过 `path.join()` 或 `path.resolve()` 完成
- 禁止在源码、脚本、配置中硬编码反斜杠 `\\` 或正斜杠 `/` 作为路径分隔符
- 禁止依赖 Windows 盘符（`C:\\`）、`%USERPROFILE%`、`AppData` 等平台专属路径
- 读写文本文件时必须显式指定 `utf8` 编码
- 统一使用 `\n` 作为换行符，禁止混用 `\r\n`

### 大小写敏感

- macOS 默认大小写不敏感但保留大小写，可配置为大小写敏感
- **必须按大小写敏感环境编写代码**，不得假设文件系统大小写不敏感
- `import` 路径的大小写必须与真实文件名**完全一致**
- 重命名文件时必须检查大小写变更在 Git 和不同文件系统下是否可正确识别

### 重点排查场景

- `import './Utils'` 与真实文件 `utils.ts` 大小写不一致
- 脚本中使用 `C:\\`、`%USERPROFILE%`、`AppData` 等 Windows 专属路径
- 使用字符串截取路径而非调用 `path` 模块
- 构建产物复制、插件目录定位依赖单一平台目录结构

---

## 脚本编写

### 推荐做法

```typescript
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

// ✅ 跨平台路径拼接
const outputPath = path.join(distDir, 'build-info.json');

// ✅ 平台识别（仅在确有必要时）
const platformMap: Record<string, string> = {
    darwin: 'macOS',
    win32: 'Windows',
    linux: 'Linux',
};

// ✅ 显式指定编码和换行符
await fs.writeFile(outputPath, `${content}\n`, 'utf8');
```

### 推荐 npm scripts 组织方式

```json
{
    "scripts": {
        "build": "tsc && node ./scripts/post-build.js",
        "lint": "eslint . --ext .ts",
        "check": "npm run lint && npm run build"
    }
}
```

### 禁止写法

- `copy .\\dist\\main.js C:\\Vault\\plugins\\my-plugin\\main.js`
- `if %OS%==Windows_NT ...`
- `echo some text > file.txt`（可能产生平台差异换行）

---

## 依赖选择规范

### 优先选择

- 原生 Node.js API：`path`, `fs`, `os`, `url`, `child_process`
- 已明确支持 Windows 和 macOS 的工具与库
- 通过 `npm scripts` 统一封装的构建/检查/发布命令
- 确有必要时使用：`cross-env`, `shx`, `rimraf`

### 选择原则

- 能用 Node.js 原生能力解决的，不额外引入第三方依赖
- 引入新依赖前，必须确认其文档、维护状态和跨平台兼容性
- 新增依赖不得破坏现有构建链路
- 不得要求仅在单一平台额外配置

### 禁止依赖

- 仅支持 Windows 批处理或 PowerShell 的工具链
- 依赖 Bash 特性但未说明 macOS/Windows 替代方案的脚本
- 默认假设路径分隔符、换行符或权限模型固定不变的库
- 缺乏维护、无跨平台说明的依赖

---

## 提交前跨平台检查清单

- [ ] 所有路径拼接通过 `path.join()` / `path.resolve()` 完成
- [ ] 无硬编码反斜杠路径
- [ ] import 路径大小写与真实文件名一致
- [ ] 文本文件输出使用 `\n` 换行，显式 `utf8` 编码
- [ ] 无 Windows 盘符、`%USERPROFILE%`、`AppData` 等平台专属路径
- [ ] 新增脚本在 Windows 和 macOS 下均可执行
- [ ] 新增依赖的安装、构建、清理流程在双平台下验证通过
- [ ] 插件产物路径、文件名大小写和清理行为在双平台表现一致

```markdown

---

### 3.6 🆕 新建 `docs/debugging.md`

```markdown
# 调试信息管理规范

> 所有调试信息输出必须有开关控制。禁止在生产构建中留下无条件的
> `console.log` 语句。

## 强制规则

1. **所有调试输出必须通过 `DebugLogger`**，禁止直接使用 `console.log`
2. **调试模式必须可通过设置面板开关**，默认关闭
3. **调试级别必须可配置**：`debug | info | warn | error`
4. **日志前缀必须包含插件名称**，便于在 Obsidian 控制台中过滤

## 参考实现

```typescript
interface PluginSettings {
    debugMode: boolean;
    debugLevel: 'info' | 'warn' | 'error' | 'debug';
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class DebugLogger {
    private static readonly loggerMap: Record<
        LogLevel,
        (...args: unknown[]) => void
    > = {
        debug: console.debug.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
    };

    private static readonly levels: LogLevel[] = [
        'debug',
        'info',
        'warn',
        'error',
    ];

    constructor(
        private settings: PluginSettings,
        private pluginName: string,
    ) {}

    log(message: string, level: LogLevel = 'info'): void {
        if (this.settings.debugMode && this.shouldLog(level)) {
            DebugLogger.loggerMap[level](
                `[${this.pluginName}] ${message}`,
            );
        }
    }

    private shouldLog(level: LogLevel): boolean {
        return (
            DebugLogger.levels.indexOf(level) >=
            DebugLogger.levels.indexOf(this.settings.debugLevel)
        );
    }
}
```

## 使用规范

- 在 `main.ts` 的 `onload()` 中初始化 `DebugLogger` 实例
- 通过构造函数注入到需要日志的服务和模块
- `error` 级别的日志**即使 debugMode 关闭也应输出**（用于生产环境排错）
- 性能敏感路径（如每帧回调、大批量循环）中禁止日志输出，即使是 debug 级别

## 设置面板集成

在插件设置面板中应提供：

- **调试模式开关**（`toggle`）：默认 `false`
- **调试级别下拉**（`dropdown`）：默认 `info`

双语文案见 `docs/i18n.md`。
