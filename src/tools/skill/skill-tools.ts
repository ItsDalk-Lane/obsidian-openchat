import { loadSkillContent, formatSkillToolResult, type SkillScannerService } from 'src/domains/skills/service';
import { z } from 'zod';
import type { BuiltinTool } from '../runtime/types';

export const DISCOVER_SKILLS_TOOL_NAME = 'discover_skills';
export const INVOKE_SKILL_TOOL_NAME = 'invoke_skill';
export const LEGACY_INVOKE_SKILL_TOOL_NAME = 'Skill';

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

const discoverSkillsToolSchema = z.object({
	query: z
		.string()
		.optional()
		.describe('Optional filter text used to narrow the returned skills list.'),
}).strict();

export const INVOKE_SKILL_TOOL_DESCRIPTION = [
	'Execute a skill within the current conversation.',
	'',
	'When the user asks for a task that should follow a Skill workflow, load that Skill before answering.',
	'',
	'If you do not know which skills are available, call `discover_skills` first.',
	'',
	'When the user types a slash command such as `/commit` or `/pdf`, treat it as a skill invocation.',
	'',
	'How to invoke:',
	'- `{"skill":"pdf"}`',
	'- `{"skill":"commit","args":"-m \\"Fix bug\\""}`',
	'',
	'Important:',
	'- Never mention a skill workflow without actually calling this tool.',
	'- Do not invoke a skill that is already running.',
	'- Do not use this tool for built-in CLI commands such as `/help` or `/clear`.',
	'- If you see a `<command-name>` tag in the current conversation turn, the skill has already been loaded. Follow its instructions directly instead of calling this tool again.',
].join('\n');

export const DISCOVER_SKILLS_TOOL_DESCRIPTION = [
	'List installed skills that can be invoked in the current conversation.',
	'',
	'Use this when you need to inspect which skills exist before choosing one.',
	'If the user already gave a specific slash command or explicit skill name, call `invoke_skill` directly instead.',
].join('\n');

export const buildSkillToolDescription = (): string => {
	return INVOKE_SKILL_TOOL_DESCRIPTION;
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
): BuiltinTool[] {
	return [{
		name: DISCOVER_SKILLS_TOOL_NAME,
		title: DISCOVER_SKILLS_TOOL_NAME,
		description: DISCOVER_SKILLS_TOOL_DESCRIPTION,
		inputSchema: discoverSkillsToolSchema,
		annotations: readOnlyToolAnnotations,
		async execute(args) {
			const query = args.query?.trim().toLowerCase();
			try {
				const result = await scanner.scan();
				const skills = result.skills
					.filter((skill) => {
						if (!query) {
							return true;
						}
						return skill.metadata.name.toLowerCase().includes(query)
							|| skill.metadata.description.toLowerCase().includes(query);
					})
					.map((skill) => ({
						name: skill.metadata.name,
						description: skill.metadata.description,
						path: scanner.normalizePath(skill.skillFilePath),
					}));
				return {
					skills,
					meta: {
						query: query ?? null,
						returned: skills.length,
						total: result.skills.length,
					},
				};
			} catch (error) {
				return `Skill 工具调用失败：${error instanceof Error ? error.message : String(error)}`;
			}
		},
	}, {
		name: INVOKE_SKILL_TOOL_NAME,
		title: INVOKE_SKILL_TOOL_NAME,
		description: buildSkillToolDescription(),
		inputSchema: skillToolSchema,
		annotations: readOnlyToolAnnotations,
		async execute(args) {
			const skillName = args.skill.trim();
			if (!skillName) {
				return 'Skill 工具调用失败：缺少有效的 skill 参数。';
			}
			try {
				const definition = await resolveSkillDefinition(scanner, skillName);
				if (!definition) {
					return `Skill 工具调用失败：未找到名为 "${skillName}" 的 Skill，请先调用 ${DISCOVER_SKILLS_TOOL_NAME}。`;
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
