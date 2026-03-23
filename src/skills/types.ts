export interface SkillMetadata {
	name: string;
	description: string;
	license?: string;
	compatibility?: string | string[] | Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export interface SkillDefinition {
	metadata: SkillMetadata;
	skillFilePath: string;
	basePath: string;
	bodyContent?: string;
}

export interface SkillToolInput {
	skill: string;
	args?: string;
}

export interface SkillScanError {
	path: string;
	reason: string;
	severity?: 'warning' | 'error';
}

export interface SkillScanResult {
	skills: SkillDefinition[];
	errors: SkillScanError[];
}
