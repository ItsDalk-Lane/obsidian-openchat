import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import type { SkillReturnPacket } from 'src/domains/skills/session-state';
import type {
	LoadedSkillContent,
	SkillDefinition,
	SkillScanResult,
} from 'src/domains/skills/types';
import type { SkillScannerService } from 'src/domains/skills/service';
import type { ToolContext } from '../runtime/types';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import {
	createSkillTools,
	DISCOVER_SKILLS_TOOL_NAME,
	INVOKE_SKILL_TOOL_NAME,
	LEGACY_INVOKE_SKILL_TOOL_NAME,
} from './skill-tools';

const TOOL_CONTEXT: ToolContext = {
	app: {} as App,
	callTool: async () => null,
};

const PDF_SKILL: SkillDefinition = {
	metadata: {
		name: 'pdf',
		description: 'Inspect PDF files and attachments.',
	},
	skillFilePath: 'System/AI Data/skills/pdf/SKILL.md',
	basePath: 'System/AI Data/skills/pdf',
};

const COMMIT_SKILL: SkillDefinition = {
	metadata: {
		name: 'commit',
		description: 'Prepare structured git commits.',
	},
	skillFilePath: 'System/AI Data/skills/commit/SKILL.md',
	basePath: 'System/AI Data/skills/commit',
};

const DISABLED_SKILL: SkillDefinition = {
	metadata: {
		name: 'disabled',
		description: 'Disabled skill should not be exposed at runtime.',
		enabled: false,
	},
	skillFilePath: 'System/AI Data/skills/disabled/SKILL.md',
	basePath: 'System/AI Data/skills/disabled',
};

function createScanner(skills: readonly SkillDefinition[]): SkillScannerService {
	const byName = new Map(skills.map((skill) => [skill.metadata.name, skill]));
	const byPath = new Map(skills.map((skill) => [skill.skillFilePath, skill]));
	const scanResult: SkillScanResult = {
		skills: [...skills],
		errors: [],
	};
	const runtimeResult: SkillScanResult = {
		...scanResult,
		skills: scanResult.skills.filter((skill) => skill.metadata.enabled !== false),
	};

	const scanner = {
		async scan(): Promise<SkillScanResult> {
			return scanResult;
		},
		async scanRuntimeSkills(): Promise<SkillScanResult> {
			return runtimeResult;
		},
		findByName(name: string, options?: { includeDisabled?: boolean }): SkillDefinition | undefined {
			const matched = byName.get(name.trim());
			if (!matched) {
				return undefined;
			}
			if (options?.includeDisabled) {
				return matched;
			}
			return matched.metadata.enabled === false ? undefined : matched;
		},
		normalizePath(path: string): string {
			return path.replace(/\\/gu, '/');
		},
		async loadSkillContent(path: string): Promise<LoadedSkillContent> {
			const definition = byPath.get(path);
			if (!definition) {
				throw new Error(`未找到已注册的 Skill: ${path}`);
			}
			return {
				definition,
				fullContent: `---\nname: ${definition.metadata.name}\n---\n${definition.metadata.description}`,
				bodyContent: definition.metadata.description,
			};
		},
	};

	return scanner as SkillScannerService;
}

const createPacket = (
	skillName: string,
	overrides: Partial<SkillReturnPacket> = {},
): SkillReturnPacket => ({
	invocationId: 'invoke-1',
	skillId: `System/AI Data/skills/${skillName}/SKILL.md`,
	skillName,
	status: 'completed',
	content: 'skill-result',
	sessionId: 'chat-main',
	messageCount: 2,
	producedAt: 1,
	metadata: { executionMode: 'isolated_resume', trigger: 'invoke_skill' },
	...overrides,
});

const createExecuteSkillExecution = (
	handler?: (request: { skillName: string; args?: string; trigger?: string }) => SkillReturnPacket,
) => {
	return async (request: { skillName: string; args?: string; trigger?: string }) => {
		return handler?.(request) ?? createPacket(request.skillName);
	};
};

function requireTool(
	scanner: SkillScannerService,
	toolName: string,
	executeSkillExecution = createExecuteSkillExecution(),
) {
	const tool = createSkillTools(scanner, executeSkillExecution).find(
		(entry) => entry.name === toolName,
	);
	if (!tool) {
		throw new Error(`未找到工具: ${toolName}`);
	}
	return tool;
}

test('Skill 工具名称常量保持 canonical 与 legacy 对齐', () => {
	assert.equal(INVOKE_SKILL_TOOL_NAME, 'invoke_skill');
	assert.equal(LEGACY_INVOKE_SKILL_TOOL_NAME, 'Skill');
});

test('Skill alias 会进入 registry 元数据但不生成第二个 canonical 工具名', () => {
	const registry = new BuiltinToolRegistry();
	registry.registerAll(createSkillTools(
		createScanner([PDF_SKILL]),
		createExecuteSkillExecution(),
	));

	assert.deepEqual(
		registry.listToolNames(),
		[DISCOVER_SKILLS_TOOL_NAME, INVOKE_SKILL_TOOL_NAME],
	);
	assert.deepEqual(
		registry.listTools('builtin').find((tool) => tool.name === INVOKE_SKILL_TOOL_NAME)?.aliases,
		[LEGACY_INVOKE_SKILL_TOOL_NAME],
	);
});

