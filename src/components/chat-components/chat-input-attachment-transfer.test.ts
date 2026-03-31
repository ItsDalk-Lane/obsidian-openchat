import assert from 'node:assert/strict';
import test from 'node:test';
import type { VaultEntry } from 'src/providers/providers.types';
import {
	buildChatInputAttachmentNoticeMessage,
	resolveChatInputAttachmentBatch,
	resolveVaultPathFromAbsolutePath,
	type ChatInputAttachmentHost,
} from './chatInputAttachmentTransfer';
import {
	extractAbsolutePathsFromClipboardText,
	getChatInputAttachmentKind,
} from './chatInputAttachmentSources';

const normalizePath = (value: string): string => value
	.replace(/\\/gu, '/')
	.replace(/\/+/gu, '/')
	.replace(/^\/+?/u, '')
	.replace(/\/$/u, '');

test('getChatInputAttachmentKind 按图片、文本和不支持类型分类', () => {
	assert.equal(getChatInputAttachmentKind('note.md'), 'document');
	assert.equal(getChatInputAttachmentKind('Dockerfile'), 'document');
	assert.equal(getChatInputAttachmentKind('image.png', 'image/png'), 'image');
	assert.equal(getChatInputAttachmentKind('archive.zip'), 'unsupported');
	assert.equal(getChatInputAttachmentKind('', 'text/plain'), 'document');
});

test('resolveVaultPathFromAbsolutePath 支持 Windows 路径映射并忽略库外文件', () => {
	assert.equal(
		resolveVaultPathFromAbsolutePath('C:\\Vault\\docs\\plan.md', 'C:\\Vault'),
		'docs/plan.md',
	);
	assert.equal(
		resolveVaultPathFromAbsolutePath('C:\\VAULT\\docs\\plan.md', 'c:\\vault'),
		'docs/plan.md',
	);
	assert.equal(
		resolveVaultPathFromAbsolutePath('D:\\Other\\plan.md', 'C:\\Vault'),
		null,
	);
});

test('extractAbsolutePathsFromClipboardText 解析 file uri、引号路径与普通绝对路径', () => {
	assert.deepEqual(
		extractAbsolutePathsFromClipboardText([
			'"C:\\Vault\\docs\\plan.md"',
			'file:///D:/External/notes/todo.txt',
			'not-a-path',
		].join('\n')),
		['C:\\Vault\\docs\\plan.md', 'D:/External/notes/todo.txt'],
	);
});

test('resolveChatInputAttachmentBatch 复用 vault 路径、导入外部文本并汇总失败项', async () => {
	const ensuredFolders: string[] = [];
	const writes: Array<{ path: string; content: string }> = [];
	const vaultEntries = new Map<string, VaultEntry>([
		['docs/existing.md', { path: 'docs/existing.md', name: 'existing.md', kind: 'file' }],
		['docs/already.md', { path: 'docs/already.md', name: 'already.md', kind: 'file' }],
	]);
	const host: ChatInputAttachmentHost = {
		getAiDataFolder: () => 'AI Data',
		getVaultBasePath: () => 'C:\\Vault',
		ensureVaultFolder: async (folderPath) => {
			const normalized = normalizePath(folderPath);
			ensuredFolders.push(normalized);
			return normalized;
		},
		getVaultEntry: (path) => vaultEntries.get(normalizePath(path)) ?? null,
		normalizePath,
		writeVaultFile: async (path, content) => {
			writes.push({ path: normalizePath(path), content });
		},
	};

	const batch = await resolveChatInputAttachmentBatch({
		host,
		existingSelectedFilePaths: new Set(['docs/already.md']),
		sources: [
			{
				kind: 'document',
				name: 'existing.md',
				absolutePath: 'C:\\Vault\\docs\\existing.md',
				readText: async () => 'ignored',
			},
			{
				kind: 'document',
				name: 'outside.md',
				absolutePath: 'D:\\External\\outside.md',
				readText: async () => 'outside',
			},
			{
				kind: 'document',
				name: 'already.md',
				absolutePath: 'C:\\Vault\\docs\\already.md',
				readText: async () => 'duplicate',
			},
			{
				kind: 'image',
				name: 'shot.png',
				mimeType: 'image/png',
				readDataUrl: async () => 'data:image/png;base64,AAA=',
			},
			{
				kind: 'unsupported',
				name: 'archive.zip',
			},
			{
				kind: 'document',
				name: 'broken.md',
				absolutePath: 'D:\\External\\broken.md',
				readText: async () => {
					throw new Error('boom');
				},
			},
			{
				kind: 'document',
				name: 'nested.md',
				absolutePath: 'D:\\External\\folder\\nested.md',
				readText: async () => 'nested',
			},
			{
				kind: 'document',
				name: 'nested.md',
				absolutePath: 'D:\\External\\folder\\nested.md',
				readText: async () => 'nested duplicate',
			},
		],
	});

	assert.equal(batch.images.length, 1);
	assert.deepEqual(batch.unsupportedEntries, ['.zip']);
	assert.deepEqual(batch.failedEntries, ['broken.md']);
	assert.deepEqual(
		batch.files.map((file) => file.path),
		[
			'docs/existing.md',
			batch.files[1]?.path,
			batch.files[2]?.path,
		],
	);
	assert.equal(batch.files[0]?.attachmentSource, undefined);
	assert.match(batch.files[1]?.path ?? '', /^AI Data\/chat-history\/files\//u);
	assert.match(batch.files[2]?.path ?? '', /^AI Data\/chat-history\/files\//u);
	assert.equal(batch.files[1]?.name, 'outside.md');
	assert.equal(batch.files[2]?.name, 'nested.md');
	assert.equal(batch.files[1]?.attachmentSource, 'managed-import');
	assert.equal(batch.files[2]?.attachmentSource, 'managed-import');
	assert.equal(ensuredFolders.length, 1);
	assert.equal(ensuredFolders[0], 'AI Data/chat-history/files');
	assert.deepEqual(
		writes.map((item) => item.content),
		['outside', 'nested'],
	);
});

test('buildChatInputAttachmentNoticeMessage 仅在部分失败时返回汇总提示', () => {
	assert.equal(
		buildChatInputAttachmentNoticeMessage({
			addedFiles: 1,
			addedImages: 1,
			unsupportedEntries: [],
			failedEntries: [],
		}),
		null,
	);

	const message = buildChatInputAttachmentNoticeMessage({
		addedFiles: 2,
		addedImages: 1,
		unsupportedEntries: ['.zip', '.pdf'],
		failedEntries: ['broken.md'],
	});
	assert.ok(message);
	assert.match(message ?? '', /2|1/u);
	assert.match(message ?? '', /zip/u);
	assert.match(message ?? '', /pdf/u);
});