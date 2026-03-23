# Obsidian 插件长期项目指令

## 文档定位

- 本文件是当前项目的长期项目指令文件，供 Copilot、Claude 及其他参与开发的 AI 编程代理持续使用
- 本项目本身即为 Obsidian 插件项目，所有规则默认围绕 Obsidian 插件开发、调试、构建、重构与文档维护展开
- 除非用户明确提出一次性临时要求，否则本文件中的规则应视为长期有效的项目约束与协作规范
- 在不违反系统或平台级规则的前提下，涉及本项目的代码生成、修改、审查与建议，应优先遵循本文件

## 核心架构要求

### 1. main.ts 文件职责（必须遵守）
- **必须包含**：继承自 `Plugin` 的主插件类，并作为默认导出
- **必须包含**：`onload()` 和 `onunload()` 生命周期方法
- **必须在此处**：所有 Obsidian API 的注册调用（`addCommand`, `addRibbonIcon`, `addSettingTab`, `registerView` 等）
- **保持简洁**：只包含注册、初始化和生命周期管理，不包含具体业务逻辑

### 2. 模块化要求
- **命令实现**：具体的命令逻辑必须分离到独立的模块文件
- **UI 组件**：所有 Modal、View、SettingTab 等 UI 组件放在独立文件
- **业务逻辑**：数据处理、文件操作等业务逻辑放在 services 目录
- **工具函数**：通用工具函数放在 utils 目录
- **设置管理**：设置接口定义和管理逻辑分离到独立文件

### 3. 推荐目录结构
```
src/
├── main.ts              # 插件入口（仅核心注册逻辑）
├── settings.ts          # 设置接口和管理
├── commands/            # 命令实现
├── ui/                  # UI 组件
│   ├── modals/
│   ├── views/
│   └── settings-tab.ts
├── services/            # 业务逻辑服务
└── utils/               # 工具函数
```

## 开发环境与构建规则

### 4. 构建要求（强制）
- ✅ **开发阶段**：可使用 `npm run dev` 或监听模式提升迭代效率
- 🔧 **必须使用** `npm run build` 构建 Obsidian 插件项目文件
- 🚫 **验证阶段严禁依赖** `npm run dev` 或监听模式替代真实 Obsidian 环境中的 build 产物验证
- ✅ **依赖**真实 Obsidian 环境测试
- ✅ **信任** Obsidian 的调试能力

### 5. Windows 开发环境优化
- 🖥️ **利用 Windows 特性**：
    - 理解 Windows 路径格式、环境变量等平台特性，但实现必须使用跨平台 API
  - 考虑 Windows 文件系统特点
  - 适配 Windows 快捷键习惯
- ⚡ **性能优化**：
  - 充分利用 i9-14900KF 的多核性能
  - 优化编译和构建配置
  - 使用并行处理提升效率

### 6. Mac 开发环境要求
- 🍎 **支持 macOS 开发环境**：
  - 使用跨平台路径处理方式，避免硬编码 Windows 路径分隔符
    - 考虑 macOS 文件系统默认大小写不敏感但保留大小写，且可配置为大小写敏感
  - 适配 macOS 常用快捷键和操作习惯
  - 验证命令、脚本和构建流程在 macOS 下可正常执行
- ⚙️ **跨平台兼容原则**：
  - 优先使用 Node.js 和 Obsidian 官方提供的跨平台 API
  - 避免依赖仅限 Windows 的命令、Shell 写法或系统特性
  - 文件监听、路径拼接、换行符处理必须兼容 Windows 和 macOS
  - 涉及系统路径、环境变量、脚本执行时，必须同时考虑 Windows 和 macOS

#### 跨平台脚本编写示例
- ✅ **推荐做法**：
  - 使用 `path.join()`、`path.resolve()` 处理路径，禁止手写 `\\` 或 `/`
  - 使用 `process.platform` 区分平台差异，但仅在确有必要时分支处理
  - 文本文件统一使用 `\n` 作为换行符，避免混用 `\r\n`
  - 优先通过 `npm run <script>` 组织构建、检查、发布流程，避免把平台相关逻辑写死在命令行中

```typescript
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

async function writeBuildInfo(distDir: string): Promise<void> {
    const outputPath = path.join(distDir, 'build-info.json');
    const platformMap: Record<string, string> = {
        darwin: 'macOS',
        win32: 'Windows',
        linux: 'Linux',
    };
    const platformName = platformMap[process.platform] || process.platform;
    const content = JSON.stringify(
        {
            platform: platformName,
            homeDir: os.homedir(),
        },
        null,
        2,
    );

    await fs.writeFile(outputPath, `${content}\n`, 'utf8');
}
```

