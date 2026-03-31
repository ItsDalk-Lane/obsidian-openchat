import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { normalizeEditorTabCompletionSettings } from './config';
import {
	buildEditorContext,
	EditorTabCompletionService,
	generateContextPrompt,
	isContinuousUsage,
	limitSuggestionLength,
	postProcessSuggestion,
	selectCompletionProvider,
} from './service';
import { ContextType, type EditorCompletionMessage, type EditorCompletionProvider, type EditorTabCompletionEvents, type EditorTabCompletionRuntime } from './types';
import type { EventBus, NoticePort } from 'src/providers/providers.types';

function createEditorState(doc: string, anchor: number = doc.length): EditorState {
	return EditorState.create({ doc, selection: { anchor } });
}

/** 编辑器域仅需 NoticePort */
type EditorHostPort = NoticePort;

function createFakeObsidianApiProvider(): EditorHostPort & {
	notifications: Array<{ message: string; timeout?: number }>;
} {
	const notifications: Array<{ message: string; timeout?: number }> = [];
	return {
		notifications,
		notify(message: string, timeout?: number): void {
			notifications.push({ message, timeout });
		},
	};
}

function createFakeEventBus(): {
	bus: EventBus<EditorTabCompletionEvents>;
	emitted: Array<{ eventName: keyof EditorTabCompletionEvents; payload: EditorTabCompletionEvents[keyof EditorTabCompletionEvents] }>;
} {
	const emitted: Array<{ eventName: keyof EditorTabCompletionEvents; payload: EditorTabCompletionEvents[keyof EditorTabCompletionEvents] }> = [];
	return {
		emitted,
		bus: {
			emit<TKey extends keyof EditorTabCompletionEvents>(eventName: TKey, payload: EditorTabCompletionEvents[TKey]): void {
				emitted.push({ eventName, payload });
			},
			on(): () => void {
				return () => {};
			},
			clear(): void {},
		},
	};
}

function createCompletionProvider(options?: {
	tag?: string;
	vendor?: string;
	chunks?: readonly string[];
	error?: Error;
}): EditorCompletionProvider & { readonly receivedMessages: readonly EditorCompletionMessage[][] } {
	const receivedMessages: EditorCompletionMessage[][] = [];
	return {
		receivedMessages,
		tag: options?.tag ?? 'alpha',
		vendor: options?.vendor ?? 'test-vendor',
		async *sendCompletion(messages: readonly EditorCompletionMessage[]): AsyncGenerator<string, void, unknown> {
			receivedMessages.push([...messages]);
			if (options?.error) {
				throw options.error;
			}
			for (const chunk of options?.chunks ?? ['default suggestion']) {
				yield chunk;
			}
		},
	};
}

function createRuntime(
	providerOrProviders: EditorCompletionProvider | readonly EditorCompletionProvider[],
	overrides?: Partial<EditorTabCompletionRuntime>,
): EditorTabCompletionRuntime {
	return {
		defaultModelTag: '',
		providers: Array.isArray(providerOrProviders) ? [...providerOrProviders] : [providerOrProviders],
		settings: normalizeEditorTabCompletionSettings({ enabled: true }),
		messages: {
			readOnly: '只读',
			noProvider: '未配置 provider',
			failedDefaultReason: '默认失败原因',
			failedPrefix: '失败: {message}',
		},
		...overrides,
	};
}

async function withMockedDateNow<T>(values: readonly number[], run: () => Promise<T> | T): Promise<T> {
	const originalDateNow = Date.now;
	let index = 0;
	Date.now = () => values[Math.min(index++, values.length - 1)] ?? values[values.length - 1] ?? originalDateNow();
	try {
		return await run();
	} finally {
		Date.now = originalDateNow;
	}
}

test('buildEditorContext 识别列表项与换行需求', () => {
	const state = EditorState.create({ doc: '- item', selection: { anchor: 6 } });
	const context = buildEditorContext(state);
	assert.equal(context.contextType, ContextType.ListItem);
	assert.equal(context.needsLeadingNewline, true);
	assert.equal(context.listItemFormat?.nextItemPrefix, '- ');
});

