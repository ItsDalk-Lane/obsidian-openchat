import test from 'node:test';
import assert from 'node:assert/strict';
import { lintArchitecture } from './lint-arch';
import { lintArchitectureFiles } from './lint-arch';
import { classifyManagedFile, collectManagedFiles, createManagedFile } from './shared';
import { lintTasteFiles } from './lint-taste';

test('允许同域 ui 导入 service 与 provider 契约', () => {
	const files = [
		createManagedFile('src/domains/editor/service.ts', 'export function buildEditorState(): string { return "ok"; }'),
		createManagedFile('src/providers/providers.types.ts', 'export interface ObsidianApiProvider { notify(message: string): void; }'),
		createManagedFile(
			'src/domains/editor/ui.ts',
			'import { buildEditorState } from "./service";\nimport type { ObsidianApiProvider } from "src/providers/providers.types";\nexport function registerEditorUi(provider: ObsidianApiProvider): string { provider.notify("ok"); return buildEditorState(); }',
		),
	];
	assert.equal(lintArchitectureFiles(files).length, 0);
});

test('允许组合根消费 domains 与 provider 实现', () => {
	const files = [
		createManagedFile('src/domains/editor/ui.ts', 'export function createEditorDomainExtension(): string[] { return []; }'),
		createManagedFile('src/providers/event-bus.ts', 'export function createEventBus(): object { return {}; }'),
		createManagedFile(
			'src/commands/ai-runtime/AiRuntimeCommandManager.ts',
			'import { createEditorDomainExtension } from "src/domains/editor/ui";\nimport { createEventBus } from "src/providers/event-bus";\nexport function initializeManager(): object { return { extensions: createEditorDomainExtension(), bus: createEventBus() }; }',
		),
	];
	assert.equal(lintArchitectureFiles(files).length, 0);
});

test('允许 main.ts 与 FeatureCoordinator 作为 provider 组合根', () => {
	const files = [
		createManagedFile('src/providers/obsidian-api.ts', 'export function createObsidianApiProvider(): object { return {}; }'),
		createManagedFile('src/main.ts', 'import { createObsidianApiProvider } from "src/providers/obsidian-api";\nexport const provider = createObsidianApiProvider();'),
		createManagedFile('src/core/FeatureCoordinator.ts', 'import { createObsidianApiProvider } from "src/providers/obsidian-api";\nexport const provider = createObsidianApiProvider();'),
		createManagedFile('src/core/PluginStartupCoordinator.ts', 'import { createObsidianApiProvider } from "src/providers/obsidian-api";\nexport const provider = createObsidianApiProvider();'),
	];
	assert.equal(lintArchitectureFiles(files).length, 0);
});

