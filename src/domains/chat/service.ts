/**
 * @module chat/service
 * @description 提供 chat 域首批迁入的纯 helper 与宿主端口契约。
 *
 * @dependencies src/domains/chat/types, src/providers/providers.types
 * @side-effects 无
 * @invariants 当前仅承载纯函数与稳定端口，不直接访问 Obsidian API 实现。
 */

import type {
	HttpRequestOptions,
	HttpResponseData,
	ObsidianApiProvider,
	VaultChangeEvent,
	VaultEntry,
	VaultStat,
} from 'src/providers/providers.types';
import type { ChatMessage } from './types';

export interface ChatDomainLogger {
	debug?(message: string, metadata?: unknown): void;
	info?(message: string, metadata?: unknown): void;
	warn(message: string, metadata?: unknown): void;
	error(message: string, metadata?: unknown): void;
}

export interface ChatVaultPort {
	getEntry(path: string): VaultEntry | null;
	exists(path: string): Promise<boolean>;
	stat(path: string): Promise<VaultStat | null>;
	listFolderEntries(folderPath: string): readonly VaultEntry[];
	ensureFolder(folderPath: string): Promise<string>;
	readText(filePath: string): Promise<string>;
	readBinary(filePath: string): Promise<ArrayBuffer>;
	writeText(filePath: string, content: string): Promise<void>;
	writeBinary(filePath: string, content: ArrayBuffer): Promise<void>;
	deletePath(path: string): Promise<void>;
	watch(listener: (event: VaultChangeEvent) => void): () => void;
}

export interface ChatSkillDescriptor {
	name: string;
	description: string;
	skillFilePath: string;
	basePath: string;
}

export interface ChatSkillsSnapshot {
	skills: ChatSkillDescriptor[];
	errors: Array<{
		path: string;
		reason: string;
		severity?: 'warning' | 'error';
	}>;
}

export interface ChatSkillsPort {
	ensureInitialized(): Promise<void>;
	getInstalledSnapshot(): ChatSkillsSnapshot | null;
	refresh(): Promise<ChatSkillsSnapshot>;
	onChange(listener: (snapshot: ChatSkillsSnapshot) => void): () => void;
}

export interface ChatMcpPort {
	ensureInitialized(): Promise<void>;
	getRuntime(): unknown | null;
	getCustomToolExecutors(): readonly unknown[];
}

export interface ChatToolSettingsPort {
	getMaxToolCallLoops(): number | null;
}

export interface ChatHostPorts {
	notify(message: string, timeout?: number): void;
	buildGlobalSystemPrompt(featureId: string): Promise<string>;
	normalizePath(path: string): string;
	ensureAiDataFolders(aiDataFolder: string): Promise<void>;
	requestHttp(options: HttpRequestOptions): Promise<HttpResponseData>;
	parseYaml(content: string): unknown;
	vault: ChatVaultPort;
}

export function createChatVaultPort(provider: ObsidianApiProvider): ChatVaultPort {
	return {
		getEntry: (path) => provider.getVaultEntry(path),
		exists: (path) => provider.pathExists(path),
		stat: (path) => provider.statPath(path),
		listFolderEntries: (folderPath) => provider.listFolderEntries(folderPath),
		ensureFolder: (folderPath) => provider.ensureVaultFolder(folderPath),
		readText: (filePath) => provider.readVaultFile(filePath),
		readBinary: (filePath) => provider.readVaultBinary(filePath),
		writeText: (filePath, content) => provider.writeVaultFile(filePath, content),
		writeBinary: (filePath, content) => provider.writeVaultBinary(filePath, content),
		deletePath: (path) => provider.deleteVaultPath(path),
		watch: (listener) => provider.onVaultChange(listener),
	};
}

export function createChatHostPorts(provider: ObsidianApiProvider): ChatHostPorts {
	return {
		notify: (message, timeout) => provider.notify(message, timeout),
		buildGlobalSystemPrompt: (featureId) => provider.buildGlobalSystemPrompt(featureId),
		normalizePath: (path) => provider.normalizePath(path),
		ensureAiDataFolders: (aiDataFolder) => provider.ensureAiDataFolders(aiDataFolder),
		requestHttp: (options) => provider.requestHttp(options),
		parseYaml: (content) => provider.parseYaml(content),
		vault: createChatVaultPort(provider),
	};
}

export function isPinnedChatMessage(
	message: Pick<ChatMessage, 'metadata'> | null | undefined,
): boolean {
	return message?.metadata?.pinned === true;
}

