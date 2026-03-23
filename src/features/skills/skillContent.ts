import { App, TFile, normalizePath } from 'obsidian';
import { SkillScannerService } from './SkillScannerService';
import type { SkillDefinition } from './types';

const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n)?/;

export interface LoadedSkillContent {
	definition: SkillDefinition;
	fullContent: string;
	bodyContent: string;
}

export async function loadSkillContent(
	app: App,
	scanner: SkillScannerService,
	path: string,
): Promise<LoadedSkillContent> {
	const normalizedPath = normalizePath(path);
	let definition = scanner.findByPath(normalizedPath);
	if (!definition) {
		await scanner.scan();
		definition = scanner.findByPath(normalizedPath);
	}
	if (!definition) {
		throw new Error(`未找到已注册的 Skill: ${normalizedPath}`);
	}

	const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
	if (!(abstractFile instanceof TFile)) {
		throw new Error(`Skill 文件不存在: ${normalizedPath}`);
	}

	const fullContent = await app.vault.read(abstractFile);
	return {
		definition,
		fullContent,
		bodyContent: stripSkillFrontmatter(fullContent),
	};
}

export function stripSkillFrontmatter(content: string): string {
	const match = content.match(FRONTMATTER_REGEX);
	if (!match) {
		return content;
	}
	return content.slice(match[0].length);
}

export function formatSkillToolResult(basePath: string, bodyContent: string): string {
	const normalizedBasePath = normalizePath(basePath).replace(/[\\/]+$/g, '');
	return `Base Path: ${normalizedBasePath}/\n\n${bodyContent}`;
}
