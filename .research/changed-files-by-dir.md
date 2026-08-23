## .
modified  AGENTS.md
added     CONTEXT.md
modified  README.ja.md
modified  README.md
added     README.ru.md
modified  README.zh-CN.md
modified  bun.lock
modified  next.config.ts
modified  package-lock.json
modified  package.json
modified  proxy.ts

## app
modified  app/globals.css
modified  app/layout.tsx
added     app/manifest.ts
modified  app/page.tsx

## app/api/agent
added     app/api/agent/events-route.test.mjs

## app/api/agent/[id]
modified  app/api/agent/[id]/route.ts

## app/api/agent/[id]/events
modified  app/api/agent/[id]/events/route.ts

## app/api/agent/new
modified  app/api/agent/new/route.ts

## app/api/agent/running
added     app/api/agent/running/route.ts

## app/api/agent/running/events
modified  app/api/agent/running/events/route.ts

## app/api/app-update
added     app/api/app-update/route.ts

## app/api/auth/all-providers
modified  app/api/auth/all-providers/route.ts

## app/api/auth/api-key/[provider]
modified  app/api/auth/api-key/[provider]/route.ts

## app/api/auth/logout/[provider]
modified  app/api/auth/logout/[provider]/route.ts

## app/api/auth/providers
modified  app/api/auth/providers/route.ts

## app/api/cwd/browse
modified  app/api/cwd/browse/route.ts

## app/api/cwd/validate
added     app/api/cwd/validate/route.test.mjs
modified  app/api/cwd/validate/route.ts

## app/api/files
added     app/api/files/watch-route.test.mjs

## app/api/files/[...path]
modified  app/api/files/[...path]/route.ts

## app/api/git/diff
modified  app/api/git/diff/route.ts

## app/api/models
modified  app/api/models/route.ts

## app/api/models-config
modified  app/api/models-config/route.ts

## app/api/models-config/catalog
added     app/api/models-config/catalog/route.ts

## app/api/models-config/discover
added     app/api/models-config/discover/route.ts

## app/api/models-config/test
modified  app/api/models-config/test/route.ts

## app/api/plugins
modified  app/api/plugins/route.ts

## app/api/project-trust
added     app/api/project-trust/route.ts

## app/api/sessions
modified  app/api/sessions/route.ts
added     app/api/sessions/runtime-route.test.mjs

## app/api/sessions/[id]
modified  app/api/sessions/[id]/route.ts

## app/api/sessions/[id]/auto-name
modified  app/api/sessions/[id]/auto-name/route.ts

## app/api/sessions/[id]/context
modified  app/api/sessions/[id]/context/route.ts

## app/api/sessions/[id]/export
modified  app/api/sessions/[id]/export/route.ts

## app/api/sessions/[id]/state
modified  app/api/sessions/[id]/state/route.ts

## app/api/skills
modified  app/api/skills/route.ts

## app/api/skills/install
modified  app/api/skills/install/route.ts

## app/api/worktrees
modified  app/api/worktrees/route.ts

## bin
modified  bin/pi-web-options.js
modified  bin/pi-web.js
added     bin/process-lifecycle.js

## components
added     components/AppShell.auto-name.test.mjs
added     components/AppShell.file-viewer-state.test.mjs
added     components/AppShell.mobile-toolbar.test.mjs
modified  components/AppShell.tsx
added     components/AppShell.workspace-memory.test.mjs
added     components/BranchNavigator.test.mjs
modified  components/BranchNavigator.tsx
added     components/ChatInput.dormancy.test.mjs
added     components/ChatInput.mobile-thinking-menu.test.mjs
modified  components/ChatInput.test.mjs
modified  components/ChatInput.tsx
added     components/ChatMinimap.module.css
added     components/ChatMinimap.test.mjs
modified  components/ChatMinimap.tsx
added     components/ChatWindow.notices.test.mjs
added     components/ChatWindow.process-details.test.mjs
modified  components/ChatWindow.tsx
modified  components/DirectoryPicker.tsx
added     components/ExtensionStatusBar.test.mjs
added     components/ExtensionStatusBar.tsx
added     components/ExtensionWidgets.test.mjs
added     components/ExtensionWidgets.tsx
modified  components/FileExplorer.tsx
modified  components/FileIcons.tsx
added     components/FileViewer.state.test.mjs
modified  components/FileViewer.tsx
added     components/FrontmatterCard.tsx
added     components/ImagePreview.test.mjs
added     components/ImagePreview.tsx
modified  components/MarkdownBody.test.mjs
modified  components/MarkdownBody.tsx
modified  components/MermaidBlock.test.mjs
modified  components/MermaidBlock.tsx
added     components/MessageView.test.mjs
modified  components/MessageView.tsx
added     components/MobilePwaLayout.test.mjs
added     components/ModelsConfig.test.mjs
modified  components/ModelsConfig.tsx
modified  components/PluginsConfig.tsx
added     components/ProjectTrustDialog.tsx
added     components/PwaRegistration.tsx
added     components/SessionSidebar.project-identity.test.mjs
added     components/SessionSidebar.test.mjs
modified  components/SessionSidebar.tsx
added     components/SessionSidebar.worktree.test.mjs
modified  components/SkillsConfig.tsx
modified  components/TabBar.tsx
added     components/TurnWrittenFiles.test.mjs
added     components/TurnWrittenFiles.tsx
added     components/file-tab-state.test.mjs
added     components/file-tab-state.ts
added     components/models-config-helpers.ts

