import type { SkillScannerService } from 'src/domains/skills/service';
import type { BuiltinTool } from '../runtime/types';
import {
	buildSkillToolDescription,
	DISCOVER_SKILLS_TOOL_DESCRIPTION,
	INVOKE_SKILL_TOOL_DESCRIPTION,
} from './_shared/description';
import {
	createDiscoverSkillsTool,
	DISCOVER_SKILLS_TOOL_NAME,
} from './discover-skills/tool';
import {
	createInvokeSkillTool,
	INVOKE_SKILL_TOOL_NAME,
	LEGACY_INVOKE_SKILL_TOOL_NAME,
} from './invoke-skill/tool';

export {
	buildSkillToolDescription,
	DISCOVER_SKILLS_TOOL_DESCRIPTION,
	DISCOVER_SKILLS_TOOL_NAME,
	INVOKE_SKILL_TOOL_DESCRIPTION,
	INVOKE_SKILL_TOOL_NAME,
	LEGACY_INVOKE_SKILL_TOOL_NAME,
};

export function createSkillTools(
	scanner: SkillScannerService,
): BuiltinTool[] {
	return [
		createDiscoverSkillsTool(scanner),
		createInvokeSkillTool(scanner),
	];
}
