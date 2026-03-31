/**
 * @module providers/obsidian-api
 * @description 封装当前域迁移所需的 Obsidian API 能力。
 *
 * @dependencies obsidian, src/providers/providers.types, src/providers/obsidian-api-core
 * @side-effects 触发 Notice、读取全局系统提示词、访问 Vault、注册 Vault 事件
 * @invariants 不向域层泄露 App 或 Plugin 实例。
 */

import type { App, Component, EventRef } from 'obsidian';
import {
	MarkdownRenderer,
	MarkdownView,
	Notice,
	TFile,
	TFolder,
	normalizePath as normalizeVaultPath,
	parseYaml,
	requestUrl,
	stringifyYaml,
} from 'obsidian';
import { createObsidianApiProviderFromRuntime, type ObsidianApiRuntime, type ObsidianVaultNode } from './obsidian-api-core';
import type {
	HttpRequestOptions,
	ObsidianApiProvider,
	VaultChangeEvent,
	VaultStat,
} from './providers.types';

/**
 * @precondition app 为有效的 Obsidian App 实例
 * @postcondition 返回可复用的 Provider 对象
 * @throws 从不抛出
 * @example createObsidianApiProvider(app)
 */
const AI_DATA_SUBFOLDERS = [
	'ai prompts',
	'chat-history',
	'quick-actions',
	'system-prompts',
	'mcp-servers',
	'multi-model',
	'skills',
	'agents',
] as const;

export function createObsidianApiProvider(
	app: App,
): ObsidianApiProvider {
	return createObsidianApiProviderFromRuntime(
		createObsidianApiRuntime(app),
	);
}