test('阻止组合根之外导入 OpenChatPlugin', () => {
	const files = [
		createManagedFile('src/main.ts', 'export default class OpenChatPlugin {}'),
		createManagedFile('src/commands/chat/chat-view-shell.ts', 'import type OpenChatPlugin from "src/main";\nexport class ChatViewShell { constructor(_plugin: OpenChatPlugin) {} }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.ok(violations.some((violation) => violation.rule === 'arch/no-plugin-leak'));
});

test('阻止 types 层导入 providers', () => {
	const files = [
		createManagedFile('src/providers/providers.types.ts', 'export interface EventBus<TEvents extends Record<string, unknown>> { clear(): void; }'),
		createManagedFile('src/domains/editor/types.ts', 'import type { EventBus } from "src/providers/providers.types";\nexport interface EditorRuntime { bus: EventBus<Record<string, unknown>>; }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/provider-layer-boundary');
});

test('阻止 config 层导入 providers', () => {
	const files = [
		createManagedFile('src/providers/providers.types.ts', 'export interface SettingsProvider<TSettings> { getSnapshot(): Readonly<TSettings>; }'),
		createManagedFile('src/domains/editor/config.ts', 'import type { SettingsProvider } from "src/providers/providers.types";\nexport const providerRef = null as unknown as SettingsProvider<{ enabled: boolean }>;'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/provider-layer-boundary');
});

test('阻止 service 与 ui 直接导入 provider 实现', () => {
	const files = [
		createManagedFile('src/providers/obsidian-api.ts', 'export function createObsidianApiProvider(): object { return {}; }'),
		createManagedFile('src/domains/editor/service.ts', 'import { createObsidianApiProvider } from "src/providers/obsidian-api";\nexport function buildEditorState(): object { return createObsidianApiProvider(); }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/provider-contract-only');
});

test('阻止反向层级依赖', () => {
	const files = [
		createManagedFile('src/domains/editor/ui.ts', 'export function registerEditorUi(): void {}'),
		createManagedFile('src/domains/editor/service.ts', 'import { registerEditorUi } from "./ui";\nexport function buildEditorState(): void { registerEditorUi(); }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/layer-direction');
});

test('阻止跨域直接导入', () => {
	const files = [
		createManagedFile('src/domains/chat/types.ts', 'export interface ChatState { value: string; }'),
		createManagedFile('src/domains/editor/service.ts', 'import type { ChatState } from "src/domains/chat/types";\nexport function buildEditorState(state: ChatState): string { return state.value; }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/no-cross-domain-import');
});

test('阻止域代码直接导入 obsidian', () => {
	const files = [
		createManagedFile('src/domains/editor/service.ts', 'import { Notice } from "obsidian";\nexport function notifyUser(): void { new Notice("boom"); }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/no-direct-obsidian');
});

test('阻止 provider 契约文件依赖本地实现', () => {
	const files = [
		createManagedFile('src/providers/event-bus.ts', 'export function createEventBus(): object { return {}; }'),
		createManagedFile('src/providers/providers.types.ts', 'import { createEventBus } from "./event-bus";\nexport interface EventBus<TEvents extends Record<string, unknown>> { clear(): void; }\nexport const leaked = createEventBus();'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/provider-contract-dependency');
});

test('阻止 provider 实现反向依赖业务层', () => {
	const files = [
		createManagedFile('src/domains/editor/service.ts', 'export function buildEditorState(): string { return "ok"; }'),
		createManagedFile('src/providers/event-bus.ts', 'import { buildEditorState } from "src/domains/editor/service";\nexport function createEventBus(): string { return buildEditorState(); }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/provider-reverse-dependency');
});

test('阻止 provider 实现彼此直接耦合', () => {
	const files = [
		createManagedFile('src/providers/event-bus.ts', 'export function createEventBus(): object { return {}; }'),
		createManagedFile('src/providers/settings.ts', 'import { createEventBus } from "./event-bus";\nexport function createSettingsProvider(): object { return createEventBus(); }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/provider-no-implementation-coupling');
});

test('阻止非 obsidian-api provider 直接导入 obsidian', () => {
	const files = [
		createManagedFile('src/providers/settings.ts', 'import { Notice } from "obsidian";\nexport function createSettingsProvider(): void { new Notice("boom"); }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.equal(violations.length, 1);
	assert.equal(violations[0].rule, 'arch/provider-obsidian-boundary');
});

test('阻止未授权 provider 与 chat service 直接访问 window/document', () => {
	const files = [
		createManagedFile('src/providers/settings.ts', 'export function createSettingsProvider(): string | null { return window.localStorage.getItem("x"); }'),
		createManagedFile('src/core/chat/services/chat-helper.ts', 'export function buildHelper(): HTMLElement { return document.body; }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.ok(violations.some((violation) => violation.rule === 'arch/no-global-host-access' && violation.filePath === 'src/providers/settings.ts'));
	assert.ok(violations.some((violation) => violation.rule === 'arch/no-global-host-access' && violation.filePath === 'src/core/chat/services/chat-helper.ts'));
});

test('允许 chat 组合根导入 provider 实现', () => {
	const files = [
		createManagedFile('src/providers/obsidian-api.ts', 'import { Notice } from "obsidian";\nexport function createObsidianApiProvider(): object { return new Notice("ok"); }'),
		createManagedFile('src/core/chat/chat-feature-manager.tsx', 'import { createObsidianApiProvider } from "src/providers/obsidian-api";\nexport class ChatFeatureManager { provider = createObsidianApiProvider(); }'),
	];
	assert.equal(lintArchitectureFiles(files).length, 0);
});

test('阻止 chat service 直接依赖 obsidian 或 consumer 壳层', () => {
	const files = [
		createManagedFile('src/core/chat/services/chat-service.ts', 'export class ChatService { notify(): void {} }'),
		createManagedFile('src/commands/chat/chat-view-coordinator.ts', 'export class ChatViewCoordinator {}'),
		createManagedFile('src/core/chat/services/chat-helper.ts', 'import { Notice } from "obsidian";\nimport type { ChatViewCoordinator } from "src/commands/chat/chat-view-coordinator";\nexport function buildHelper(_coordinator: ChatViewCoordinator): void { new Notice("boom"); }'),
	];
	const violations = lintArchitectureFiles(files);
	assert.ok(violations.some((violation) => violation.rule === 'arch/chat-no-direct-obsidian'));
	assert.ok(violations.some((violation) => violation.rule === 'arch/chat-service-boundary'));
});

test('将域内 service 支撑文件归类为 service 层', () => {
	assert.deepEqual(classifyManagedFile('src/domains/editor/service-helpers.ts'), {
		kind: 'domain',
		domainName: 'editor',
		layer: 'service',
	});
	assert.deepEqual(classifyManagedFile('src/providers/providers.types.ts'), {
		kind: 'provider',
		role: 'contract',
		moduleName: 'providers.types',
	});
	assert.deepEqual(classifyManagedFile('src/providers/obsidian-api.ts'), {
		kind: 'provider',
		role: 'implementation',
		moduleName: 'obsidian-api',
	});
	assert.deepEqual(classifyManagedFile('src/providers/obsidian-api-core.ts'), {
		kind: 'provider',
		role: 'implementation',
		moduleName: 'obsidian-api',
	});
	assert.deepEqual(classifyManagedFile('src/main.ts'), {
		kind: 'module',
		scope: 'root',
	});
	assert.deepEqual(classifyManagedFile('src/core/FeatureCoordinator.ts'), {
		kind: 'module',
		scope: 'root',
	});
	assert.deepEqual(classifyManagedFile('src/core/PluginStartupCoordinator.ts'), {
		kind: 'module',
		scope: 'root',
	});
	assert.deepEqual(classifyManagedFile('src/commands/ai-runtime/AiRuntimeCommandManager.ts'), {
		kind: 'module',
		scope: 'command',
	});
	assert.deepEqual(classifyManagedFile('src/core/chat/chat-feature-manager.tsx'), {
		kind: 'chat',
		role: 'consumer',
	});
	assert.deepEqual(classifyManagedFile('src/domains/mcp/runtime/runtime-manager.ts'), {
		kind: 'domain',
		domainName: 'mcp',
		layer: 'service',
	});
	assert.deepEqual(classifyManagedFile('src/domains/mcp/transport/http-transport.ts'), {
		kind: 'domain',
		domainName: 'mcp',
		layer: 'service',
	});
	assert.deepEqual(classifyManagedFile('src/core/chat/services/chat-service.ts'), {
		kind: 'chat',
		role: 'service',
	});
	assert.deepEqual(classifyManagedFile('src/core/chat/services/file-content-service.ts'), {
		kind: 'chat',
		role: 'host-adapter',
	});
	assert.deepEqual(classifyManagedFile('src/core/chat/services/chat-provider-messages.ts'), {
		kind: 'chat',
		role: 'service',
	});
	assert.deepEqual(classifyManagedFile('src/commands/chat/chat-view-coordinator.ts'), {
		kind: 'shim',
		scope: 'command',
	});
	assert.deepEqual(classifyManagedFile('src/core/chat/utils/markdown.ts'), {
		kind: 'shim',
		scope: 'core',
	});
});

test('compat shim 只能保留 import/export 声明', () => {
	const validFiles = [
		createManagedFile(
			'src/commands/chat/chat-view-coordinator.ts',
			'export { ChatViewCoordinator } from "src/domains/chat/ui-view-coordinator";',
		),
	];
	assert.equal(lintArchitectureFiles(validFiles).length, 0);

	const invalidFiles = [
		createManagedFile(
			'src/commands/chat/chat-view-coordinator.ts',
			'import { demo } from "src/domains/chat/ui";\nconst leaked = demo;\nexport { leaked };',
		),
	];
	const violations = lintArchitectureFiles(invalidFiles);
	assert.ok(violations.some((violation) => violation.rule === 'arch/shim-only-reexport'));
});

test('taste linter 检测 any、console 与超长文件', () => {
	const oversized = Array.from({ length: 501 }, (_, index) => `export const line${index} = ${index};`).join('\n');
	const files = [
		createManagedFile('src/domains/editor/service.ts', `${oversized}\nexport function buildEditorState(value: any): any { console.log(value); return value; }`),
	];
	const violations = lintTasteFiles(files);
	assert.ok(violations.some((violation) => violation.rule === 'taste/max-lines'));
	assert.ok(violations.some((violation) => violation.rule === 'taste/no-any'));
	assert.ok(violations.some((violation) => violation.rule === 'taste/no-console'));
});

test('taste linter 检测文件名、barrel export 和类型命名', () => {
	const files = [
		createManagedFile('src/providers/BadName.ts', 'export interface bad_name { value: string; }\nexport const broken_value = 1;'),
		createManagedFile('src/domains/editor/service.ts', 'export { brokenValue } from "./helpers";\nexport interface badType { value: string; }\nexport function BuildEditorState(): void {}'),
	];
	const violations = lintTasteFiles(files);
	assert.ok(violations.some((violation) => violation.rule === 'taste/file-name'));
	assert.ok(violations.some((violation) => violation.rule === 'taste/no-barrel-export'));
	assert.ok(violations.some((violation) => violation.rule === 'taste/type-name'));
	assert.ok(violations.some((violation) => violation.rule === 'taste/function-name'));
});

test('taste linter 检测 folder import 指向 index.ts', () => {
	const files = [
		createManagedFile('src/core/chat/services/child/index.ts', 'export const value = "ok";'),
		createManagedFile('src/core/chat/services/consumer.ts', 'import { value } from "./child";\nexport function readValue(): string { return value; }'),
	];
	const violations = lintTasteFiles(files);
	assert.ok(violations.some((violation) => violation.rule === 'taste/no-folder-import'));
});

test('taste linter 检测方法和函数变量的副作用命名', () => {
	const files = [
		createManagedFile('src/domains/editor/service.ts', 'export const completionAction = (): void => { setTimeout(() => undefined, 0); };\nexport class EditorDomainController { update(): void { notify("boom"); } }\nfunction notify(_message: string): void {}'),
	];
	const violations = lintTasteFiles(files);
	assert.ok(violations.some((violation) => violation.rule === 'taste/side-effect-name' && violation.message.includes('completionAction')));
	assert.ok(violations.some((violation) => violation.rule === 'taste/side-effect-name' && violation.message.includes('update')));
});

test('当前仓库 managed files 满足架构规则', () => {
	const violations = lintArchitecture(process.cwd());
	assert.deepEqual(violations, []);
});

test('当前仓库 managed files 满足品味规则', () => {
	const violations = lintTasteFiles(collectManagedFiles(process.cwd()));
	assert.deepEqual(violations, []);
});