## docs
added     docs/i18n.md

## docs/adr
added     docs/adr/0001-isolate-project-command-environments.md

## hooks
added     hooks/model-scope-startup.test.mjs
added     hooks/model-switching.test.mjs
added     hooks/useAgentSession.test.mjs
modified  hooks/useAgentSession.ts
added     hooks/useI18n.tsx
added     hooks/useResizablePanel.ts
modified  hooks/useTheme.ts
added     hooks/useViewportHeight.test.mjs
added     hooks/useViewportHeight.ts

## lib
added     lib/agent-client.test.mjs
modified  lib/agent-client.ts
added     lib/agent-event-connection.test.mjs
added     lib/agent-event-connection.ts
added     lib/agent-event-stream.test.mjs
added     lib/agent-event-stream.ts
added     lib/agent-event-wire.test.mjs
added     lib/agent-event-wire.ts
modified  lib/allowed-roots.ts
modified  lib/api-types.ts
added     lib/app-update.test.mjs
added     lib/app-update.ts
added     lib/atomic-file.test.mjs
added     lib/atomic-file.ts
added     lib/browser-notifications.test.mjs
added     lib/browser-notifications.ts
modified  lib/chat-lazy-load.test.mjs
modified  lib/chat-lazy-load.ts
modified  lib/directory-browser.test.mjs
modified  lib/directory-browser.ts
modified  lib/draft-store.ts
modified  lib/file-access.test.mjs
modified  lib/file-access.ts
added     lib/file-explorer-state.test.mjs
added     lib/file-explorer-state.ts
modified  lib/file-links.ts
added     lib/file-viewer-state.test.mjs
added     lib/file-viewer-state.ts
added     lib/frontmatter.test.mjs
added     lib/frontmatter.ts
modified  lib/git-changes.ts
modified  lib/git-types.ts
modified  lib/http-dispatcher.test.mjs
added     lib/markdown.test.mjs
modified  lib/markdown.ts
modified  lib/message-display.test.mjs
modified  lib/message-display.ts
added     lib/model-catalog.test.mjs
added     lib/model-catalog.ts
added     lib/model-discovery-auth.ts
added     lib/model-discovery.test.mjs
added     lib/model-discovery.ts
added     lib/model-scope.test.mjs
added     lib/model-scope.ts
modified  lib/models-cache.test.mjs
modified  lib/models-cache.ts
added     lib/models-config-store.test.mjs
added     lib/models-config-store.ts
added     lib/next-config-esm.test.mjs
added     lib/next-config.test.mjs
added     lib/normalize.test.mjs
modified  lib/normalize.ts
added     lib/panel-layout.test.mjs
added     lib/panel-layout.ts
modified  lib/patch.test.mjs
modified  lib/patch.ts
modified  lib/path-security.ts
added     lib/paths.test.mjs
added     lib/paths.ts
modified  lib/pi-types.ts
modified  lib/pi-web-options.test.mjs
added     lib/process-lifecycle.test.mjs
added     lib/project-command-env.test.mjs
added     lib/project-command-env.ts
added     lib/project-groups.test.mjs
added     lib/project-groups.ts
added     lib/project-identity.test.mjs
added     lib/project-identity.ts
added     lib/project-tree.test.mjs
added     lib/project-tree.ts
added     lib/project-trust.test.mjs
added     lib/project-trust.ts
added     lib/prompt-recovery.test.mjs
added     lib/prompt-recovery.ts
added     lib/provider-api-key-route.test.mjs
added     lib/provider-credential-store.test.mjs
added     lib/provider-credential-store.ts
added     lib/provider-listing-runtime.ts
added     lib/provider-listing.test.mjs
added     lib/provider-listing.ts
modified  lib/request-security.test.mjs
modified  lib/request-security.ts
added     lib/rpc-manager-shutdown.test.mjs
added     lib/rpc-manager-widgets.test.mjs
modified  lib/rpc-manager.test.mjs
modified  lib/rpc-manager.ts
added     lib/rpc-session-info.test.mjs
modified  lib/session-reader.test.mjs
modified  lib/session-reader.ts
added     lib/session-row-context-menu.test.mjs
added     lib/session-row-context-menu.ts
added     lib/session-timing.test.mjs
added     lib/session-timing.ts
modified  lib/session-title.test.mjs
modified  lib/session-title.ts
modified  lib/skills-service.ts
added     lib/slash-display.test.mjs
added     lib/slash-display.ts
added     lib/startup-preferences.test.mjs
added     lib/startup-preferences.ts
added     lib/streaming-message.test.mjs
added     lib/streaming-message.ts
added     lib/tool-execution-progress.test.mjs
added     lib/tool-execution-progress.ts
added     lib/tool-names.ts
added     lib/tool-preset-preference.test.mjs
added     lib/tool-preset-preference.ts
added     lib/tool-presets.test.mjs
modified  lib/tool-presets.ts
added     lib/turn-written-files.test.mjs
added     lib/turn-written-files.ts
modified  lib/types.ts
added     lib/web-auth.test.mjs
added     lib/web-auth.ts
added     lib/workspace-memory.test.mjs
added     lib/workspace-memory.ts
added     lib/worktree.test.mjs
modified  lib/worktree.ts