function createObsidianApiRuntime(app: App): ObsidianApiRuntime {
	return {
		notify(message: string, timeout?: number): void {
			new Notice(message, timeout);
		},
		normalizePath(path: string): string {
			return normalizeVaultPath(path);
		},
		async ensureAiDataFolders(aiDataFolder: string): Promise<void> {
			const rootPath = normalizeVaultPath(aiDataFolder.replace(/[\\/]+$/gu, ''));
			await ensureVaultFolderPath(app, rootPath);
			for (const subfolder of AI_DATA_SUBFOLDERS) {
				await ensureVaultFolderPath(app, `${rootPath}/${subfolder}`);
			}
		},
		async ensureVaultFolder(folderPath: string): Promise<string> {
			const normalizedPath = normalizeVaultPath(folderPath);
			await ensureVaultFolderPath(app, normalizedPath);
			return normalizedPath;
		},
		async requestUrl(options: HttpRequestOptions): Promise<{
			readonly status: number;
			readonly text?: string;
			readonly headers: Record<string, string>;
			readonly json?: unknown;
			readonly arrayBuffer?: ArrayBuffer;
		}> {
			const response = await requestUrl({
				url: options.url,
				method: options.method,
				headers: options.headers,
				body: options.body,
			});
			return {
				status: response.status,
				text: response.text,
				headers: { ...response.headers },
				json: response.json,
				arrayBuffer: response.arrayBuffer,
			};
		},
		getAbstractFileByPath(path: string): ObsidianVaultNode | null {
			const entry = app.vault.getAbstractFileByPath(path);
			if (!entry) {
				return null;
			}
			if (entry instanceof TFolder) {
				return {
					path: entry.path,
					name: entry.name,
					kind: 'folder',
					children: entry.children.map((child) => mapVaultNode(child)).filter((child): child is ObsidianVaultNode => child !== null),
				};
			}
			if (entry instanceof TFile) {
				return {
					path: entry.path,
					name: entry.name,
					kind: 'file',
				};
			}
			return null;
		},
		getVaultName(): string {
			return app.vault.getName();
		},
		getActiveFilePath(): string | null {
			return app.workspace.getActiveFile()?.path ?? null;
		},
		async getAvailablePathForAttachment(filename: string): Promise<string> {
			return await app.fileManager.getAvailablePathForAttachment(filename);
		},
		getFrontmatter(path: string): Record<string, unknown> | null {
			const entry = app.vault.getAbstractFileByPath(path);
			if (!(entry instanceof TFile)) {
				return null;
			}
			const frontmatter = app.metadataCache.getFileCache(entry)?.frontmatter;
			if (!frontmatter) {
				return null;
			}
			return JSON.parse(JSON.stringify(frontmatter)) as Record<string, unknown>;
		},
		async readVaultFile(path: string): Promise<string> {
			const entry = app.vault.getAbstractFileByPath(path);
			if (!(entry instanceof TFile)) {
				throw new Error(`文件不存在: ${path}`);
			}
			return await app.vault.read(entry);
		},
		async readVaultBinary(path: string): Promise<ArrayBuffer> {
			const entry = app.vault.getAbstractFileByPath(path);
			if (!(entry instanceof TFile)) {
				throw new Error(`文件不存在: ${path}`);
			}
			return await app.vault.readBinary(entry);
		},
		async writeVaultFile(path: string, content: string): Promise<void> {
			const entry = app.vault.getAbstractFileByPath(path);
			if (entry instanceof TFile) {
				await app.vault.modify(entry, content);
				return;
			}
			if (entry) {
				throw new Error(`路径已存在且不是文件: ${path}`);
			}
			await app.vault.create(path, content);
		},
		async writeVaultBinary(path: string, content: ArrayBuffer): Promise<void> {
			const entry = app.vault.getAbstractFileByPath(path);
			if (entry instanceof TFile) {
				const binaryVault = app.vault as typeof app.vault & {
					modifyBinary?: (file: TFile, data: ArrayBuffer) => Promise<void>;
				};
				if (typeof binaryVault.modifyBinary === 'function') {
					await binaryVault.modifyBinary(entry, content);
					return;
				}
				await app.vault.delete(entry);
				await app.vault.createBinary(path, content);
				return;
			}
			if (entry) {
				throw new Error(`路径已存在且不是文件: ${path}`);
			}
			await app.vault.createBinary(path, content);
		},
		async deleteVaultPath(path: string): Promise<void> {
			const entry = app.vault.getAbstractFileByPath(path);
			if (!entry) {
				return;
			}
			await app.vault.delete(entry, entry instanceof TFolder);
		},
		async pathExists(path: string): Promise<boolean> {
			return await app.vault.adapter.exists(path);
		},
		async statPath(path: string): Promise<VaultStat | null> {
			const stat = await app.vault.adapter.stat(path);
			if (!stat) {
				return null;
			}
			return {
				size: stat.size ?? 0,
				mtime: stat.mtime ?? 0,
				ctime: stat.ctime ?? 0,
			};
		},
		parseYaml(content: string): unknown {
			return parseYaml(content);
		},
		stringifyYaml(content: unknown): string {
			return stringifyYaml(content);
		},
		readLocalStorage(key: string): string | null {
			return window.localStorage.getItem(key);
		},
		writeLocalStorage(key: string, value: string): void {
			window.localStorage.setItem(key, value);
		},
		openSettingsTab(tabId: string): void {
			const settingApp = app as typeof app & {
				setting?: { open: () => void; openTabById: (id: string) => boolean };
			};
			settingApp.setting?.open();
			settingApp.setting?.openTabById(tabId);
		},
		insertTextIntoMarkdownEditor(content: string) {
			const activeMarkdownView = app.workspace.getActiveViewOfType(MarkdownView);
			if (activeMarkdownView?.editor) {
				activeMarkdownView.editor.replaceSelection(content);
				return {
					inserted: true,
					fileName: activeMarkdownView.file?.basename,
				};
			}

			const markdownLeaves = app.workspace.getLeavesOfType('markdown');
			const targetLeaf = markdownLeaves.find((leaf) => leaf === app.workspace.activeLeaf)
				?? markdownLeaves[0];
			const targetView = targetLeaf?.view;
			if (targetView instanceof MarkdownView && targetView.editor) {
				targetView.editor.replaceSelection(content);
				return {
					inserted: true,
					fileName: targetView.file?.basename,
				};
			}

			return { inserted: false };
		},
		openInternalLink(linkTarget: string, sourcePath?: string): void {
			app.workspace.openLinkText(linkTarget, sourcePath ?? '', true);
		},
		async renderMarkdown(
			markdown: string,
			container: HTMLElement,
			sourcePath: string,
			component: unknown,
		): Promise<void> {
			await MarkdownRenderer.render(
				app,
				markdown,
				container,
				sourcePath,
				component as Component,
			);
		},
		onVaultChange(type: VaultChangeEvent['type'], listener: (path: string, oldPath?: string) => void): EventRef {
			switch (type) {
				case 'create':
					return app.vault.on('create', (file) => listener(file.path));
				case 'modify':
					return app.vault.on('modify', (file) => listener(file.path));
				case 'delete':
					return app.vault.on('delete', (file) => listener(file.path));
				case 'rename':
					return app.vault.on('rename', (file, oldPath) => listener(file.path, oldPath));
			}
		},
		offVaultChange(ref: unknown): void {
			app.vault.offref(ref as EventRef);
		},
	};
}

async function ensureVaultFolderPath(app: App, folderPath: string): Promise<void> {
	if (!folderPath) {
		return;
	}

	const segments = folderPath.split('/').filter(Boolean);
	let currentPath = '';
	for (const segment of segments) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		const entry = app.vault.getAbstractFileByPath(currentPath);
		if (entry instanceof TFolder) {
			continue;
		}
		if (entry) {
			throw new Error(`路径已存在且不是文件夹: ${currentPath}`);
		}
		try {
			await app.vault.createFolder(currentPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!message.includes('Folder already exists')) {
				throw error;
			}
		}
	}
}

function mapVaultNode(entry: TAbstractFile): ObsidianVaultNode | null {
	if (entry instanceof TFolder) {
		return {
			path: entry.path,
			name: entry.name,
			kind: 'folder',
			children: entry.children.map((child) => mapVaultNode(child)).filter((child): child is ObsidianVaultNode => child !== null),
		};
	}
	if (entry instanceof TFile) {
		return {
			path: entry.path,
			name: entry.name,
			kind: 'file',
		};
	}
	return null;
}