test('postProcessSuggestion 为列表续写补齐列表前缀', () => {
	const state = EditorState.create({ doc: '- item', selection: { anchor: 6 } });
	const context = buildEditorContext(state);
	const processed = postProcessSuggestion('next line', context);
	assert.equal(processed, '\n- next line');
});

test('buildEditorContext 识别 frontmatter 与代码块上下文', () => {
	const frontmatterContext = buildEditorContext(createEditorState('---\nname: demo\n---\nbody', 8));
	const codeBlockContext = buildEditorContext(createEditorState('```ts\nconst answer = 42', 15));
	assert.equal(frontmatterContext.contextType, ContextType.Frontmatter);
	assert.equal(codeBlockContext.contextType, ContextType.CodeBlock);
});

test('buildEditorContext 在超长未闭合 frontmatter 中保持 frontmatter 上下文', () => {
	const longFrontmatter = `---\n${'key: value\n'.repeat(160)}`;
	const context = buildEditorContext(createEditorState(longFrontmatter, 1200));
	assert.equal(context.contextType, ContextType.Frontmatter);
});

test('generateContextPrompt 根据上下文类型生成提示', () => {
	const orderedListPrompt = generateContextPrompt(buildEditorContext(createEditorState('1. item')));
	const headingPrompt = generateContextPrompt(buildEditorContext(createEditorState('# 标题')));
	assert.match(orderedListPrompt, /数字\./);
	assert.match(headingPrompt, /标题后续写正文/);
});

test('postProcessSuggestion 去掉代码块包裹并补齐引用前缀', () => {
	const context = buildEditorContext(createEditorState('> quote'));
	const processed = postProcessSuggestion('```markdown\nnext line\n```', context);
	assert.equal(processed, '\n> next line');
});

test('limitSuggestionLength 按句号截断', () => {
	assert.equal(limitSuggestionLength('第一句。第二句。第三句。', 2), '第一句。第二句。');
});

test('isContinuousUsage 在时间窗口内识别连续使用', () => {
	assert.equal(isContinuousUsage([1000, 2000], 4000), true);
	assert.equal(isContinuousUsage([1000], 7000), false);
});

test('selectCompletionProvider 优先使用指定 tag', () => {
	const providers: EditorCompletionProvider[] = [
		{ tag: 'alpha', vendor: 'a', async *sendCompletion() {} },
		{ tag: 'beta', vendor: 'b', async *sendCompletion() {} },
	];
	assert.equal(selectCompletionProvider('beta', '', providers)?.tag, 'beta');
	assert.equal(selectCompletionProvider('', 'beta', providers)?.tag, 'beta');
	assert.equal(selectCompletionProvider('', 'missing', providers)?.tag, 'alpha');
	assert.equal(selectCompletionProvider('missing', 'beta', providers)?.tag, 'beta');
});

test('normalizeEditorTabCompletionSettings 会清理空白配置', () => {
	const settings = normalizeEditorTabCompletionSettings({
		triggerKey: '  ',
		providerTag: '  alpha  ',
		promptTemplate: '  ',
	});
	assert.equal(settings.triggerKey, 'Alt');
	assert.equal(settings.providerTag, 'alpha');
	assert.match(settings.promptTemplate, /writing continuation assistant/);
});

test('EditorTabCompletionService 在只读模式下通知并停止请求', () => {
	const provider = createCompletionProvider();
	const obsidianApi = createFakeObsidianApiProvider();
	const service = new EditorTabCompletionService(obsidianApi, null, createRuntime(provider));
	const pending = service.startSuggestionRequest({ state: createEditorState('text'), editable: false });
	assert.equal(pending, null);
	assert.deepEqual(obsidianApi.notifications, [{ message: '只读', timeout: undefined }]);
});

