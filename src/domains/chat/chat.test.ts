import test from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_CHAT_SETTINGS,
	DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	normalizeMessageManagementSettings,
} from './config';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import {
	createChatVaultPort,
	createChatHostPorts,
	detectImageGenerationIntent,
	isPinnedChatMessage,
} from './service';
import { resolveChatModalDimensions } from './ui';

test('normalizeMessageManagementSettings 在缺失配置时回退默认值', () => {
	assert.deepEqual(
		normalizeMessageManagementSettings(null),
		DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	);
});

test('normalizeMessageManagementSettings 会裁剪 recentTurns 并清理 summaryModelTag', () => {
	assert.deepEqual(normalizeMessageManagementSettings({
		recentTurns: 2.9,
		summaryModelTag: '  claude  ',
	}), {
		enabled: true,
		recentTurns: 2,
		summaryModelTag: 'claude',
	});
	assert.deepEqual(normalizeMessageManagementSettings({ recentTurns: 0, summaryModelTag: '   ' }), {
		enabled: true,
		recentTurns: 1,
		summaryModelTag: undefined,
	});
});

test('DEFAULT_CHAT_SETTINGS 保持 legacy 默认值', () => {
	assert.equal(DEFAULT_CHAT_SETTINGS.openMode, 'sidebar');
	assert.equal(DEFAULT_CHAT_SETTINGS.enableQuickActions, true);
	assert.equal(DEFAULT_CHAT_SETTINGS.quickActionsStreamOutput, true);
	assert.equal(DEFAULT_CHAT_SETTINGS.chatModalWidth, 700);
	assert.equal(DEFAULT_CHAT_SETTINGS.chatModalHeight, 500);
	assert.equal('showRibbonIcon' in DEFAULT_CHAT_SETTINGS, false);
	assert.deepEqual(
		DEFAULT_CHAT_SETTINGS.messageManagement,
		DEFAULT_MESSAGE_MANAGEMENT_SETTINGS,
	);
});

test('isPinnedChatMessage 仅在 metadata.pinned 为 true 时返回 true', () => {
	assert.equal(isPinnedChatMessage(null), false);
	assert.equal(isPinnedChatMessage(undefined), false);
	assert.equal(isPinnedChatMessage({ metadata: undefined }), false);
	assert.equal(isPinnedChatMessage({ metadata: { pinned: false } }), false);
	assert.equal(isPinnedChatMessage({ metadata: { pinned: true } }), true);
});

test('createChatVaultPort 会把 provider 的 vault 原语收敛成 chat 域端口', async () => {
	const calls: string[] = [];
	const provider = {
		notify(message: string, timeout?: number): void {
			calls.push(`notify:${message}:${String(timeout)}`);
		},
		normalizePath(path: string): string {
			calls.push(`path:${path}`);
			return path.replace(/\\/gu, '/');
		},
		async ensureAiDataFolders(aiDataFolder: string): Promise<void> {
			calls.push(`folders:${aiDataFolder}`);
		},
		async ensureVaultFolder(folderPath: string): Promise<string> {
			calls.push(`ensure-folder:${folderPath}`);
			return folderPath.replace(/\\/gu, '/');
		},
		async requestHttp(options): Promise<{ status: number; text: string; headers: Record<string, string> }> {
			calls.push(`http:${options.method}:${options.url}`);
			return { status: 200, text: 'ok', headers: {} };
		},
		getVaultEntry(path: string) {
			calls.push(`entry:${path}`);
			return { path, name: 'note.md', kind: 'file' as const };
		},
		getVaultName(): string {
			return 'vault';
		},
		getActiveFilePath(): string | null {
			return null;
		},
		async getAvailableAttachmentPath(filename: string): Promise<string> {
			return filename;
		},
		getFrontmatter() {
			return null;
		},
		async pathExists(path: string): Promise<boolean> {
			calls.push(`exists:${path}`);
			return true;
		},
		async statPath(path: string) {
			calls.push(`stat:${path}`);
			return { size: 12, mtime: 20, ctime: 10 };
		},
		listFolderEntries(folderPath: string): readonly [{ path: string; name: string; kind: 'folder' }] {
			calls.push(`list:${folderPath}`);
			return [{ path: folderPath, name: 'root', kind: 'folder' }];
		},
		async readVaultFile(filePath: string): Promise<string> {
			calls.push(`read:${filePath}`);
			return 'content';
		},
		async readVaultBinary(filePath: string): Promise<ArrayBuffer> {
			calls.push(`read-binary:${filePath}`);
			return new Uint8Array([1, 2, 3]).buffer;
		},
		async writeVaultFile(filePath: string, content: string): Promise<void> {
			calls.push(`write:${filePath}:${content}`);
		},
		async writeVaultBinary(filePath: string, content: ArrayBuffer): Promise<void> {
			calls.push(`write-binary:${filePath}:${content.byteLength}`);
		},
		async deleteVaultPath(path: string): Promise<void> {
			calls.push(`delete:${path}`);
		},
		parseYaml(content: string): unknown {
			calls.push(`yaml:${content}`);
			return { raw: content };
		},
		stringifyYaml(content: unknown): string {
			return JSON.stringify(content);
		},
		readLocalStorage(): string | null {
			return null;
		},
		writeLocalStorage(): void {},
		openSettingsTab(): void {},
		insertTextIntoMarkdownEditor() {
			return { inserted: false };
		},
		onVaultChange(): () => void {
			calls.push('watch');
			return () => {
				calls.push('unwatch');
			};
		},
		extra(): void {
			calls.push('extra');
		},
	} satisfies ObsidianApiProvider & { extra(): void };

	const vault = createChatVaultPort(provider);

	assert.equal('extra' in vault, false);
	assert.deepEqual(vault.getEntry('note.md'), {
		path: 'note.md',
		name: 'note.md',
		kind: 'file',
	});
	assert.equal(await vault.exists('note.md'), true);
	assert.deepEqual(await vault.stat('note.md'), { size: 12, mtime: 20, ctime: 10 });
	assert.deepEqual(vault.listFolderEntries('vault/path'), [
		{ path: 'vault/path', name: 'root', kind: 'folder' },
	]);
	assert.equal(await vault.ensureFolder('folder\\nested'), 'folder/nested');
	assert.equal(await vault.readText('file.md'), 'content');
	assert.deepEqual(new Uint8Array(await vault.readBinary('image.png')), new Uint8Array([1, 2, 3]));
	await vault.writeText('file.md', 'updated');
	await vault.writeBinary('image.png', new Uint8Array([4, 5]).buffer);
	await vault.deletePath('file.md');
	const dispose = vault.watch(() => undefined);
	dispose();

	assert.deepEqual(calls, [
		'entry:note.md',
		'exists:note.md',
		'stat:note.md',
		'list:vault/path',
		'ensure-folder:folder\\nested',
		'read:file.md',
		'read-binary:image.png',
		'write:file.md:updated',
		'write-binary:image.png:2',
		'delete:file.md',
		'watch',
		'unwatch',
	]);
});

