import test from 'node:test';
import assert from 'node:assert/strict';
import { activateChatViewFromAssembler } from './chat-assembler-support';

test('ChatAssembler activateChatView 优先委托已初始化的 feature manager', async () => {
	const calls: string[] = [];
	const context = {
		chatFeatureManager: {
			getService() {
				return {
					setNextTriggerSource(source: string): void {
						calls.push(`service:${source}`);
					},
				};
			},
			async activateChatView(mode: string): Promise<void> {
				calls.push(`manager:${mode}`);
			},
		},
		earlyChatService: {
			setNextTriggerSource(source: string): void {
				calls.push(`early-service:${source}`);
			},
		},
		earlyChatViewCoordinator: {
			async activateChatView(mode: string): Promise<void> {
				calls.push(`early:${mode}`);
			},
		},
	};

	await activateChatViewFromAssembler(context, 'tab', 'command_palette');

	assert.deepEqual(calls, ['service:command_palette', 'manager:tab']);
});

test('ChatAssembler activateChatView 在 early 阶段回退到早期 coordinator', async () => {
	const calls: string[] = [];
	const context = {
		chatFeatureManager: null,
		earlyChatService: {
			setNextTriggerSource(source: string): void {
				calls.push(`service:${source}`);
			},
		},
		earlyChatViewCoordinator: {
			async activateChatView(mode: string): Promise<void> {
				calls.push(`early:${mode}`);
			},
		},
	};

	await activateChatViewFromAssembler(context, 'sidebar');

	assert.deepEqual(calls, ['service:chat_input', 'early:sidebar']);
});