```json
{
    "scripts": {
        "build": "tsc && node ./scripts/post-build.js",
        "lint": "eslint . --ext .ts",
        "check": "npm run lint && npm run build"
    }
}
```

- 🚫 **避免写法**：
    - `copy .\\dist\\main.js C:\\Vault\\plugins\\my-plugin\\main.js`
    - `if %OS%==Windows_NT ...`
    - `echo some text > file.txt` 直接生成可能带平台差异换行的文件

#### 跨平台文件路径与大小写敏感检查清单
- ✅ **提交前必须检查**：
    - 所有路径拼接必须通过 `path.join()` 或 `path.resolve()` 完成
    - 不得在源码、脚本、配置中硬编码反斜杠路径
    - 导入路径的大小写必须与真实文件名完全一致
    - 重命名文件时必须检查大小写变更在 Git 和不同文件系统下是否可正确识别
    - 不得假设文件系统一定大小写不敏感，必须按大小写敏感环境编写代码
    - 不得依赖 Windows 盘符、用户目录格式或特定系统临时目录结构
    - 读写文本文件时必须显式指定 `utf8` 编码，并统一输出换行符

- 🔍 **重点排查场景**：
    - `import './Utils'` 与真实文件 `utils.ts` 大小写不一致
    - 脚本中使用 `C:\\`、`%USERPROFILE%`、`AppData` 等 Windows 专属路径
    - 使用字符串截取路径而非调用 `path` 模块进行处理
    - 构建产物复制、插件目录定位、日志输出路径依赖单一平台目录结构

#### 跨平台依赖选择规范
- ✅ **优先选择**：
    - 原生 Node.js API，如 `path`、`fs`、`os`、`url`、`child_process`
    - 已明确支持 Windows 和 macOS 的工具与库
    - 通过 `npm scripts` 统一封装的构建、检查、发布命令
    - 确有必要时使用跨平台工具，如 `cross-env`、`shx`、`rimraf`

- 📌 **选择原则**：
    - 能使用 Node.js 原生能力解决的问题，不额外引入第三方依赖
    - 引入新依赖前，必须确认其文档、维护状态和跨平台兼容性
    - 新增依赖不得破坏现有构建链路，不得要求仅在单一平台额外配置
    - 涉及文件复制、删除、环境变量设置时，优先选择跨平台实现而不是平台专属命令

- 🚫 **避免依赖**：
    - 仅支持 Windows 批处理或 PowerShell 的工具链
    - 依赖 Bash 特性但未说明 macOS 与 Windows 替代方案的脚本
    - 默认假设路径分隔符、换行符或权限模型固定不变的库
    - 缺乏维护、无跨平台说明、需要平台专属补丁才能运行的依赖

- 🧪 **依赖验证要求**：
    - 新增脚本命令后，至少确认其在 Windows 和 macOS 下都可执行
    - 新增依赖后，必须检查安装、构建、清理、打包流程是否受影响
    - 对外发布前，必须确认插件产物路径、文件名大小写和清理行为在双平台下表现一致

## 调试信息管理规则

### 7. 调试输出控制（强制要求）
- 🔒 **强制要求**：所有调试信息输出必须有开关控制
- 📋 **实现方式**：
  ```typescript
  interface PluginSettings {
      debugMode: boolean;
      debugLevel: 'info' | 'warn' | 'error' | 'debug';
  }

  type LogLevel = 'info' | 'warn' | 'error' | 'debug';
  
  class DebugLogger {
      private static readonly loggerMap: Record<LogLevel, (...args: unknown[]) => void> = {
          debug: console.debug.bind(console),
          info: console.info.bind(console),
          warn: console.warn.bind(console),
          error: console.error.bind(console),
      };

      private static readonly levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

      constructor(private settings: PluginSettings, private pluginName: string) {}
      
      log(message: string, level: LogLevel = 'info') {
          if (this.settings.debugMode && this.shouldLog(level)) {
              DebugLogger.loggerMap[level](`[${this.pluginName}] ${message}`);
          }
      }
      
      private shouldLog(level: LogLevel): boolean {
          return DebugLogger.levels.indexOf(level) >= DebugLogger.levels.indexOf(this.settings.debugLevel);
      }
  }
  ```

## 代码规范

