import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsProvider } from './settings';

test('SettingsProvider getSnapshot 总是返回当前最新设置', () => {
	let current = { enabled: true, retries: 1 };
	const provider = createSettingsProvider({
		getCurrentSettings: () => current,
		replaceSettings: async (nextSettings) => nextSettings,
	});
	assert.deepEqual(provider.getSnapshot(), { enabled: true, retries: 1 });
	current = { enabled: false, retries: 2 };
	assert.deepEqual(provider.getSnapshot(), { enabled: false, retries: 2 });
});

test('SettingsProvider replaceSettings 透传并返回替换结果', async () => {
	let current = { enabled: true, retries: 1 };
	const provider = createSettingsProvider({
		getCurrentSettings: () => current,
		replaceSettings: async (nextSettings) => {
			current = nextSettings;
			return nextSettings;
		},
	});
	const next = await provider.replaceSettings({ enabled: false, retries: 3 });
	assert.deepEqual(next, { enabled: false, retries: 3 });
	assert.deepEqual(current, { enabled: false, retries: 3 });
});

test('SettingsProvider updateSettings 基于当前快照计算新值', async () => {
	let current = { enabled: true, retries: 1 };
	const provider = createSettingsProvider({
		getCurrentSettings: () => current,
		replaceSettings: async (nextSettings) => {
			current = nextSettings;
			return nextSettings;
		},
	});
	current = { enabled: false, retries: 5 };
	const next = await provider.updateSettings((snapshot) => ({
		enabled: !snapshot.enabled,
		retries: snapshot.retries + 1,
	}));
	assert.deepEqual(next, { enabled: true, retries: 6 });
	assert.deepEqual(current, { enabled: true, retries: 6 });
});

test('SettingsProvider 会透传 replaceSettings 的异常', async () => {
	const provider = createSettingsProvider({
		getCurrentSettings: () => ({ enabled: true }),
		replaceSettings: async () => {
			throw new Error('save failed');
		},
	});
	await assert.rejects(async () => await provider.replaceSettings({ enabled: false }), /save failed/);
});