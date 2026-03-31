import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from 'src/domains/settings/config';
import { getRibbonActivationOpenMode } from './ribbon-activation-settings';

test('getRibbonActivationOpenMode 使用 bootstrap 之后的当前 settings，而不是旧快照', async () => {
	const bootstrapSnapshot = {
		...DEFAULT_SETTINGS,
		chat: { ...DEFAULT_SETTINGS.chat, openMode: 'persistent-modal' },
	};
	let currentSettings = bootstrapSnapshot;

	const openMode = await getRibbonActivationOpenMode({
		async ensureBootstrapSettingsLoaded() {
			currentSettings = {
				...currentSettings,
				chat: { ...currentSettings.chat, openMode: 'sidebar' },
			};
			return bootstrapSnapshot;
		},
		getCurrentSettings() {
			return currentSettings;
		},
	});

	assert.equal(openMode, 'sidebar');
});

test('getRibbonActivationOpenMode 在未发生变更时返回当前 openMode', async () => {
	const currentSettings = {
		...DEFAULT_SETTINGS,
		chat: { ...DEFAULT_SETTINGS.chat, openMode: 'tab' },
	};

	const openMode = await getRibbonActivationOpenMode({
		async ensureBootstrapSettingsLoaded() {
			return currentSettings;
		},
		getCurrentSettings() {
			return currentSettings;
		},
	});

	assert.equal(openMode, 'tab');
});