## lib/i18n
added     lib/i18n/format.test.mjs
added     lib/i18n/format.ts
added     lib/i18n/registry.test.mjs
added     lib/i18n/registry.ts
added     lib/i18n/types.ts

## lib/i18n/messages
added     lib/i18n/messages/en.ts
added     lib/i18n/messages/zh-CN.ts

## public/icons
added     public/icons/apple-touch-icon.png

## public/icons/catppuccin
added     public/icons/catppuccin/LICENSE
added     public/icons/catppuccin/README.md

## public/icons/catppuccin/latte
added     public/icons/catppuccin/latte/_file.svg
added     public/icons/catppuccin/latte/_folder.svg
added     public/icons/catppuccin/latte/_folder_open.svg
added     public/icons/catppuccin/latte/bash.svg
added     public/icons/catppuccin/latte/bun-lock.svg
added     public/icons/catppuccin/latte/config.svg
added     public/icons/catppuccin/latte/css.svg
added     public/icons/catppuccin/latte/database.svg
added     public/icons/catppuccin/latte/docker.svg
added     public/icons/catppuccin/latte/env.svg
added     public/icons/catppuccin/latte/eslint.svg
added     public/icons/catppuccin/latte/git.svg
added     public/icons/catppuccin/latte/go.svg
added     public/icons/catppuccin/latte/graphql.svg
added     public/icons/catppuccin/latte/html.svg
added     public/icons/catppuccin/latte/javascript-react.svg
added     public/icons/catppuccin/latte/javascript.svg
added     public/icons/catppuccin/latte/json.svg
added     public/icons/catppuccin/latte/lock.svg
added     public/icons/catppuccin/latte/markdown.svg
added     public/icons/catppuccin/latte/ms-word.svg
added     public/icons/catppuccin/latte/next.svg
added     public/icons/catppuccin/latte/npm-lock.svg
added     public/icons/catppuccin/latte/pdf.svg
added     public/icons/catppuccin/latte/python.svg
added     public/icons/catppuccin/latte/rust.svg
added     public/icons/catppuccin/latte/sass.svg
added     public/icons/catppuccin/latte/terraform.svg
added     public/icons/catppuccin/latte/toml.svg
added     public/icons/catppuccin/latte/typescript-react.svg
added     public/icons/catppuccin/latte/typescript.svg
added     public/icons/catppuccin/latte/yaml.svg

## public/icons/catppuccin/mocha
added     public/icons/catppuccin/mocha/_file.svg
added     public/icons/catppuccin/mocha/_folder.svg
added     public/icons/catppuccin/mocha/_folder_open.svg
added     public/icons/catppuccin/mocha/bash.svg
added     public/icons/catppuccin/mocha/bun-lock.svg
added     public/icons/catppuccin/mocha/config.svg
added     public/icons/catppuccin/mocha/css.svg
added     public/icons/catppuccin/mocha/database.svg
added     public/icons/catppuccin/mocha/docker.svg
added     public/icons/catppuccin/mocha/env.svg
added     public/icons/catppuccin/mocha/eslint.svg
added     public/icons/catppuccin/mocha/git.svg
added     public/icons/catppuccin/mocha/go.svg
added     public/icons/catppuccin/mocha/graphql.svg
added     public/icons/catppuccin/mocha/html.svg
added     public/icons/catppuccin/mocha/javascript-react.svg
added     public/icons/catppuccin/mocha/javascript.svg
added     public/icons/catppuccin/mocha/json.svg
added     public/icons/catppuccin/mocha/lock.svg
added     public/icons/catppuccin/mocha/markdown.svg
added     public/icons/catppuccin/mocha/ms-word.svg
added     public/icons/catppuccin/mocha/next.svg
added     public/icons/catppuccin/mocha/npm-lock.svg
added     public/icons/catppuccin/mocha/pdf.svg
added     public/icons/catppuccin/mocha/python.svg