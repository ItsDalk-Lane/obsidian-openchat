/**
 * ChatImageResolver - 聊天图片解析服务
 * 负责解析用户输入中的图片引用并转换为 data URL
 * 从 ChatService 中拆分出来，遵循单一职责原则
 */
import { App, TFile, normalizePath, requestUrl } from 'obsidian';
import { getMimeTypeFromFilename, arrayBufferToBase64 } from 'src/LLMProviders/utils';

export class ChatImageResolver {
	constructor(private readonly app: App) {}

	/**
	 * 将 base64 字符串转换为 ArrayBuffer
	 */
	base64ToArrayBuffer(base64Data: string): ArrayBuffer {
		// 移除 data URL 前缀，如果存在
		const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

		// 解码 base64 字符串
		const binaryString = window.atob(base64);
		const bytes = new Uint8Array(binaryString.length);

		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		return bytes.buffer;
	}

	/**
	 * 合并已选图片和新解析的图片
	 */
	mergeSelectedImages(existingImages: string[], incomingImages: string[]): string[] {
		const mergedSet = new Set(existingImages);
		for (const image of incomingImages) {
			if (image && image.trim().length > 0) {
				mergedSet.add(image);
			}
		}
		return Array.from(mergedSet);
	}

	/**
	 * 检查是否为支持的图片 MIME 类型
	 */
	isSupportedImageMimeType(mimeType: string): boolean {
		return ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'].includes(mimeType);
	}

	/**
	 * 清理候选令牌
	 */
	sanitizeCandidateToken(token: string): string {
		const trimmed = token.trim();
		const unwrapped = trimmed.replace(/^<|>$/g, '').replace(/^['"]|['"]$/g, '');
		return unwrapped.replace(/[),.;]+$/g, '');
	}

	/**
	 * 从用户输入中提取图片引用候选
	 */
	extractImageReferenceCandidates(input: string): string[] {
		if (!input || input.trim().length === 0) {
			return [];
		}

		const candidates = new Set<string>();
		const pushCandidate = (value: string) => {
			const normalized = this.sanitizeCandidateToken(value);
			if (normalized.length > 0) {
				candidates.add(normalized);
			}
		};

		// Markdown 图片语法 ![alt](url)
		const markdownImageRegex = /!\[[^\]]*\]\(([^)]+)\)/gi;
		for (const match of input.matchAll(markdownImageRegex)) {
			if (match[1]) {
				pushCandidate(match[1]);
			}
		}

