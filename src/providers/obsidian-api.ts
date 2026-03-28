/**
 * @module providers/obsidian-api
 * @description 封装当前域迁移所需的 Obsidian API 能力。
 *
 * @dependencies obsidian, src/providers/providers.types, src/utils/AIPathManager
 * @side-effects 触发 Notice、读取全局系统提示词、访问 Vault、注册 Vault 事件
 * @invariants 不向域层泄露 App 或 Plugin 实例。
 */

import type { App, EventRef } from 'obsidian';
import { Notice, TFile, TFolder, normalizePath as normalizeVaultPath, parseYaml, requestUrl } from 'obsidian';
import { ensureAIDataFolders } from 'src/utils/AIPathManager';
import { createObsidianApiProviderFromRuntime, type ObsidianApiRuntime, type ObsidianVaultNode } from './obsidian-api-core';
import type {
	HttpRequestOptions,
	ObsidianApiProvider,
	VaultChangeEvent,
	VaultStat,
} from './providers.types';

/**
 * @precondition app 为有效的 Obsidian App 实例，buildGlobalSystemPrompt 由外层注入
 * @postcondition 返回可复用的 Provider 对象
 * @throws 从不抛出
 * @example createObsidianApiProvider(app, async () => '')
 */
export function createObsidianApiProvider(
	app: App,
	buildGlobalSystemPrompt: (featureId: string) => Promise<string>,
): ObsidianApiProvider {
	return createObsidianApiProviderFromRuntime(
		createObsidianApiRuntime(app),
		buildGlobalSystemPrompt,
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
			await ensureAIDataFolders(app, aiDataFolder);
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

function mapVaultNode(entry: TFile | TFolder): ObsidianVaultNode | null {
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
