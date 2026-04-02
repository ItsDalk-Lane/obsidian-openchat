import type { SkillScannerService } from 'src/domains/skills/service';
import { formatSkillToolUnexpectedError } from '../_shared/service';
import type { DiscoverSkillsArgs, DiscoverSkillsResult } from './schema';

export const summarizeDiscoverSkills = (
	args: Partial<DiscoverSkillsArgs>,
): string | null => {
	const query = args.query?.trim();
	return query || 'skills';
};

export const describeDiscoverSkillsActivity = (
	args: Partial<DiscoverSkillsArgs>,
): string | null => {
	const query = args.query?.trim();
	return query ? `查找 Skill: ${query}` : '列出当前可用 Skill';
};

export const executeDiscoverSkills = async (
	args: DiscoverSkillsArgs,
	scanner: SkillScannerService,
): Promise<DiscoverSkillsResult | string> => {
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
		return formatSkillToolUnexpectedError(error);
	}
};