export function detectImageGenerationIntent(content: string): boolean {
	if (!content) {
		return false;
	}

	const lowerContent = content.toLowerCase();
	const explicitPhrases = [
		'图片生成', '图像生成', '作画', '绘画', '画图',
		'visualize', 'visualize a', 'visualize an',
		'show me a picture', 'show me an image',
		'display a picture', 'display an image',
	];
	if (explicitPhrases.some((phrase) => lowerContent.includes(phrase))) {
		return true;
	}

	const nonImageIndicators = [
		'计划', '方案', '方法', '流程', '系统', '策略', '模型', '框架', '文档', '报告',
		'故事', '代码', '文件', '列表', '表格', '总结', '概述', '分析', '结论',
		'重点', '笔记', '大纲', '草稿', '项目', '任务', '问题', '答案', '想法',
		'plan', 'strategy', 'method', 'approach', 'system', 'process', 'workflow',
		'story', 'code', 'file', 'list', 'table', 'summary', 'overview', 'analysis',
		'conclusion', 'note', 'outline', 'draft', 'project', 'task', 'problem', 'idea',
		'document', 'report', 'proposal', 'solution', 'concept',
	];
	const isBlacklisted = (text: string, pattern: string): boolean => {
		const index = text.indexOf(pattern);
		if (index === -1) {
			return false;
		}
		const afterPattern = text.slice(index + pattern.length).trim();
		const firstWord = afterPattern.split(/\s+/u)[0];
		return nonImageIndicators.some((word) => firstWord.includes(word));
	};

	const chinesePatterns = [
		{ pattern: '画一个', maxLength: 12 },
		{ pattern: '画一张', maxLength: 12 },
		{ pattern: '画一幅', maxLength: 12 },
		{ pattern: '画个', maxLength: 10 },
		{ pattern: '画张', maxLength: 10 },
		{ pattern: '生成一张', maxLength: 12 },
		{ pattern: '生成一幅', maxLength: 12 },
		{ pattern: '生成一个', maxLength: 12 },
		{ pattern: '绘制一张', maxLength: 12 },
		{ pattern: '绘制一个', maxLength: 12 },
		{ pattern: '创建一张', maxLength: 12 },
		{ pattern: '创建一个', maxLength: 12 },
		{ pattern: '制作一张', maxLength: 12 },
		{ pattern: '制作一个', maxLength: 12 },
		{ pattern: '设计一张', maxLength: 12 },
		{ pattern: '设计一个', maxLength: 12 },
		{ pattern: '创作一张', maxLength: 12 },
		{ pattern: '创作一个', maxLength: 12 },
	];
	const imageRelatedWords = [
		'流程图', '结构图', '思维导图', '架构图', '示意图', '系统图',
		'肖像', '素描', '漫画', '线框图',
		'图片', '图像', '图表', '插图', '图画', '照片', '截图',
		'图', '画',
		'logo', '图标', '界面', '原型', 'ui',
	];
	for (const { pattern, maxLength } of chinesePatterns) {
		const index = lowerContent.indexOf(pattern);
		if (index === -1) {
			continue;
		}
		const afterPattern = lowerContent.slice(
			index + pattern.length,
			index + pattern.length + maxLength,
		);
		if (imageRelatedWords.some((word) => afterPattern.includes(word))) {
			return true;
		}
		if (isBlacklisted(lowerContent, pattern)) {
			continue;
		}
	}

	const englishPatterns = [
		'draw a', 'draw an', 'draw me a', 'draw me an',
		'paint a', 'paint an', 'paint me a', 'paint me an',
	];
	for (const pattern of englishPatterns) {
		if (!lowerContent.includes(pattern) || isBlacklisted(lowerContent, pattern)) {
			continue;
		}
		return true;
	}

	const otherEnglishPatterns = [
		{ pattern: 'make a', maxLength: 20 },
		{ pattern: 'make an', maxLength: 20 },
		{ pattern: 'design a', maxLength: 20 },
		{ pattern: 'design an', maxLength: 20 },
		{ pattern: 'create a', maxLength: 20 },
		{ pattern: 'create an', maxLength: 20 },
		{ pattern: 'generate a', maxLength: 20 },
		{ pattern: 'generate an', maxLength: 20 },
	];
	const englishImageWords = [
		'image', 'picture', 'photo', 'diagram', 'chart', 'graph', 'icon', 'logo',
		'illustration', 'sketch', 'drawing', 'painting', 'portrait', 'visual',
	];
	for (const { pattern, maxLength } of otherEnglishPatterns) {
		const index = lowerContent.indexOf(pattern);
		if (index === -1 || isBlacklisted(lowerContent, pattern)) {
			continue;
		}
		const afterPattern = lowerContent.slice(
			index + pattern.length,
			index + pattern.length + maxLength,
		);
		if (englishImageWords.some((word) => afterPattern.includes(word))) {
			return true;
		}
	}

	return false;
}