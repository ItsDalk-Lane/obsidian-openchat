import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { SkillScannerService } from 'src/domains/skills/service';
import type {
	LoadedSkillContent,
	SkillDefinition,
	SkillScanResult,
} from 'src/domains/skills/types';
import { PlanState } from './runtime/plan-state';
import { createGetFirstLinkPathTool } from './link/get-first-link-path/tool';
import { createLinkTools } from './link/link-tools';
import { createWritePlanTool } from './plan/write-plan/tool';
import { createPlanTools } from './plan/plan-tools';
import {
	createSkillTools,
	DISCOVER_SKILLS_TOOL_NAME,
	INVOKE_SKILL_TOOL_NAME,
} from './skill/skill-tools';
import { createDiscoverSkillsTool } from './skill/discover-skills/tool';
import { createInvokeSkillTool } from './skill/invoke-skill/tool';
import type { SkillReturnPacket } from 'src/domains/skills/session-state';

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));

const TOOL_CONTEXT = {
	app: {
		metadataCache: {
			getFirstLinkpathDest(link: string) {
				if (link === 'Project Plan') {
					return { path: 'Notes/Project Plan.md' };
				}
				return null;
			},
		},
	} as never,
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

const createExecuteSkillExecution = async (): Promise<SkillReturnPacket> => ({
	invocationId: 'invoke-1',
	skillId: PDF_SKILL.skillFilePath,
	skillName: PDF_SKILL.metadata.name,
	status: 'completed',
	content: 'skill-result',
	sessionId: 'chat-main',
	messageCount: 2,
	producedAt: 1,
	metadata: { executionMode: 'isolated_resume', trigger: 'invoke_skill' },
});

const readToolSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8');
};

test('Step 13 get_first_link_path 复用新目录并保持清理语义', async () => {
	const tool = createGetFirstLinkPathTool();

	const validation = await tool.validateInput?.({
		internal_link: '[[#Only Heading]]',
	}, TOOL_CONTEXT);
	assert.equal(validation?.ok, false);
	assert.match(validation?.summary ?? '', /不能为空/);

	const result = await tool.execute({
		internal_link: '[[Project Plan#Overview|计划]]',
	}, TOOL_CONTEXT);
	assert.deepEqual(result, {
		file_path: 'Notes/Project Plan.md',
		found: true,
	});
});

test('Step 13 write_plan 迁入单工具目录并保留计划摘要行为', async () => {
	const planState = new PlanState();
	const tool = createWritePlanTool(planState);

	const invalid = await tool.validateInput?.({
		title: '迁移剩余工具',
		tasks: [
			{ name: '迁移 Link', status: 'in_progress' },
			{ name: '迁移 Plan', status: 'in_progress' },
		],
	}, TOOL_CONTEXT);
	assert.equal(invalid?.ok, false);
	assert.match(invalid?.summary ?? '', /只能有一个 in_progress/);

	const result = await tool.execute({
		title: '迁移剩余工具',
		tasks: [
			{ name: '迁移 Link', status: 'done', outcome: '已迁移完成' },
			{ name: '迁移 Plan', status: 'todo' },
		],
	}, TOOL_CONTEXT);

	assert.equal(tool.getToolUseSummary?.({ title: '迁移剩余工具' }), '迁移剩余工具');
	assert.deepEqual(result.summary, {
		total: 2,
		todo: 1,
		inProgress: 0,
		done: 1,
		skipped: 0,
	});
});

test('Step 13 skill 工具保留 discover 对象结果与 invoke 结构化结果', async () => {
	const scanner = createScanner([PDF_SKILL]);
	const discoverTool = createDiscoverSkillsTool(scanner);
	const invokeTool = createInvokeSkillTool(createExecuteSkillExecution);

	const discoverResult = await discoverTool.execute({ query: 'pdf' }, TOOL_CONTEXT) as {
		skills: Array<{ name: string; description: string; path: string }>;
		meta: { query: string | null; returned: number; total: number };
	};
	assert.deepEqual(discoverResult, {
		skills: [{
			name: 'pdf',
			description: 'Inspect PDF files and attachments.',
			path: 'System/AI Data/skills/pdf/SKILL.md',
		}],
		meta: {
			query: 'pdf',
			returned: 1,
			total: 1,
		},
	});

	const invokeResult = await invokeTool.execute({
		skill: 'pdf',
		args: '--pages 1-2',
	}, TOOL_CONTEXT);
	assert.equal(typeof invokeResult, 'object');
	assert.equal((invokeResult as { status: string }).status, 'completed');
	assert.equal((invokeResult as { packet: SkillReturnPacket }).packet.skillName, 'pdf');
});

test('Step 13 legacy 工厂与桥接入口改为复用新目录', async () => {
	const linkSource = await readToolSource('./link/link-tools.ts');
	const planSource = await readToolSource('./plan/plan-tools.ts');
	const skillSource = await readToolSource('./skill/skill-tools.ts');

	assert.match(linkSource, /get-first-link-path\/tool/);
	assert.match(planSource, /write-plan\/tool/);
	assert.match(skillSource, /discover-skills\/tool/);
	assert.match(skillSource, /invoke-skill\/tool/);

	assert.deepEqual(createLinkTools().map((tool) => tool.name), ['get_first_link_path']);
	assert.deepEqual(
		createPlanTools(new PlanState()).map((tool) => tool.name),
		['write_plan'],
	);
	assert.deepEqual(
		createSkillTools(createScanner([PDF_SKILL]), createExecuteSkillExecution).map((tool) => tool.name),
		[DISCOVER_SKILLS_TOOL_NAME, INVOKE_SKILL_TOOL_NAME],
	);
});