test('discover_skills 会按 query 过滤并返回规范化路径', async () => {
	const scanner = createScanner([PDF_SKILL, COMMIT_SKILL, DISABLED_SKILL]);
	const tool = requireTool(scanner, DISCOVER_SKILLS_TOOL_NAME);
	const result = await tool.execute({ query: 'pdf' }, TOOL_CONTEXT) as {
		skills: Array<{ name: string; description: string; path: string }>;
		meta: { query: string | null; returned: number; total: number };
	};

	assert.deepEqual(result, {
		skills: [{
			name: 'pdf',
			description: 'Inspect PDF files and attachments.',
			path: 'System/AI Data/skills/pdf/SKILL.md',
		}],
		meta: {
			query: 'pdf',
			returned: 1,
			total: 2,
		},
	});
});

test('discover_skills 不会返回已禁用的 Skill', async () => {
	const scanner = createScanner([PDF_SKILL, DISABLED_SKILL]);
	const tool = requireTool(scanner, DISCOVER_SKILLS_TOOL_NAME);
	const result = await tool.execute({}, TOOL_CONTEXT) as {
		skills: Array<{ name: string }>;
		meta: { query: string | null; returned: number; total: number };
	};

	assert.deepEqual(result.skills.map((skill) => skill.name), ['pdf']);
	assert.deepEqual(result.meta, { query: null, returned: 1, total: 1 });
});

test('invoke_skill 会通过统一执行器返回结构化 Skill 返回包', async () => {
	const scanner = createScanner([PDF_SKILL]);
	const requests: Array<{ skillName: string; args?: string; trigger?: string }> = [];
	const tool = requireTool(
		scanner,
		INVOKE_SKILL_TOOL_NAME,
		createExecuteSkillExecution((request) => {
			requests.push(request);
			return createPacket('pdf', {
				content: 'isolated-result',
				metadata: { executionMode: 'isolated_resume', trigger: 'invoke_skill' },
			});
		}),
	);
	const result = await tool.execute({
		skill: 'pdf',
		args: '--pages 1-2',
	}, TOOL_CONTEXT) as {
		status: string;
		message: string;
		nextAction: string | null;
		executionMode: string | null;
		packet: SkillReturnPacket;
	};

	assert.deepEqual(requests, [{
		skillName: 'pdf',
		args: '--pages 1-2',
		trigger: 'invoke_skill',
	}]);
	assert.equal(result.status, 'completed');
	assert.equal(result.executionMode, 'isolated_resume');
	assert.equal(result.packet.skillName, 'pdf');
	assert.equal(result.packet.content, 'isolated-result');
	assert.equal(result.nextAction, null);
	assert.equal(result.message, 'Skill "pdf" 执行完成。');
});

test('invoke_skill 在技能不存在时会提示先调用 discover_skills', async () => {
	const scanner = createScanner([PDF_SKILL]);
	const tool = requireTool(
		scanner,
		INVOKE_SKILL_TOOL_NAME,
		createExecuteSkillExecution((request) => createPacket(request.skillName, {
			status: 'failed',
			content: `未找到名为 "${request.skillName}" 的 Skill。`,
			sessionId: null,
			messageCount: 0,
		})),
	);
	const result = await tool.execute({ skill: 'missing' }, TOOL_CONTEXT) as {
		message: string;
		nextAction: string | null;
		packet: SkillReturnPacket;
	};

	assert.equal(result.packet.status, 'failed');
	assert.match(result.message, /discover_skills/);
	assert.equal(result.nextAction, '请先调用 discover_skills。');
});

test('invoke_skill 在 Skill 已禁用时返回稳定失败结果', async () => {
	const scanner = createScanner([PDF_SKILL, DISABLED_SKILL]);
	const tool = requireTool(
		scanner,
		INVOKE_SKILL_TOOL_NAME,
		createExecuteSkillExecution((request) => createPacket(request.skillName, {
			status: 'failed',
			content: `Skill "${request.skillName}" 当前已禁用，无法执行。`,
			sessionId: null,
			messageCount: 0,
		})),
	);
	const result = await tool.execute({ skill: 'disabled' }, TOOL_CONTEXT) as {
		message: string;
		nextAction: string | null;
		packet: SkillReturnPacket;
	};

	assert.equal(result.packet.status, 'failed');
	assert.match(result.message, /已禁用/);
	assert.equal(result.nextAction, null);
});

test('invoke_skill legacy alias 会通过 registry 返回结构化结果', async () => {
	const registry = new BuiltinToolRegistry();
	const requests: Array<{ skillName: string; trigger?: string }> = [];
	registry.registerAll(createSkillTools(
		createScanner([PDF_SKILL]),
		createExecuteSkillExecution((request) => {
			requests.push({ skillName: request.skillName, trigger: request.trigger });
			return createPacket('pdf');
		}),
	));

	const result = await registry.call('Skill', { skill: 'pdf' }, TOOL_CONTEXT) as {
		packet: SkillReturnPacket;
		status: string;
	};

	assert.deepEqual(requests, [{ skillName: 'pdf', trigger: 'invoke_skill' }]);
	assert.equal(result.status, 'completed');
	assert.equal(result.packet.skillName, 'pdf');
});

test('invoke_skill 在执行器抛出异常时返回单次格式化的 failed packet', async () => {
	const scanner = createScanner([PDF_SKILL]);
	const tool = requireTool(
		scanner,
		INVOKE_SKILL_TOOL_NAME,
		async () => {
			throw new Error('runtime exploded');
		},
	);
	const result = await tool.execute({ skill: 'pdf' }, TOOL_CONTEXT) as {
		message: string;
		packet: SkillReturnPacket;
	};

	assert.equal(result.message, 'Skill 工具调用失败：runtime exploded');
	assert.equal(result.packet.skillId, '__unknown__');
	assert.equal(result.packet.status, 'failed');
});
