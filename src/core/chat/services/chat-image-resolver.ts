/**
 * ChatImageResolver - 聊天图片解析服务
 * 负责解析用户输入中的图片引用并转换为 data URL
 */
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import { getMimeTypeFromFilename, arrayBufferToBase64 } from 'src/LLMProviders/utils';

type ChatImageHost = Pick<
	ObsidianApiProvider,
	| 'getActiveFilePath'
	| 'getVaultEntry'
	| 'getVaultName'
	| 'normalizePath'
	| 'readVaultBinary'
	| 'requestHttp'
>;

export class ChatImageResolver {
	constructor(private readonly obsidianApi: ChatImageHost) {}

	base64ToArrayBuffer(base64Data: string): ArrayBuffer {
		const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let index = 0; index < binaryString.length; index += 1) {
			bytes[index] = binaryString.charCodeAt(index);
		}
		return bytes.buffer;
	}

	mergeSelectedImages(existingImages: string[], incomingImages: string[]): string[] {
		const mergedSet = new Set(existingImages);
		for (const image of incomingImages) {
			if (image.trim().length > 0) {
				mergedSet.add(image);
			}
		}
		return [...mergedSet];
	}

	isSupportedImageMimeType(mimeType: string): boolean {
		return [
			'image/png',
			'image/jpeg',
			'image/gif',
			'image/webp',
			'image/bmp',
			'image/svg+xml',
		].includes(mimeType);
	}

	sanitizeCandidateToken(token: string): string {
		const trimmed = token.trim();
		const unwrapped = trimmed.replace(/^<|>$/gu, '').replace(/^['"]|['"]$/gu, '');
		return unwrapped.replace(/[),.;]+$/gu, '');
	}

	extractImageReferenceCandidates(input: string): string[] {
		if (!input.trim()) {
			return [];
		}
		const candidates = new Set<string>();
		const pushCandidate = (value: string): void => {
			const normalized = this.sanitizeCandidateToken(value);
			if (normalized.length > 0) {
				candidates.add(normalized);
			}
		};
		const patterns = [
			/!\[[^\]]*\]\(([^)]+)\)/giu,
			/!\[\[([^\]]+)\]\]/giu,
			/\[\[([^\]]+\.(?:png|jpe?g|gif|webp|bmp|svg)[^\]]*)\]\]/giu,
			/(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/gu,
			/(https?:\/\/[^\s)\]>]+\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s)\]>]*)?)/giu,
			/(obsidian:\/\/[^\s)\]>]+)/giu,
			/["']([a-zA-Z]:\\[^"']+\.(?:png|jpe?g|gif|webp|bmp|svg))["']/gu,
			/([a-zA-Z]:\\[^\s"'<>|?*]+\.(?:png|jpe?g|gif|webp|bmp|svg))/gu,
			/((?:\.\/|\.\.\/)?[^\s"'<>]+(?:\/[^\s"'<>]+)*\.(?:png|jpe?g|gif|webp|bmp|svg))/giu,
		];
		for (const pattern of patterns) {
			for (const match of input.matchAll(pattern)) {
				const value = match[1] ?? match[0];
				if (value) {
					pushCandidate(value);
				}
			}
		}
		return [...candidates];
	}

	stripObsidianLinkDecorators(candidate: string): string {
		const withoutAlias = candidate.split('|')[0] ?? candidate;
		const withoutHeading = withoutAlias.split('#')[0] ?? withoutAlias;
		return this.sanitizeCandidateToken(withoutHeading);
	}

	dataUrlToMimeType(dataUrl: string): string {
		return dataUrl.match(/^data:([^;]+);base64,/iu)?.[1]?.toLowerCase() ?? 'application/octet-stream';
	}

	arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
		return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
	}

	toSafeArrayBuffer(data: Uint8Array | Buffer): ArrayBuffer {
		return Uint8Array.from(data).buffer;
	}

	async loadVaultImageAsDataUrl(vaultPath: string): Promise<string | null> {
		const normalized = this.obsidianApi.normalizePath(vaultPath.replace(/^\//u, ''));
		const entry = this.obsidianApi.getVaultEntry(normalized);
		if (entry?.kind !== 'file') {
			return null;
		}
		const mimeType = getMimeTypeFromFilename(entry.name);
		if (!this.isSupportedImageMimeType(mimeType)) {
			return null;
		}
		return this.arrayBufferToDataUrl(
			await this.obsidianApi.readVaultBinary(normalized),
			mimeType,
		);
	}

	tryResolveVaultPathFromObsidianUrl(urlText: string): string | null {
		try {
			const url = new URL(urlText);
			if (url.protocol !== 'obsidian:') {
				return null;
			}
			const vaultName = this.obsidianApi.getVaultName();
			if (url.hostname === 'open') {
				const pathParam = url.searchParams.get('path');
				if (pathParam) {
					return decodeURIComponent(pathParam);
				}
				const fileParam = url.searchParams.get('file');
				const urlVault = url.searchParams.get('vault');
				if (fileParam && (!urlVault || urlVault === vaultName)) {
					return decodeURIComponent(fileParam);
				}
			}
			if (url.hostname === 'vault') {
				const path = decodeURIComponent(url.pathname.replace(/^\//u, ''));
				const [urlVault, ...segments] = path.split('/');
				if (urlVault === vaultName && segments.length > 0) {
					return segments.join('/');
				}
			}
		} catch {
			return null;
		}
		return null;
	}

	buildVaultPathCandidates(rawPath: string): string[] {
		const cleaned = this.stripObsidianLinkDecorators(rawPath).replace(/\\/gu, '/');
		if (!cleaned) {
			return [];
		}
		const candidates = new Set([cleaned]);
		const activeFilePath = this.obsidianApi.getActiveFilePath();
		if (activeFilePath && (cleaned.startsWith('./') || cleaned.startsWith('../'))) {
			const activeSegments = activeFilePath.split('/');
			activeSegments.pop();
			for (const segment of cleaned.split('/')) {
				if (!segment || segment === '.') {
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
		return [...candidates].map((item) => this.obsidianApi.normalizePath(item.replace(/^\//u, '')));
	}

	async loadExternalImageAsDataUrl(filePath: string): Promise<string | null> {
		try {
			const pathModule = await import('node:path');
			const fs = await import('node:fs/promises');
			const normalizedPath = this.stripObsidianLinkDecorators(filePath);
			const mimeType = getMimeTypeFromFilename(pathModule.basename(normalizedPath));
			if (!this.isSupportedImageMimeType(mimeType)) {
				return null;
			}
			return this.arrayBufferToDataUrl(
				this.toSafeArrayBuffer(await fs.readFile(normalizedPath)),
				mimeType,
			);
		} catch {
			return null;
		}
	}

	async loadRemoteImageAsDataUrl(urlText: string): Promise<string | null> {
		try {
			const response = await this.obsidianApi.requestHttp({
				url: urlText,
				method: 'GET',
			});
			if (!(response.arrayBuffer instanceof ArrayBuffer)) {
				return null;
			}
			const guessedMimeType = getMimeTypeFromFilename(urlText);
			const mimeType = this.isSupportedImageMimeType(guessedMimeType)
				? guessedMimeType
				: 'image/png';
			return this.arrayBufferToDataUrl(response.arrayBuffer, mimeType);
		} catch {
			return null;
		}
	}

	async resolveSingleImageReference(candidate: string): Promise<string | null> {
		const sanitized = this.sanitizeCandidateToken(candidate);
		if (!sanitized) {
			return null;
		}
		if (sanitized.startsWith('data:image/')) {
			const mimeType = this.dataUrlToMimeType(sanitized);
			return this.isSupportedImageMimeType(mimeType) ? sanitized : null;
		}
		if (sanitized.startsWith('http://') || sanitized.startsWith('https://')) {
			return await this.loadRemoteImageAsDataUrl(sanitized);
		}
		if (sanitized.startsWith('obsidian://')) {
			const resolvedPath = this.tryResolveVaultPathFromObsidianUrl(sanitized);
			if (!resolvedPath) {
				return null;
			}
			return await this.loadVaultImageAsDataUrl(resolvedPath)
				?? await this.loadExternalImageAsDataUrl(resolvedPath);
		}
		if (/^[a-zA-Z]:\\/u.test(sanitized)) {
			return await this.loadExternalImageAsDataUrl(sanitized);
		}
		for (const vaultPath of this.buildVaultPathCandidates(sanitized)) {
			const dataUrl = await this.loadVaultImageAsDataUrl(vaultPath);
			if (dataUrl) {
				return dataUrl;
			}
		}
		return null;
	}

	async resolveImagesFromInputReferences(input: string): Promise<string[]> {
		const candidates = this.extractImageReferenceCandidates(input);
		if (candidates.length === 0) {
			return [];
		}
		const resolved = await Promise.all(candidates.map(async (candidate) => {
			return await this.resolveSingleImageReference(candidate);
		}));
		return [...new Set(resolved.filter((item): item is string => Boolean(item && item.length > 0)))];
	}
}
