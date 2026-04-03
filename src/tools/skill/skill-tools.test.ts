import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
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

function createScanner(skills: readonly SkillDefinition[]): SkillScannerService {
	const byName = new Map(skills.map((skill) => [skill.metadata.name, skill]));
	const byPath = new Map(skills.map((skill) => [skill.skillFilePath, skill]));
	const scanResult: SkillScanResult = {
		skills: [...skills],
		errors: [],
	};

	const scanner = {
		async scan(): Promise<SkillScanResult> {
			return scanResult;
		},
		findByName(name: string): SkillDefinition | undefined {
			return byName.get(name.trim());
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

function requireTool(scanner: SkillScannerService, toolName: string) {
	const tool = createSkillTools(scanner).find((entry) => entry.name === toolName);
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
	registry.registerAll(createSkillTools(createScanner([PDF_SKILL])));

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
	const scanner = createScanner([PDF_SKILL, COMMIT_SKILL]);
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

test('invoke_skill 会加载 skill 正文并附加调用上下文标记', async () => {
	const scanner = createScanner([PDF_SKILL]);
	const tool = requireTool(scanner, INVOKE_SKILL_TOOL_NAME);
	const result = await tool.execute({
		skill: 'pdf',
		args: '--pages 1-2',
	}, TOOL_CONTEXT) as string;

	assert.equal(typeof result, 'string');
	assert.match(result, /Base Path: System\/AI Data\/skills\/pdf\//);
	assert.match(result, /Inspect PDF files and attachments\./);
	assert.match(result, /<invocation-args>\n--pages 1-2\n<\/invocation-args>/);
	assert.match(result, /<command-name>pdf<\/command-name>/);
});

test('invoke_skill 在技能不存在时会提示先调用 discover_skills', async () => {
	const scanner = createScanner([PDF_SKILL]);
	const tool = requireTool(scanner, INVOKE_SKILL_TOOL_NAME);
	const result = await tool.execute({ skill: 'missing' }, TOOL_CONTEXT) as string;

	assert.equal(
		result,
		'Skill 工具调用失败：未找到名为 "missing" 的 Skill，请先调用 discover_skills。',
	);
});