test('createChatHostPorts 仅暴露 chat 域需要的宿主原语与 vault 子端口', async () => {
	const provider = {
		notify(): void {},
		normalizePath(path: string): string {
			return path.replace(/\\/gu, '/');
		},
		async ensureAiDataFolders(): Promise<void> {},
		async ensureVaultFolder(folderPath: string): Promise<string> {
			return folderPath.replace(/\\/gu, '/');
		},
		async requestHttp(): Promise<{ status: number; text: string; headers: Record<string, string> }> {
			return { status: 200, text: '', headers: {} };
		},
		getVaultEntry() {
			return null;
		},
		getVaultName(): string {
			return 'vault';
		},
		getActiveFilePath(): string | null {
			return null;
		},
		async getAvailableAttachmentPath(filename: string): Promise<string> {
			return filename;
		},
		getFrontmatter() {
			return null;
		},
		async pathExists(): Promise<boolean> {
			return false;
		},
		async statPath() {
			return null;
		},
		listFolderEntries(): readonly [] {
			return [];
		},
		async readVaultFile(): Promise<string> {
			return '';
		},
		async readVaultBinary(): Promise<ArrayBuffer> {
			return new Uint8Array().buffer;
		},
		async writeVaultFile(): Promise<void> {},
		async writeVaultBinary(): Promise<void> {},
		async deleteVaultPath(): Promise<void> {},
		parseYaml(): unknown {
			return {};
		},
		stringifyYaml(): string {
			return '';
		},
		readLocalStorage(): string | null {
			return null;
		},
		writeLocalStorage(): void {},
		openSettingsTab(): void {},
		insertTextIntoMarkdownEditor() {
			return { inserted: false };
		},
		onVaultChange(): () => void {
			return () => {};
		},
		extra(): void {},
	} satisfies ObsidianApiProvider & { extra(): void };

	const ports = createChatHostPorts(provider);

	assert.equal('extra' in ports, false);
	assert.equal('getVaultEntry' in ports, false);
	assert.equal('vault' in ports, true);
	assert.equal(ports.normalizePath('a\\b'), 'a/b');
	assert.deepEqual(ports.vault.listFolderEntries('folder'), []);
});

test('detectImageGenerationIntent 识别明确的图片生成请求', () => {
	assert.equal(detectImageGenerationIntent('请帮我生成一张风景图片'), true);
	assert.equal(detectImageGenerationIntent('draw a picture of a lighthouse'), true);
	assert.equal(detectImageGenerationIntent('visualize an icon for my app'), true);
});

test('detectImageGenerationIntent 避免把计划或文档类请求误判为图片', () => {
	assert.equal(detectImageGenerationIntent('画一个测试计划'), false);
	assert.equal(detectImageGenerationIntent('create a project plan'), false);
	assert.equal(detectImageGenerationIntent(''), false);
});

test('resolveChatModalDimensions 对缺失设置回退默认值', () => {
	assert.deepEqual(resolveChatModalDimensions(), { width: 700, height: 500 });
	assert.deepEqual(resolveChatModalDimensions({ chatModalWidth: 840, chatModalHeight: 620 }), {
		width: 840,
		height: 620,
	});
	assert.deepEqual(resolveChatModalDimensions({ chatModalWidth: 900, chatModalHeight: DEFAULT_CHAT_SETTINGS.chatModalHeight }), {
		width: 900,
		height: 500,
	});
});

test('legacy src/types/chat shim 继续暴露 chat 域默认值与 helper', async () => {
	const legacyChatModule = await import('src/types/chat');
	assert.equal(legacyChatModule.DEFAULT_CHAT_SETTINGS.openMode, DEFAULT_CHAT_SETTINGS.openMode);
	assert.equal(
		legacyChatModule.isPinnedChatMessage({ metadata: { pinned: true } }),
		true,
	);
	assert.equal(
		legacyChatModule.detectImageGenerationIntent('show me an image of a cat'),
		true,
	);
});
