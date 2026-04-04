import assert from 'node:assert/strict';
import test from 'node:test';
import { SkillExecutionService } from './execution';
import type {
	LoadedSkillContent,
	SkillDefinition,
	SkillScanResult,
} from './types';
import type {
	SkillInvocationFrame,
	SkillReturnPacket,
} from './session-state';

const SKILL: SkillDefinition = {
	metadata: {
		name: 'code-audit',
		description: '审查代码实现',
		execution: { mode: 'isolated_resume' },
	},
	skillFilePath: 'System/AI Data/skills/code-audit/SKILL.md',
	basePath: 'System/AI Data/skills/code-audit',
};

const LOADED_SKILL: LoadedSkillContent = {
	definition: SKILL,
	fullContent: '---\nname: code-audit\n---\n请审查下面的实现',
	bodyContent: '请审查下面的实现',
};

const SCAN_RESULT: SkillScanResult = {
	skills: [SKILL],
	errors: [],
};

const createInvocationFrame = (): SkillInvocationFrame => ({
	invocationId: 'invoke-1',
	skillId: SKILL.skillFilePath,
	skillName: SKILL.metadata.name,
	skillFilePath: SKILL.skillFilePath,
	executionMode: 'isolated_resume',
	startedAt: 100,
	updatedAt: 100,
	status: 'running',
	mainTask: {
		frameId: 'main-1',
		sessionId: 'chat-main',
		capturedAt: 100,
		state: {
			activeSession: null,
			inputValue: '继续主任务',
			selectedModelId: 'model-a',
			selectedModels: ['model-a'],
			enableReasoningToggle: false,
			enableWebSearchToggle: false,
			contextNotes: [],
			selectedImages: [],
			selectedFiles: [],
			selectedFolders: [],
			shouldSaveHistory: true,
			multiModelMode: 'single',
			layoutMode: 'horizontal',
		},
	},
	isolatedSession: null,
	returnPacket: null,
});

test('SkillExecutionService 会为 inline 模式直接返回执行结果包', async () => {
	let inlineCalled = false;
	const service = new SkillExecutionService(
		{
			findByName: () => SKILL,
			scan: async () => SCAN_RESULT,
			loadSkillContent: async () => LOADED_SKILL,
		},
		{
			executeInline: async (context) => {
				inlineCalled = true;
				assert.equal(context.executionMode, 'inline');
				assert.equal(context.argsText, '请检查这段代码');
				return {
					content: 'inline-result',
					sessionId: 'chat-main',
					messageCount: 4,
					metadata: { mode: 'inline' },
				};
			},
			executeIsolated: async () => {
				throw new Error('不应走 isolated');
			},
			freezeMainTask: () => {
				throw new Error('不应冻结主任务');
			},
			writeReturnPacket: () => {
				throw new Error('不应写入返回包');
			},
			restoreMainTask: () => null,
		},
	);

	const packet = await service.execute({
		skillName: 'code-audit',
		args: '请检查这段代码',
		executionMode: 'inline',
		trigger: 'slash_command',
	});

	assert.equal(inlineCalled, true);
	assert.equal(packet.status, 'completed');
	assert.equal(packet.content, 'inline-result');
	assert.equal(packet.sessionId, 'chat-main');
	assert.equal(packet.messageCount, 4);
});

test('SkillExecutionService 会在 isolated_resume 中冻结主任务并恢复返回包', async () => {
	let wrotePacket = false;
	let restored = false;
	const restoredPacket: SkillReturnPacket = {
		invocationId: 'invoke-1',
		skillId: SKILL.skillFilePath,
		skillName: SKILL.metadata.name,
		status: 'completed',
		content: 'isolated-result',
		sessionId: 'chat-skill',
		messageCount: 2,
		producedAt: 200,
	};
	const service = new SkillExecutionService(
		{
			findByName: () => SKILL,
			scan: async () => SCAN_RESULT,
			loadSkillContent: async () => LOADED_SKILL,
		},
		{
			executeInline: async () => {
				throw new Error('不应走 inline');
			},
			executeIsolated: async (context) => {
				assert.equal(context.executionMode, 'isolated_resume');
				assert.equal(context.invocationFrame?.invocationId, 'invoke-1');
				return {
					content: 'isolated-result',
					sessionId: 'chat-skill',
					messageCount: 2,
					producedAt: 200,
				};
			},
			freezeMainTask: () => createInvocationFrame(),
			writeReturnPacket: (input) => {
				wrotePacket = true;
				assert.equal(input.invocationId, 'invoke-1');
				assert.equal(input.content, 'isolated-result');
				return createInvocationFrame();
			},
			restoreMainTask: () => {
				restored = true;
				return restoredPacket;
			},
		},
	);

	const packet = await service.execute({
		skillName: 'code-audit',
		trigger: 'invoke_skill',
	});

	assert.equal(wrotePacket, true);
	assert.equal(restored, true);
	assert.equal(packet, restoredPacket);
});