### 8. TypeScript 要求
- 必须使用 TypeScript
- 所有接口和类型必须明确定义
- 使用 Obsidian 官方类型定义：`import { App, Plugin, ... } from 'obsidian'`

### 9. 依赖传递
- 通过构造函数或方法参数传递插件实例
- 避免在模块间使用全局变量
- 使用依赖注入模式

### 10. 错误处理
- 所有异步操作必须包含错误处理
- 用户操作失败时提供友好的错误提示
- 使用 `new Notice()` 显示用户通知

## 架构分析规则

### 11. 第一性原理分析
- 📊 **理解本质**：
  - 理解 Obsidian 的核心设计理念
  - 分析插件在整个生态中的定位
  - 识别核心功能与辅助功能的边界
  - 理解数据流和事件流的本质

## 开发约束

### 12. 性能要求
- 避免在 `onload()` 中执行耗时操作
- 大量数据处理应使用异步方式
- 及时清理事件监听器和定时器

### 13. 兼容性
- 代码必须兼容当前稳定版本的 Obsidian
- 使用官方 API，避免访问私有属性
- 遵循 Obsidian 插件开发最佳实践

### 13.1 双语支持要求（强制）
- 插件必须同时提供中文和英文两个语言版本，默认语言为中文
- 所有面向用户的内容必须支持双语，包括但不限于：设置项标题与说明、命令名称、按钮文案、提示信息、错误提示、Notice、Modal 文案、View 文案、占位符文本、引导文案、帮助说明
- 新增功能时，禁止只实现单语文案；所有新增用户可见文本必须同步提供中英文版本
- 涉及配置项、提示词模板、系统提示、预设文案或其他可配置文本时，必须按双语结构设计，避免把中文或英文硬编码为唯一值
- 默认展示中文；当后续接入语言切换或语言检测时，必须保证中英文文案键值完整且可回退到中文
- 命名与结构上应为后续国际化扩展预留空间，优先集中管理文案，避免在组件和业务逻辑中散落硬编码文本
- 推荐集中维护文案资源，例如在独立的 i18n 模块或语言映射对象中统一管理中文与英文键值，避免在多个组件内重复定义
- 提交前必须通过第 17 节开发检查清单中的双语相关检查项，确认中英文文案完整且默认语言仍为中文

### 14. 测试和调试规则
- 🚫 **禁止**添加浏览器测试相关代码
- 🚫 **禁止**手动配置 sourcemap
- ✅ **依赖**真实 Obsidian 环境测试

### 15. Obsidian 特定文件保护
- 🛡️ **必须保护**：
  - manifest.json
  - main.js
  - styles.css
  - data.json
  - 所有插件 API 相关文件

## 示例模板要求

### 16. main.ts 示例模板
```typescript
import { Plugin } from 'obsidian';
import { SettingsManager, MyPluginSettings } from './settings';
import { CommandManager } from './commands';
import { DebugLogger } from './utils/logger';

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    logger: DebugLogger;

    async onload() {
        await this.loadSettings();
        this.initializeLogger();
        this.registerCommands();
        this.registerUI();
        
        this.logger.log('Plugin loaded successfully');
    }

    onunload() {
        this.logger.log('Plugin unloading');
        // 清理事件监听器和定时器
    }

    private async loadSettings() {
        this.settings = await SettingsManager.load(this);
    }

    private initializeLogger() {
        this.logger = new DebugLogger(this.settings, this.manifest.name);
    }

    private registerCommands() {
        CommandManager.registerAll(this);
    }

    private registerUI() {
        // UI 注册逻辑
    }
}
```

## 开发检查清单

### 17. Obsidian 插件开发检查清单
- ✅ 调试输出是否可控
- ✅ 是否兼容 Obsidian API 版本
- ✅ 是否处理了插件生命周期
- ✅ 是否正确管理了事件监听器
- ✅ 是否避免了内存泄漏
- ✅ 是否使用了正确的构建命令
- ✅ 是否遵循了模块化架构
- ✅ 是否包含了适当的错误处理
- ✅ 是否为所有用户可见内容提供了中英文双语版本
- ✅ 默认语言是否为中文

## 禁止事项

### 18. 严格禁止
- 不要在 main.ts 中编写具体的业务逻辑
- 不要在一个文件中混合多种职责
- 不要直接操作 DOM，使用 Obsidian 提供的 API
- 不要忽略错误处理和用户反馈
- 不要绕过第 4 条和第 14 条中定义的构建、测试与调试约束

---

**请严格遵守以上规则，确保生成的代码结构清晰、可维护且符合 Obsidian 插件开发标准。