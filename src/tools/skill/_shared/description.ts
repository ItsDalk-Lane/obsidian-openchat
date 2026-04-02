export const DISCOVER_SKILLS_TOOL_DESCRIPTION = [
	'List installed skills that can be invoked in the current conversation.',
	'',
	'Use this when you need to inspect which skills exist before choosing one.',
	'If the user already gave a specific slash command or explicit skill name,',
	'call `invoke_skill` directly instead.',
].join('\n');

export const INVOKE_SKILL_TOOL_DESCRIPTION = [
	'Execute a skill within the current conversation.',
	'',
	'When the user asks for a task that should follow a Skill workflow, load that',
	'Skill before answering.',
	'',
	'If you do not know which skills are available, call `discover_skills` first.',
	'',
	'When the user types a slash command such as `/commit` or `/pdf`, treat it as',
	'a skill invocation.',
	'',
	'How to invoke:',
	'- `{"skill":"pdf"}`',
	'- `{"skill":"commit","args":"-m \\"Fix bug\\""}`',
	'',
	'Important:',
	'- Never mention a skill workflow without actually calling this tool.',
	'- Do not invoke a skill that is already running.',
	'- Do not use this tool for built-in CLI commands such as `/help` or `/clear`.',
	'- If you see a `<command-name>` tag in the current conversation turn, the',
	'  skill has already been loaded. Follow its instructions directly instead of',
	'  calling this tool again.',
].join('\n');

export const buildSkillToolDescription = (): string => INVOKE_SKILL_TOOL_DESCRIPTION;
