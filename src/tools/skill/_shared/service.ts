import {
	formatSkillToolResult,
	loadSkillContent,
	type SkillScannerService,
} from 'src/domains/skills/service';
import type { SkillDefinition } from 'src/domains/skills/types';

export const skillReadOnlyAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const;

export const formatSkillToolError = (message: string): string => {
	return `Skill 工具调用失败：${message}`;
};

export const formatSkillToolUnexpectedError = (error: unknown): string => {
	return formatSkillToolError(
		error instanceof Error ? error.message : String(error),
	);
};

export const buildInvocationArgsBlock = (args?: string): string => {
	const trimmed = args?.trim();
	if (!trimmed) {
		return '';
	}
	return `\n\n<invocation-args>\n${trimmed}\n</invocation-args>`;
};

export const buildCommandTag = (skillName: string): string => {
	return `\n\n<command-name>${skillName}</command-name>`;
};

export const resolveSkillDefinition = async (
	scanner: SkillScannerService,
	skillName: string,
): Promise<SkillDefinition | undefined> => {
	const trimmedName = skillName.trim();
	if (!trimmedName) {
		return undefined;
	}
	return scanner.findByName(trimmedName)
		?? await scanner.scan().then(() => scanner.findByName(trimmedName));
};

export const executeInvokeSkillBody = async (
	scanner: SkillScannerService,
	skillName: string,
	args?: string,
): Promise<string> => {
	const definition = await resolveSkillDefinition(scanner, skillName);
	if (!definition) {
		return formatSkillToolError(
			`未找到名为 "${skillName}" 的 Skill，请先调用 discover_skills。`,
		);
	}

	const loaded = await loadSkillContent(scanner, definition.skillFilePath);
	const result = formatSkillToolResult(
		loaded.definition.basePath,
		loaded.bodyContent,
		(path) => scanner.normalizePath(path),
	);
	return result + buildInvocationArgsBlock(args) + buildCommandTag(skillName);
};
