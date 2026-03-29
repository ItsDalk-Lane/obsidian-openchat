# docs/debugging.md — 调试与日志规范

## 目标

- 让调试信息有统一入口，避免业务代码到处散落 `console.*`
- 在不泄露敏感信息的前提下，保留足够上下文帮助定位问题
- 让 AI 与人类都能快速判断“该记什么日志、该在哪里看”

## 统一入口

- 调试日志统一走 [`src/utils/DebugLogger.ts`](/Users/study_superior/Desktop/Code/obsidian-openchat/src/utils/DebugLogger.ts)
- 用户可见反馈统一走 `Notice` 或 `ObsidianApiProvider.notify()`
- 不要直接在业务代码里使用 `console.log/info/warn/error`

## DebugLogger 使用规则

- `DebugLogger.debug()`：只用于开发时排查细节，默认受 `debugMode` 与 `debugLevel` 控制
- `DebugLogger.info()`：记录重要但不异常的运行时状态
- `DebugLogger.warn()`：记录可恢复问题或降级路径
- `DebugLogger.error()`：记录真正异常、失败或需要排查的错误
- `DebugLogger.logLlmMessages()` / `logLlmResponsePreview()`：只在显式开启 LLM 日志时使用

## 敏感信息与内容裁剪

- 不记录密钥、token、密码、Cookie、完整授权头
- 大模型消息与响应默认使用预览模式，不直接整段输出
- 文件内容、用户输入、上下文摘要在日志中应只保留定位问题所需的最小片段

## 启动链路调试

- `main.ts` 的 `onload()` 只记录注册与 bootstrap 失败，不承载重迁移日志洪流
- settings bootstrap 失败与 deferred hydrate 失败要分开记录，便于判断是启动阻塞还是延迟任务异常
- MCP、skills、chat 的延迟初始化失败应记录在各自编排器中，而不是在 UI 层吞掉

## 排查顺序

1. 先看 `DebugLogger.error()` / `warn()` 是否已经给出上下文
2. 再看对应编排器或 service 的降级路径是否被触发
3. 最后才增加更细粒度的 debug 日志，并在修复后收回
