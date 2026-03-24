import type { SkillDefinition } from './types';

const escapeXml = (value: string): string =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');

const formatSkillBlock = (skill: SkillDefinition): string => {
	return [
		'  <skill>',
		`    <name>${escapeXml(skill.metadata.name)}</name>`,
		`    <description>${escapeXml(skill.metadata.description)}</description>`,
		'    <scope>user</scope>',
		'  </skill>',
	].join('\n');
};

export function buildSkillsSystemPromptBlock(skills: SkillDefinition[]): string {
	const skillBlocks = skills.map(formatSkillBlock);
	return [
		'<skills>',
		'Priority: Match user requests to the best available skill before using other commands. | Skills listed before commands',
		'Invoke via: skill(name="item-name") — omit leading slash for commands.',
		...skillBlocks,
		'</skills>',
	].join('\n');
}
