# OpenChat

<div align="center">

**一个原生的 Obsidian AI 助手插件**

[English](#english) | [中文](#中文)

</div>

---

<a name="中文"></a>

## 🌟 概述

OpenChat 是一个功能强大的 Obsidian 插件，为您的知识库提供智能 AI 助手能力。它支持多种主流 LLM 提供商，具备聊天、文件操作、上下文处理等功能，深度集成 Obsidian 工作流。

## ✨ 核心特性

### 🤖 多模型支持

支持多种主流 LLM 提供商：

| 提供商 | 模型示例 |
|--------|----------|
| **Anthropic** | Claude 3.5/4 系列 |
| **OpenAI** | GPT-4o, GPT-4-turbo, o1/o3 系列 |
| **Google** | Gemini 1.5/2.0 系列 |
| **DeepSeek** | DeepSeek-V3, DeepSeek-R1 |
| **OpenRouter** | 100+ 模型统一接入 |
| **Ollama** | 本地部署模型 |
| **其他** | Grok, Kimi, 智谱, 千帆, 硅基流动, 豆包, Poe |

### 💬 智能聊天

- 流式响应，实时显示 AI 输出
- 多轮对话上下文管理
- 消息编辑与重新生成
- 会话历史持久化
- 多模型并行对话

### 🔧 工具调用 (Function Calling)

内置丰富的工具集：

- **文件操作**：读取、创建、编辑、删除笔记
- **搜索功能**：全库搜索、语义搜索
- **链接工具**：解析双向链接、管理引用
- **时间工具**：日期解析、时区转换
- **网络工具**：网页抓取、内容提取
- **计划工具**：任务规划与追踪

### 🔌 MCP (Model Context Protocol)

完整的 MCP 协议支持：

- Stdio、HTTP、WebSocket 传输协议
- 动态加载 MCP 服务器
- 工具发现与调用
- 健康检查与自动重连

### 🎯 Skills 系统

可扩展的技能系统：

- 自定义 Prompt 模板
- 技能扫描与动态加载
- 运行时技能协调

### 📝 模板引擎

强大的模板功能：

- Handlebars 语法支持
- 表单模板处理
- 动态变量注入

## 📦 安装

### 从发布版安装

1. 前往 [Releases](https://github.com/ItsDalk-Lane/obsidian-openchat/releases) 页面
2. 下载最新版本的 `main.js`、`manifest.json` 和 `styles.css`
3. 在您的 Obsidian 库中创建文件夹：`您的库/.obsidian/plugins/openchat/`
4. 将下载的文件复制到该文件夹
5. 重启 Obsidian，在设置中启用 OpenChat 插件

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/ItsDalk-Lane/obsidian-openchat.git
cd obsidian-openchat

# 安装依赖
npm install

# 构建
npm run build
```

构建产物将位于 `dist/` 目录。

## ⚙️ 配置

### 基础配置

1. 打开 Obsidian 设置
2. 找到 "OpenChat" 选项
3. 配置您的 LLM 提供商 API Key
4. 选择默认模型
5. 设置 AI 数据存储文件夹

### 环境变量

复制 `.env.example` 为 `.env` 并配置：

```env
# Anthropic
ANTHROPIC_API_KEY=your_key

# OpenAI
OPENAI_API_KEY=your_key

# Google
GOOGLE_API_KEY=your_key

# DeepSeek
DEEPSEEK_API_KEY=your_key

# OpenRouter
OPENROUTER_API_KEY=your_key
```

## 🚀 快速开始

1. **配置 API Key**：在设置中填入您选择的 LLM 提供商 API Key
2. **打开聊天**：使用命令面板或快捷键打开 OpenChat 视图
3. **开始对话**：在输入框中输入您的问题，AI 将智能响应
4. **使用工具**：AI 可以自动调用工具来操作您的笔记库

## 📁 项目结构

```
obsidian-openchat/
├── src/
│   ├── main.ts                 # 插件入口
│   ├── core/                   # 核心功能
│   │   ├── chat/              # 聊天服务
│   │   ├── agents/            # Agent 循环
│   │   └── services/          # 通用服务
│   ├── LLMProviders/          # LLM 提供商适配器
│   ├── components/            # React UI 组件
│   ├── tools/                 # 工具定义
│   ├── services/              # 业务服务
│   │   ├── mcp/              # MCP 协议实现
│   │   └── skills/           # Skills 系统
│   ├── settings/              # 设置管理
│   ├── i18n/                  # 国际化
│   └── utils/                 # 工具函数
├── manifest.json              # 插件清单
├── package.json               # 项目配置
└── tsconfig.json              # TypeScript 配置
```

## 🔨 开发

### 开发环境要求

- Node.js >= 25.6.1
- npm

### 开发命令

```bash
# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build

# 代码检查
npm run lint
```

### 技术栈

- **TypeScript** - 类型安全
- **React** - UI 组件
- **Obsidian API** - 插件集成
- **Zod** - 运行时类型验证
- **CodeMirror** - 编辑器扩展

## 🤝 贡献

欢迎贡献代码、报告问题或提出功能建议！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者，以及 Obsidian 社区的支持。

---

<a name="english"></a>

## 🌟 Overview

OpenChat is a powerful Obsidian plugin that brings intelligent AI assistant capabilities to your knowledge base. It supports multiple major LLM providers, featuring chat, file operations, context handling, and deep integration with Obsidian workflows.

## ✨ Core Features

### 🤖 Multi-Model Support

Supports multiple major LLM providers:

| Provider | Model Examples |
|----------|----------------|
| **Anthropic** | Claude 3.5/4 series |
| **OpenAI** | GPT-4o, GPT-4-turbo, o1/o3 series |
| **Google** | Gemini 1.5/2.0 series |
| **DeepSeek** | DeepSeek-V3, DeepSeek-R1 |
| **OpenRouter** | 100+ models unified access |
| **Ollama** | Local deployment models |
| **Others** | Grok, Kimi, Zhipu, Qianfan, SiliconFlow, Doubao, Poe |

### 💬 Smart Chat

- Streaming responses with real-time AI output
- Multi-turn conversation context management
- Message editing and regeneration
- Session history persistence
- Multi-model parallel conversations

### 🔧 Tool Calling (Function Calling)

Rich built-in toolset:

- **File Operations**: Read, create, edit, delete notes
- **Search**: Full-vault search, semantic search
- **Link Tools**: Parse bidirectional links, manage references
- **Time Tools**: Date parsing, timezone conversion
- **Web Tools**: Web scraping, content extraction
- **Planning Tools**: Task planning and tracking

### 🔌 MCP (Model Context Protocol)

Complete MCP protocol support:

- Stdio, HTTP, WebSocket transport protocols
- Dynamic MCP server loading
- Tool discovery and invocation
- Health checks and auto-reconnection

### 🎯 Skills System

Extensible skills system:

- Custom prompt templates
- Skill scanning and dynamic loading
- Runtime skill coordination

### 📝 Template Engine

Powerful templating:

- Handlebars syntax support
- Form template processing
- Dynamic variable injection

## 📦 Installation

### From Release

1. Go to the [Releases](https://github.com/ItsDalk-Lane/obsidian-openchat/releases) page
2. Download the latest `main.js`, `manifest.json`, and `styles.css`
3. Create a folder in your Obsidian vault: `your-vault/.obsidian/plugins/openchat/`
4. Copy the downloaded files to this folder
5. Restart Obsidian and enable the OpenChat plugin in settings

### Build from Source

```bash
# Clone the repository
git clone https://github.com/ItsDalk-Lane/obsidian-openchat.git
cd obsidian-openchat

# Install dependencies
npm install

# Build
npm run build
```

Build artifacts will be in the `dist/` directory.

## ⚙️ Configuration

### Basic Setup

1. Open Obsidian settings
2. Find "OpenChat" option
3. Configure your LLM provider API Key
4. Select default model
5. Set AI data storage folder

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Anthropic
ANTHROPIC_API_KEY=your_key

# OpenAI
OPENAI_API_KEY=your_key

# Google
GOOGLE_API_KEY=your_key

# DeepSeek
DEEPSEEK_API_KEY=your_key

# OpenRouter
OPENROUTER_API_KEY=your_key
```

## 🚀 Quick Start

1. **Configure API Key**: Enter your chosen LLM provider's API Key in settings
2. **Open Chat**: Use the command palette or shortcut to open the OpenChat view
3. **Start Conversation**: Type your question in the input box, AI will respond intelligently
4. **Use Tools**: AI can automatically call tools to operate on your note vault

## 📁 Project Structure

```
obsidian-openchat/
├── src/
│   ├── main.ts                 # Plugin entry
│   ├── core/                   # Core functionality
│   │   ├── chat/              # Chat services
│   │   ├── agents/            # Agent loop
│   │   └── services/          # General services
│   ├── LLMProviders/          # LLM provider adapters
│   ├── components/            # React UI components
│   ├── tools/                 # Tool definitions
│   ├── services/              # Business services
│   │   ├── mcp/              # MCP protocol implementation
│   │   └── skills/           # Skills system
│   ├── settings/              # Settings management
│   ├── i18n/                  # Internationalization
│   └── utils/                 # Utility functions
├── manifest.json              # Plugin manifest
├── package.json               # Project configuration
└── tsconfig.json              # TypeScript configuration
```

## 🔨 Development

### Requirements

- Node.js >= 25.6.1
- npm

### Development Commands

```bash
# Development mode (watch file changes)
npm run dev

# Production build
npm run build

# Linting
npm run lint
```

### Tech Stack

- **TypeScript** - Type safety
- **React** - UI components
- **Obsidian API** - Plugin integration
- **Zod** - Runtime type validation
- **CodeMirror** - Editor extensions

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Thanks to all developers who have contributed to this project and the Obsidian community for their support.

---

<div align="center">

**[⬆ Back to Top](#openchat)**

</div>
