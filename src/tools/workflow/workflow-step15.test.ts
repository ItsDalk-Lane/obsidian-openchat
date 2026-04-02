import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolDefinition } from 'src/types/tool';
import { BuiltinToolExecutor } from '../runtime/BuiltinToolExecutor';
import { BuiltinToolRegistry } from '../runtime/tool-registry';
import type {
	BuiltinToolUserInputRequest,
	ToolContext,
} from '../runtime/types';
import { createAskUserTool } from './ask-user/tool';

const createContext = (): ToolContext => ({
	app: {
		workspace: {
			getActiveFile: () => null,
		},
	},
	callTool: async () => null,
}) as never;

const createDefinition = (registry: BuiltinToolRegistry): ToolDefinition => {
	const info = registry.listTools('builtin').find((tool) => tool.name === 'ask_user');
	assert.ok(info);
	return {
		name: info.name,
		title: info.title,
		description: info.description,
		inputSchema: info.inputSchema,
		outputSchema: info.outputSchema,
		annotations: info.annotations,
		source: 'builtin',
		sourceId: info.serverId,
	};
};

test('ask_user 支持选项选择与自由文本两种回答路径', async () => {
	const tool = createAskUserTool();
	const requests: BuiltinToolUserInputRequest[] = [];

	const selected = await tool.execute({
		question: '要处理哪个目录？',
		options: [
			{ label: '文档', value: 'docs' },
			{ label: '源码', value: 'src', description: '更新实现代码' },
		],
	}, {
		...createContext(),
		requestUserInput: async (request: BuiltinToolUserInputRequest) => {
			requests.push(request);
			return { outcome: 'selected', selectedValue: 'src' };
		},
	} as never);
	const freeText = await tool.execute({
		question: '请补充目标文件名',
		allow_free_text: true,
	}, {
		...createContext(),
		requestUserInput: async () => ({
			outcome: 'free-text',
			freeText: ' roadmap.md ',
		}),
	} as never);

	assert.equal(selected.answered, true);
	assert.equal(selected.selected_value, 'src');
	assert.equal(freeText.answered, true);
	assert.equal(freeText.free_text, 'roadmap.md');
	assert.equal(requests[0]?.question, '要处理哪个目录？');
	assert.equal(
		(requests[0]?.options as Array<{ value: string }> | undefined)?.[1]?.value,
		'src',
	);
});

test(
	'BuiltinToolExecutor 会通过 requestUserInput 执行 ask_user 且不走确认流',
	async () => {
	const registry = new BuiltinToolRegistry();
	registry.register(createAskUserTool());
	const definition = createDefinition(registry);
	const progressPhases: string[] = [];
	let confirmationCount = 0;

	const executor = new BuiltinToolExecutor(registry, createContext());
	const result = await executor.execute({
		id: 'call-ask-user',
		name: 'ask_user',
		arguments: JSON.stringify({
			question: '请选择目标目录',
			options: [{ label: '文档', value: 'docs' }],
		}),
	}, [definition], {
		requestConfirmation: async () => {
			confirmationCount += 1;
			return { decision: 'allow' };
		},
		requestUserInput: async (request) => {
			assert.equal(request.toolName, 'ask_user');
			return { outcome: 'selected', selectedValue: 'docs' };
		},
		reportProgress: (event) => {
			if (event.phase) {
				progressPhases.push(event.phase);
			}
		},
	});

	assert.equal(result.status, 'completed');
	assert.equal(confirmationCount, 0);
	assert.match(result.content, /"selected_value": "docs"/);
	assert.ok(progressPhases.includes('user-input'));
	},
);

test(
	'BuiltinToolExecutor 会在 ask_user 缺少宿主输入能力时返回结构化失败',
	async () => {
	const registry = new BuiltinToolRegistry();
	registry.register(createAskUserTool());
	const definition = createDefinition(registry);
	let confirmationCount = 0;

	const executor = new BuiltinToolExecutor(registry, createContext());
	const result = await executor.execute({
		id: 'call-ask-user-missing-host',
		name: 'ask_user',
		arguments: JSON.stringify({
			question: '请选择目标目录',
			options: [{ label: '文档', value: 'docs' }],
		}),
	}, [definition], {
		requestConfirmation: async () => {
			confirmationCount += 1;
			return { decision: 'allow' };
		},
	});

	assert.equal(result.status, 'failed');
	assert.equal(result.errorContext?.kind, 'tool-user-input');
	assert.equal(confirmationCount, 0);
	assert.match(result.content, /未提供用户输入能力/);
	},
);