test('EditorTabCompletionService 发射 requested 事件并对重复触发做防抖', async () => {
	const provider = createCompletionProvider();
	const obsidianApi = createFakeObsidianApiProvider();
	const eventBus = createFakeEventBus();
	const runtime = createRuntime(provider, {
		logger: {
			debug(): void {},
			error(): void {},
		},
	});
	const service = new EditorTabCompletionService(obsidianApi, eventBus.bus, runtime);
	await withMockedDateNow([1000, 1100], async () => {
		const firstPending = service.startSuggestionRequest({ state: createEditorState('text'), editable: true });
		const secondPending = service.startSuggestionRequest({ state: createEditorState('text'), editable: true });
		assert.ok(firstPending);
		assert.equal(secondPending, null);
	});
	assert.equal(eventBus.emitted.length, 1);
	assert.equal(eventBus.emitted[0]?.eventName, 'editor.tab-completion.requested');
	assert.equal(eventBus.emitted[0]?.payload.providerTag, 'alpha');
});

test('EditorTabCompletionService 在未指定 providerTag 时使用 defaultModelTag', async () => {
	const alphaProvider = createCompletionProvider({ tag: 'alpha', vendor: 'vendor-a' });
	const betaProvider = createCompletionProvider({ tag: 'beta', vendor: 'vendor-b' });
	const obsidianApi = createFakeObsidianApiProvider();
	const eventBus = createFakeEventBus();
	const service = new EditorTabCompletionService(
		obsidianApi,
		eventBus.bus,
		createRuntime([alphaProvider, betaProvider], {
			settings: normalizeEditorTabCompletionSettings({ enabled: true, providerTag: '' }),
			defaultModelTag: 'beta',
		}),
	);

	await withMockedDateNow([1000], async () => {
		const pending = service.startSuggestionRequest({
			state: createEditorState('text'),
			editable: true,
		});
		assert.ok(pending);
		assert.equal(pending.provider.tag, 'beta');
	});

	assert.equal(eventBus.emitted[0]?.eventName, 'editor.tab-completion.requested');
	assert.equal(eventBus.emitted[0]?.payload.providerTag, 'beta');
});

test('EditorTabCompletionService resolveSuggestion 会组装 prompt、裁剪结果并发射完成事件', async () => {
	const provider = createCompletionProvider({ chunks: ['第一句。第二句。'] });
	const obsidianApi = createFakeObsidianApiProvider();
	const eventBus = createFakeEventBus();
	const service = new EditorTabCompletionService(obsidianApi, eventBus.bus, createRuntime(provider, {
		settings: normalizeEditorTabCompletionSettings({ enabled: true, promptTemplate: 'global prompt' }),
	}));
	const pending = await withMockedDateNow([1000], async () => service.startSuggestionRequest({ state: createEditorState('段落内容'), editable: true }));
	assert.ok(pending);
	const suggestion = await service.resolveSuggestion(pending);
	assert.equal(suggestion, '第一句。');
	assert.equal(provider.receivedMessages[0]?.[0]?.role, 'system');
	assert.equal(provider.receivedMessages[0]?.[0]?.content, 'global prompt');
	assert.equal(provider.receivedMessages[0]?.[1]?.role, 'user');
	assert.equal(provider.receivedMessages[0]?.[1]?.content, '段落内容');
	assert.equal(eventBus.emitted.at(-1)?.eventName, 'editor.tab-completion.completed');
	assert.equal(eventBus.emitted.at(-1)?.payload.textLength, suggestion.length);
});

test('EditorTabCompletionService resolveSuggestion 失败时通知并发射失败事件', async () => {
	const provider = createCompletionProvider({ chunks: [], error: new Error('boom') });
	const obsidianApi = createFakeObsidianApiProvider();
	const eventBus = createFakeEventBus();
	const service = new EditorTabCompletionService(obsidianApi, eventBus.bus, createRuntime(provider, {
		logger: {
			debug(): void {},
			error(): void {},
		},
	}));
	const pending = await withMockedDateNow([1000], async () => service.startSuggestionRequest({ state: createEditorState('段落内容'), editable: true }));
	assert.ok(pending);
	const suggestion = await service.resolveSuggestion(pending);
	assert.equal(suggestion, '');
	assert.equal(obsidianApi.notifications[0]?.message, '失败: boom');
	assert.equal(obsidianApi.notifications[0]?.timeout, 3000);
	assert.equal(eventBus.emitted.at(-1)?.eventName, 'editor.tab-completion.failed');
	assert.equal(eventBus.emitted.at(-1)?.payload.message, 'boom');
});
