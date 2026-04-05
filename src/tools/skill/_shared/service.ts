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

