import type { SkillToolInput } from 'src/domains/skills/types';
import { loadSkillContent, formatSkillToolResult, type SkillScannerService } from 'src/domains/skills/service';
import { z } from 'zod';
import type { BuiltinTool } from '../runtime/types';

export const SKILL_TOOL_NAME = 'Skill';

const readOnlyToolAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const;

const skillToolSchema = z.object({
	skill: z
		.string()
		.min(1)
		.describe('The skill name. E.g. "commit", "review-pr", or "pdf".'),
	args: z
		.string()
		.optional()
		.describe('Optional arguments or context for the skill.'),
}).strict();

export const SKILL_TOOL_DESCRIPTION = [
	'Execute a skill within the current conversation.',
	'',
	'When the user asks for a task that matches an available skill, this is a BLOCKING REQUIREMENT:',
	'invoke this tool before generating any other response about the task.',
	'',
	'When the user types a slash command such as `/commit` or `/pdf`, treat it as a skill invocation.',
	'',
	'How to invoke:',
	'- `{"skill":"pdf"}`',
	'- `{"skill":"commit","args":"-m \\"Fix bug\\""}`',
	'',
	'Important:',
	'- Available skills are listed in `<skills>` blocks in the system prompt.',
	'- Never mention a skill without actually calling this tool.',
	'- Do not invoke a skill that is already running.',
	'- Do not use this tool for built-in CLI commands such as `/help` or `/clear`.',
	'- If you see a `<command-name>` tag in the current conversation turn, the skill has already been loaded. Follow its instructions directly instead of calling this tool again.',
].join('\n');

export const buildSkillToolDescription = (): string => {
	return SKILL_TOOL_DESCRIPTION;
};

const buildInvocationArgsBlock = (args?: string): string => {
	const trimmed = args?.trim();
	if (!trimmed) {
		return '';
	}
	return `\n\n<invocation-args>\n${trimmed}\n</invocation-args>`;
};

const buildCommandTag = (skillName: string): string => {
	return `\n\n<command-name>${skillName}</command-name>`;
};

const resolveSkillDefinition = async (
	scanner: SkillScannerService,
	skillName: string
) => {
	const trimmedName = skillName.trim();
	if (!trimmedName) {
		return undefined;
	}
	return scanner.findByName(trimmedName)
		?? await scanner.scan().then(() => scanner.findByName(trimmedName));
};

export function createSkillTools(
	scanner: SkillScannerService
): BuiltinTool<SkillToolInput>[] {
	return [{
		name: SKILL_TOOL_NAME,
		title: SKILL_TOOL_NAME,
		description: buildSkillToolDescription(),
		inputSchema: skillToolSchema,
		annotations: readOnlyToolAnnotations,
		async execute(args, context) {
			const skillName = args.skill.trim();
			if (!skillName) {
				return 'Skill 工具调用失败：缺少有效的 skill 参数。';
			}
			try {
				const definition = await resolveSkillDefinition(scanner, skillName);
				if (!definition) {
					return `Skill 工具调用失败：未找到名为 "${skillName}" 的 Skill，请检查 system prompt 中的 <skills> 列表。`;
				}
				const loaded = await loadSkillContent(scanner, definition.skillFilePath);
				const result = formatSkillToolResult(
					loaded.definition.basePath,
					loaded.bodyContent,
					(path) => scanner.normalizePath(path)
				);
				return result
					+ buildInvocationArgsBlock(args.args)
					+ buildCommandTag(skillName);
			} catch (error) {
				return `Skill 工具调用失败：${error instanceof Error ? error.message : String(error)}`;
			}
		},
	}];
}