		// Obsidian wiki 图片语法 ![[image.png]]
		const wikiImageRegex = /!\[\[([^\]]+)\]\]/gi;
		for (const match of input.matchAll(wikiImageRegex)) {
			if (match[1]) {
				pushCandidate(match[1]);
			}
		}

		// 原始 wiki 链接 [[image.png]]
		const rawImageLinkRegex = /\[\[([^\]]+\.(?:png|jpe?g|gif|webp|bmp|svg)[^\]]*)\]\]/gi;
		for (const match of input.matchAll(rawImageLinkRegex)) {
			if (match[1]) {
				pushCandidate(match[1]);
			}
		}

		// Data URL
		const dataUrlRegex = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
		for (const match of input.matchAll(dataUrlRegex)) {
			if (match[0]) {
				pushCandidate(match[0]);
			}
		}

		// HTTP/HTTPS 图片 URL
		const httpImageRegex = /https?:\/\/[^\s)\]>]+\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s)\]>]*)?/gi;
		for (const match of input.matchAll(httpImageRegex)) {
			if (match[0]) {
				pushCandidate(match[0]);
			}
		}

		// Obsidian URL
		const obsidianUrlRegex = /obsidian:\/\/[^\s)\]>]+/gi;
		for (const match of input.matchAll(obsidianUrlRegex)) {
			if (match[0]) {
				pushCandidate(match[0]);
			}
		}

		// Windows 路径（带引号）
		const quotedWindowsPathRegex = /["']([a-zA-Z]:\\[^"']+\.(?:png|jpe?g|gif|webp|bmp|svg))["']/g;
		for (const match of input.matchAll(quotedWindowsPathRegex)) {
			if (match[1]) {
				pushCandidate(match[1]);
			}
		}

		// Windows 路径（不带引号）
		const plainWindowsPathRegex = /[a-zA-Z]:\\[^\s"'<>|?*]+\.(?:png|jpe?g|gif|webp|bmp|svg)/g;
		for (const match of input.matchAll(plainWindowsPathRegex)) {
			if (match[0]) {
				pushCandidate(match[0]);
			}
		}

		// 相对路径
		const relativePathRegex = /(?:\.\/|\.\.\/)?[^\s"'<>]+(?:\/[^\s"'<>]+)*\.(?:png|jpe?g|gif|webp|bmp|svg)/gi;
		for (const match of input.matchAll(relativePathRegex)) {
			if (match[0]) {
				pushCandidate(match[0]);
			}
		}

		return Array.from(candidates);
	}

	/**
	 * 剥离 Obsidian 链接装饰器
	 */
	stripObsidianLinkDecorators(candidate: string): string {
		const withoutAlias = candidate.split('|')[0] ?? candidate;
		const withoutHeading = withoutAlias.split('#')[0] ?? withoutAlias;
		return this.sanitizeCandidateToken(withoutHeading);
	}

	/**
	 * 从 data URL 提取 MIME 类型
	 */
	dataUrlToMimeType(dataUrl: string): string {
		const match = dataUrl.match(/^data:([^;]+);base64,/i);
		return match?.[1]?.toLowerCase() ?? 'application/octet-stream';
	}

	/**
	 * ArrayBuffer 转 data URL
	 */
	arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
		const base64 = arrayBufferToBase64(buffer);
		return `data:${mimeType};base64,${base64}`;
	}

	/**
	 * 安全转换 Uint8Array/Buffer 为 ArrayBuffer
	 */
	toSafeArrayBuffer(data: Uint8Array | Buffer): ArrayBuffer {
		return Uint8Array.from(data).buffer;
	}

	/**
	 * 从库中加载图片为 data URL
	 */
	async loadVaultImageAsDataUrl(vaultPath: string): Promise<string | null> {
		const normalized = normalizePath(vaultPath.replace(/^\//, ''));
		const abstractFile = this.app.vault.getAbstractFileByPath(normalized);
		if (!(abstractFile instanceof TFile)) {
			return null;
		}
		const mimeType = getMimeTypeFromFilename(abstractFile.name);
		if (!this.isSupportedImageMimeType(mimeType)) {
			return null;
		}
		const binary = await this.app.vault.readBinary(abstractFile);
		return this.arrayBufferToDataUrl(binary, mimeType);
	}

	/**
	 * 尝试从 Obsidian URL 解析库路径
	 */
	tryResolveVaultPathFromObsidianUrl(urlText: string): string | null {
		try {
			const url = new URL(urlText);
			if (url.protocol !== 'obsidian:') {
				return null;
			}

			if (url.hostname === 'open') {
				const pathParam = url.searchParams.get('path');
				if (pathParam) {
					return decodeURIComponent(pathParam);
				}

				const fileParam = url.searchParams.get('file');
				if (fileParam) {
					const vaultName = url.searchParams.get('vault');
					if (!vaultName || vaultName === this.app.vault.getName()) {
						return decodeURIComponent(fileParam);
					}
				}
			}

			if (url.hostname === 'vault') {
				const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
				const [vaultName, ...segments] = path.split('/');
				if (vaultName && vaultName === this.app.vault.getName() && segments.length > 0) {
					return segments.join('/');
				}
			}
		} catch {
			return null;
		}

		return null;
	}

	/**
	 * 构建库路径候选列表
	 */
	buildVaultPathCandidates(rawPath: string): string[] {
		const cleaned = this.stripObsidianLinkDecorators(rawPath).replace(/\\/g, '/');
		if (!cleaned) {
			return [];
		}

		const candidates = new Set<string>();
		candidates.add(cleaned);

		const activeFilePath = this.app.workspace.getActiveFile()?.path;
		if (activeFilePath && (cleaned.startsWith('./') || cleaned.startsWith('../'))) {
			const activeSegments = activeFilePath.split('/');
			activeSegments.pop();
			for (const segment of cleaned.split('/')) {
				if (segment === '.' || segment.length === 0) {
					continue;
				}
				if (segment === '..') {
					if (activeSegments.length > 0) {
						activeSegments.pop();
					}
					continue;
				}
				activeSegments.push(segment);
			}
			candidates.add(activeSegments.join('/'));
		}

		return Array.from(candidates).map((item) => normalizePath(item.replace(/^\//, '')));
	}

	/**
	 * 从外部路径加载图片为 data URL
	 */
	async loadExternalImageAsDataUrl(filePath: string): Promise<string | null> {
		try {
			const pathModule = await import('node:path');
			const fs = await import('node:fs/promises');
			const normalizedPath = this.stripObsidianLinkDecorators(filePath);
			const mimeType = getMimeTypeFromFilename(pathModule.basename(normalizedPath));
			if (!this.isSupportedImageMimeType(mimeType)) {
				return null;
			}

			const nodeBuffer = await fs.readFile(normalizedPath);
			const arrayBuffer = this.toSafeArrayBuffer(nodeBuffer);
			return this.arrayBufferToDataUrl(arrayBuffer, mimeType);
		} catch {
			return null;
		}
	}

	/**
	 * 从远程 URL 加载图片为 data URL
	 */
	async loadRemoteImageAsDataUrl(urlText: string): Promise<string | null> {
		try {
			const response = await requestUrl({
				url: urlText,
				method: 'GET'
			});
			const guessedMimeType = getMimeTypeFromFilename(urlText);
			const mimeType = this.isSupportedImageMimeType(guessedMimeType) ? guessedMimeType : 'image/png';
			return this.arrayBufferToDataUrl(response.arrayBuffer, mimeType);
		} catch {
			return null;
		}
	}

	/**
	 * 解析单个图片引用
	 */
	async resolveSingleImageReference(candidate: string): Promise<string | null> {
		const sanitized = this.sanitizeCandidateToken(candidate);
		if (!sanitized) {
			return null;
		}

		// Data URL
		if (sanitized.startsWith('data:image/')) {
			const mimeType = this.dataUrlToMimeType(sanitized);
			return this.isSupportedImageMimeType(mimeType) ? sanitized : null;
		}

		// HTTP/HTTPS URL
		if (sanitized.startsWith('http://') || sanitized.startsWith('https://')) {
			return this.loadRemoteImageAsDataUrl(sanitized);
		}

		// Obsidian URL
		if (sanitized.startsWith('obsidian://')) {
			const resolvedPath = this.tryResolveVaultPathFromObsidianUrl(sanitized);
			if (resolvedPath) {
				const fromVault = await this.loadVaultImageAsDataUrl(resolvedPath);
				if (fromVault) {
					return fromVault;
				}
				return this.loadExternalImageAsDataUrl(resolvedPath);
			}
			return null;
		}

		// Windows 路径
		if (/^[a-zA-Z]:\\/.test(sanitized)) {
			return this.loadExternalImageAsDataUrl(sanitized);
		}

		// 库路径
		const vaultPathCandidates = this.buildVaultPathCandidates(sanitized);
		for (const vaultPath of vaultPathCandidates) {
			const dataUrl = await this.loadVaultImageAsDataUrl(vaultPath);
			if (dataUrl) {
				return dataUrl;
			}
		}

		return null;
	}

	/**
	 * 从用户输入解析图片引用
	 */
	async resolveImagesFromInputReferences(input: string): Promise<string[]> {
		const candidates = this.extractImageReferenceCandidates(input);
		if (candidates.length === 0) {
			return [];
		}

		const resolved = await Promise.all(candidates.map((candidate) => this.resolveSingleImageReference(candidate)));
		const valid = resolved.filter((item): item is string => typeof item === 'string' && item.length > 0);
		return Array.from(new Set(valid));
	}
}