test('SkillExecutionService 在 isolated 模式不会冻结主任务', async () => {
	let isolatedCalled = false;
	const service = new SkillExecutionService(
		{
			findByName: () => ({
				...SKILL,
				metadata: {
					...SKILL.metadata,
					execution: { mode: 'isolated' },
				},
			}),
			scan: async () => SCAN_RESULT,
			loadSkillContent: async () => LOADED_SKILL,
		},
		{
			executeInline: async () => {
				throw new Error('不应走 inline');
			},
			executeIsolated: async (context) => {
				isolatedCalled = true;
				assert.equal(context.invocationFrame, undefined);
				assert.equal(context.executionMode, 'isolated');
				return {
					content: 'isolated-only',
					sessionId: 'chat-skill',
					messageCount: 2,
				};
			},
			freezeMainTask: () => {
				throw new Error('不应冻结主任务');
			},
			writeReturnPacket: () => {
				throw new Error('不应写返回包');
			},
			restoreMainTask: () => {
				throw new Error('不应恢复主任务');
			},
		},
	);

	const packet = await service.execute({ skillName: 'code-audit' });

	assert.equal(isolatedCalled, true);
	assert.equal(packet.content, 'isolated-only');
	assert.equal(packet.status, 'completed');
});

test('SkillExecutionService 在 Skill 不存在时返回 failed packet', async () => {
	const service = new SkillExecutionService(
		{
			findByName: () => undefined,
			scan: async () => ({ skills: [], errors: [] }),
			loadSkillContent: async () => LOADED_SKILL,
		},
		{
			executeInline: async () => {
				throw new Error('不应执行');
			},
			executeIsolated: async () => {
				throw new Error('不应执行');
			},
			freezeMainTask: () => createInvocationFrame(),
			writeReturnPacket: () => createInvocationFrame(),
			restoreMainTask: () => null,
		},
	);

	const packet = await service.execute({
		skillName: 'missing',
		trigger: 'invoke_skill',
	});

	assert.equal(packet.status, 'failed');
	assert.match(packet.content, /未找到名为 "missing" 的 Skill/);
});

test('SkillExecutionService 在正文为空时返回 failed packet', async () => {
	const service = new SkillExecutionService(
		{
			findByName: () => SKILL,
			scan: async () => SCAN_RESULT,
			loadSkillContent: async () => ({
				...LOADED_SKILL,
				bodyContent: '   ',
			}),
		},
		{
			executeInline: async () => {
				throw new Error('不应执行');
			},
			executeIsolated: async () => {
				throw new Error('不应执行');
			},
			freezeMainTask: () => createInvocationFrame(),
			writeReturnPacket: () => createInvocationFrame(),
			restoreMainTask: () => null,
		},
	);

	const packet = await service.execute({
		skillName: 'code-audit',
		trigger: 'slash_command',
	});

	assert.equal(packet.status, 'failed');
	assert.equal(packet.content, 'Skill "code-audit" 没有可用的内容。');
});

test('SkillExecutionService 会拒绝执行已禁用的 Skill', async () => {
	const disabledSkill: SkillDefinition = {
		...SKILL,
		metadata: {
			...SKILL.metadata,
			enabled: false,
		},
	};
	const service = new SkillExecutionService(
		{
			findByName: (_name, options) => options?.includeDisabled ? disabledSkill : undefined,
			scan: async () => ({ skills: [disabledSkill], errors: [] }),
			loadSkillContent: async () => LOADED_SKILL,
		},
		{
			executeInline: async () => {
				throw new Error('不应执行');
			},
			executeIsolated: async () => {
				throw new Error('不应执行');
			},
			freezeMainTask: () => createInvocationFrame(),
			writeReturnPacket: () => createInvocationFrame(),
			restoreMainTask: () => null,
		},
	);

	const packet = await service.execute({
		skillName: 'code-audit',
		trigger: 'slash_command',
	});

	assert.equal(packet.status, 'failed');
	assert.match(packet.content, /已禁用/);
});
