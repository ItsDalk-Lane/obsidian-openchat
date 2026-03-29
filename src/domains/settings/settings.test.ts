import test from 'node:test';
import assert from 'node:assert/strict';
import type { PluginSettings } from './types';

function createNoopLogger() {
	return {
		debug(): void {},
		info(): void {},
		warn(): void {},
		error(): void {},
	};
}

function createDebugAdapterSpy() {
	const calls: string[] = [];
	return {
		calls,
		adapter: {
			setDebugMode(enabled: boolean): void {
				calls.push(`mode:${String(enabled)}`);
			},
			setDebugLevel(level: string): void {
				calls.push(`level:${level}`);
			},
			setLlmConsoleLogEnabled(enabled: boolean): void {
				calls.push(`llm:${String(enabled)}`);
			},
			setLlmResponsePreviewChars(length: number): void {
				calls.push(`preview:${String(length)}`);
			},
		},
	};
}

function createServiceDependencies(stubs?: {
	decryptAiRuntimeSettings?: (
		settings?: Partial<PluginSettings['aiRuntime']> | Record<string, unknown>,
	) => PluginSettings['aiRuntime'];
	encryptAiRuntimeSettings?: (
		settings: PluginSettings['aiRuntime'],
	) => PluginSettings['aiRuntime'];
	resolvePersistedAiRuntime?: (persisted: Record<string, unknown>) => Record<string, unknown>;
	resolveAiDataFolder?: (
		persisted: Record<string, unknown>,
		rawChatSettings: Record<string, unknown>,
	) => string;
	normalizeLegacyFolderPath?: (value: unknown) => string | undefined;
	migrateAIDataStorage?: (settings: PluginSettings) => Promise<void>;
	cleanupLegacyAIStorage?: () => Promise<void>;
	loadServers?: (aiDataFolder: string) => Promise<unknown[]>;
	migrateFromLegacyDefaultSystemMessage?: (params: {
		enabled?: boolean;
		content?: string | null;
	}) => Promise<boolean>;
	syncServers?: (aiDataFolder: string, servers: unknown[]) => Promise<unknown[]>;
}) {
	return {
		createSecretManager() {
			return {
				decryptAiRuntimeSettings:
					stubs?.decryptAiRuntimeSettings
					?? ((settings?: Partial<PluginSettings['aiRuntime']> | Record<string, unknown>) =>
						settings as PluginSettings['aiRuntime']),
				encryptAiRuntimeSettings:
					stubs?.encryptAiRuntimeSettings
					?? ((settings: PluginSettings['aiRuntime']) => settings),
			};
		},
		async getMigrationService() {
			return {
				resolvePersistedAiRuntime:
					stubs?.resolvePersistedAiRuntime
					?? ((persisted: Record<string, unknown>) =>
						((persisted.aiRuntime as Record<string, unknown> | undefined) ?? {})),
				resolveAiDataFolder:
					stubs?.resolveAiDataFolder
					?? ((persisted: Record<string, unknown>) =>
						typeof persisted.aiDataFolder === 'string'
							? persisted.aiDataFolder
							: 'System/AI Data'),
				normalizeLegacyFolderPath:
					stubs?.normalizeLegacyFolderPath
					?? ((value: unknown) =>
						typeof value === 'string' ? value.trim().replace(/[\\/]+$/g, '') || undefined : undefined),
				migrateAIDataStorage:
					stubs?.migrateAIDataStorage
					?? (async () => {}),
				cleanupLegacyAIStorage:
					stubs?.cleanupLegacyAIStorage
					?? (async () => {}),
			};
		},
		async getSystemPromptService() {
			return {
				migrateFromLegacyDefaultSystemMessage:
					stubs?.migrateFromLegacyDefaultSystemMessage
					?? (async () => false),
			};
		},
		async getMcpServerService() {
			return {
				loadServers: stubs?.loadServers ?? (async () => []),
				syncServers:
					stubs?.syncServers
					?? (async (_folderPath: string, servers: unknown[]) => servers),
			};
		},
	};
}

function installTestWindow(): void {
	(globalThis as {
		window?: {
			localStorage: { getItem: (key: string) => string };
			screen: { width: number; height: number };
		};
	}).window = {
		localStorage: {
			getItem(): string {
				return 'zh';
			},
		},
		screen: {
			width: 1920,
			height: 1080,
		},
	};
}

test('mergePluginSettings 会合并 chat 与 aiRuntime 并保留未覆盖字段', async () => {
	installTestWindow();
	const { cloneAiRuntimeSettings } = await import('src/settings/ai-runtime/core');
	const { DEFAULT_SETTINGS, mergePluginSettings } = await import('./config');
	const currentSettings: PluginSettings = {
		...DEFAULT_SETTINGS,
		aiRuntime: cloneAiRuntimeSettings({ ...DEFAULT_SETTINGS.aiRuntime, debugMode: false }),
		chat: { ...DEFAULT_SETTINGS.chat, enableQuickActions: false },
	};
	const merged = mergePluginSettings(currentSettings, {
		aiDataFolder: 'Custom/AI Data',
		aiRuntime: { debugMode: true },
		chat: { enableQuickActions: true },
	});
	assert.equal(merged.aiDataFolder, 'Custom/AI Data');
	assert.equal(merged.aiRuntime.debugMode, true);
	assert.equal(merged.chat.enableQuickActions, true);
	assert.equal(merged.aiRuntime.debugLevel, currentSettings.aiRuntime.debugLevel);
});

test('PluginSettingsController replaceSettings 会保存并刷新 feature coordinator', async () => {
	installTestWindow();
	const { DEFAULT_SETTINGS } = await import('./config');
	const { PluginSettingsController } = await import('./ui');
	const calls: string[] = [];
	const debugAdapter = createDebugAdapterSpy();
	const controller = new PluginSettingsController({
		async load(): Promise<PluginSettings> { return DEFAULT_SETTINGS; },
		async save(settings: PluginSettings): Promise<void> { calls.push(`save:${settings.aiDataFolder}`); },
		async ensureAiDataFolders(): Promise<void> {},
	} as never, {
		async refresh(settings: PluginSettings): Promise<void> { calls.push(`refresh:${settings.aiDataFolder}`); },
	} as never, debugAdapter.adapter, { error(): void {} });
	const nextSettings = await controller.replaceSettings(DEFAULT_SETTINGS, { aiDataFolder: 'Migrated/AI Data' });
	assert.equal(nextSettings.aiDataFolder, 'Migrated/AI Data');
	assert.deepEqual(calls, ['save:Migrated/AI Data', 'refresh:Migrated/AI Data']);
	assert.deepEqual(debugAdapter.calls, [
		'mode:false',
		`level:${DEFAULT_SETTINGS.aiRuntime.debugLevel}`,
		`llm:${String(DEFAULT_SETTINGS.aiRuntime.enableLlmConsoleLog ?? false)}`,
		`preview:${String(DEFAULT_SETTINGS.aiRuntime.llmResponsePreviewChars ?? 100)}`,
	]);
});

test('PluginSettingsController loadBootstrapSettings 会返回设置并同步调试适配器', async () => {
	installTestWindow();
	const { DEFAULT_SETTINGS } = await import('./config');
	const { PluginSettingsController } = await import('./ui');
	const debugAdapter = createDebugAdapterSpy();
	const expectedSettings: PluginSettings = {
		...DEFAULT_SETTINGS,
		aiRuntime: {
			...DEFAULT_SETTINGS.aiRuntime,
			debugMode: true,
			debugLevel: 'debug',
			enableLlmConsoleLog: true,
			llmResponsePreviewChars: 256,
		},
	};
	const controller = new PluginSettingsController({
		async loadBootstrapSettings(): Promise<PluginSettings> { return expectedSettings; },
		async save(): Promise<void> {},
		async ensureAiDataFolders(): Promise<void> {},
	} as never, { async refresh(): Promise<void> {} } as never, debugAdapter.adapter, { error(): void {} });
	const loaded = await controller.loadBootstrapSettings();
	assert.deepEqual(loaded, expectedSettings);
	assert.deepEqual(debugAdapter.calls, ['mode:true', 'level:debug', 'llm:true', 'preview:256']);
});

test('PluginSettingsController saveSettings 会保存、刷新并同步调试适配器', async () => {
	installTestWindow();
	const { DEFAULT_SETTINGS } = await import('./config');
	const { PluginSettingsController } = await import('./ui');
	const debugAdapter = createDebugAdapterSpy();
	const calls: string[] = [];
	const controller = new PluginSettingsController({
		async load(): Promise<PluginSettings> { return DEFAULT_SETTINGS; },
		async save(settings: PluginSettings): Promise<void> { calls.push(`save:${settings.aiDataFolder}`); },
		async ensureAiDataFolders(): Promise<void> {},
	} as never, {
		async refresh(settings: PluginSettings): Promise<void> { calls.push(`refresh:${settings.aiDataFolder}`); },
	} as never, debugAdapter.adapter, { error(): void {} });
	await controller.saveSettings({
		...DEFAULT_SETTINGS,
		aiDataFolder: 'Manual/AI Data',
		aiRuntime: {
			...DEFAULT_SETTINGS.aiRuntime,
			debugMode: true,
			debugLevel: 'warn',
			enableLlmConsoleLog: true,
			llmResponsePreviewChars: 180,
		},
	});
	assert.deepEqual(calls, ['save:Manual/AI Data', 'refresh:Manual/AI Data']);
	assert.deepEqual(debugAdapter.calls, ['mode:true', 'level:warn', 'llm:true', 'preview:180']);
});

test('PluginSettingsController 会将 ensureAiDataFolders 错误吞掉并记录', async () => {
	installTestWindow();
	const { DEFAULT_SETTINGS } = await import('./config');
	const { PluginSettingsController } = await import('./ui');
	let logged = false;
	const debugAdapter = createDebugAdapterSpy();
	const controller = new PluginSettingsController({
		async load(): Promise<PluginSettings> { return DEFAULT_SETTINGS; },
		async save(): Promise<void> {},
		async ensureAiDataFolders(): Promise<void> { throw new Error('boom'); },
	} as never, { async refresh(): Promise<void> {} } as never, debugAdapter.adapter, {
		error(): void { logged = true; },
	});
	await controller.ensureAiDataFolders('System/AI Data');
	assert.equal(logged, true);
});

test('SettingsDomainService loadBootstrapSettings 在空数据下回退到默认设置', async () => {
	installTestWindow();
	const { SettingsDomainService } = await import('./service');
	const { DEFAULT_SETTINGS } = await import('./config');
	const settingsService = new SettingsDomainService({
		app: {},
		async loadData() {
			return {};
		},
		async saveData() {},
	}, {
		async ensureAiDataFolders() {},
	} as never, createNoopLogger(), createServiceDependencies({
		decryptAiRuntimeSettings: () => ({ ...DEFAULT_SETTINGS.aiRuntime }),
	}));
	const loaded = await settingsService.loadBootstrapSettings();
	assert.equal(loaded.aiDataFolder, DEFAULT_SETTINGS.aiDataFolder);
	assert.deepEqual(loaded.aiRuntime.mcp?.servers, []);
	assert.equal(loaded.chat.enableQuickActions, DEFAULT_SETTINGS.chat.enableQuickActions);
	assert.deepEqual(loaded.chat.quickActions, []);
});

test('SettingsDomainService hydratePersistedSettings 在默认系统消息迁移失败时记录错误并继续返回设置', async () => {
	installTestWindow();
	const { SettingsDomainService } = await import('./service');
	const { DEFAULT_SETTINGS } = await import('./config');
	const loggedMessages: string[] = [];
	const settingsService = new SettingsDomainService({
		app: {},
		async loadData() {
			return {
				aiRuntime: { enableDefaultSystemMsg: true, defaultSystemMsg: 'legacy prompt' },
			};
		},
		async saveData() {},
	}, {
		async ensureAiDataFolders() {},
	} as never, {
		...createNoopLogger(),
		error(message: string): void {
			loggedMessages.push(message);
		},
	}, createServiceDependencies({
		decryptAiRuntimeSettings: (settings) => ({ ...DEFAULT_SETTINGS.aiRuntime, ...(settings ?? {}) }),
		migrateFromLegacyDefaultSystemMessage: async () => {
			throw new Error('migrate failed');
		},
		loadServers: async () => [],
	}));
	const bootstrapSettings = await settingsService.loadBootstrapSettings();
	const loaded = await settingsService.hydratePersistedSettings(bootstrapSettings);
	assert.equal(loaded.aiRuntime.enableGlobalSystemPrompts, DEFAULT_SETTINGS.aiRuntime.enableGlobalSystemPrompts);
	assert.equal(loggedMessages.includes('[SettingsDomain] 迁移默认系统消息失败（忽略，继续加载）'), true);
});

test('SettingsDomainService hydratePersistedSettings 会合并成功读取的 MCP 服务器列表', async () => {
	installTestWindow();
	const { SettingsDomainService } = await import('./service');
	const { DEFAULT_SETTINGS } = await import('./config');
	const settingsService = new SettingsDomainService({
		app: {},
		async loadData() {
			return {
				aiDataFolder: 'Mcp/AI Data',
				aiRuntime: {
					mcp: {
						enabled: true,
					},
				},
			};
		},
		async saveData() {},
	}, {
		async ensureAiDataFolders() {},
	} as never, createNoopLogger(), createServiceDependencies({
		decryptAiRuntimeSettings: (settings) => ({ ...DEFAULT_SETTINGS.aiRuntime, ...(settings ?? {}) }),
		loadServers: async () => [{ id: 'server-a', name: 'Server A' }],
	}));
	const bootstrapSettings = await settingsService.loadBootstrapSettings();
	const loaded = await settingsService.hydratePersistedSettings(bootstrapSettings);
	assert.deepEqual(loaded.aiRuntime.mcp?.servers, [{ id: 'server-a', name: 'Server A' }]);
	assert.equal(loaded.aiRuntime.mcp?.enabled, true);
});

test('SettingsDomainService hydratePersistedSettings 会迁移默认系统消息并在 MCP 读取失败时回退空列表', async () => {
	installTestWindow();
	const { SettingsDomainService } = await import('./service');
	const { DEFAULT_SETTINGS } = await import('./config');
	const loggedMessages: string[] = [];
	let decryptCallCount = 0;
	const settingsService = new SettingsDomainService({
		app: {},
		async loadData() {
			return {
				aiDataFolder: 'Custom/AI Data',
				chat: {
					enableSelectionToolbar: true,
					maxToolbarButtons: 7,
				},
				aiRuntime: {
					enableDefaultSystemMsg: true,
					defaultSystemMsg: 'legacy system prompt',
				},
			};
		},
		async saveData() {},
	}, {
		async ensureAiDataFolders() {},
	} as never, {
		...createNoopLogger(),
		error(message: string): void {
			loggedMessages.push(message);
		},
	}, createServiceDependencies({
		decryptAiRuntimeSettings: (settings) => {
			decryptCallCount += 1;
			return {
				...DEFAULT_SETTINGS.aiRuntime,
				...(settings ?? {}),
			};
		},
		migrateFromLegacyDefaultSystemMessage: async () => true,
		loadServers: async () => {
			throw new Error('mcp unavailable');
		},
	}));

	const bootstrapSettings = await settingsService.loadBootstrapSettings();
	const loaded = await settingsService.hydratePersistedSettings(bootstrapSettings);

	assert.equal(loaded.aiDataFolder, 'Custom/AI Data');
	assert.equal(loaded.aiRuntime.enableGlobalSystemPrompts, true);
	assert.deepEqual(loaded.aiRuntime.mcp?.servers, []);
	assert.equal(loaded.chat.enableQuickActions, true);
	assert.equal(loaded.chat.maxQuickActionButtons, 7);
	assert.equal('enableDefaultSystemMsg' in loaded.aiRuntime, false);
	assert.equal(decryptCallCount, 1);
	assert.equal(loggedMessages.includes('[SettingsDomain] 加载 MCP 服务器 Markdown 配置失败，回退空列表'), true);
	assert.equal(loaded.chat.quickActions.length, DEFAULT_SETTINGS.chat.quickActions.length);
});

test('SettingsDomainService save 会剥离运行时字段和旧字段并同步 MCP servers', async () => {
	installTestWindow();
	const { SettingsDomainService } = await import('./service');
	const { DEFAULT_SETTINGS } = await import('./config');
	let savedPayload: Record<string, unknown> | null = null;
	let encryptedRuntime: PluginSettings['aiRuntime'] | null = null;
	let syncServersArgs: { aiDataFolder: string; servers: unknown[] } | null = null;
	const settingsService = new SettingsDomainService({
		app: {},
		settings: DEFAULT_SETTINGS,
		async loadData() {
			return {
				promptTemplateFolder: 'Legacy/Templates',
				chat: {
					chatFolder: 'Legacy/Chats',
					enableQuickActions: false,
				},
				aiRuntime: {
					enableDefaultSystemMsg: true,
					defaultSystemMsg: 'legacy',
					mcp: {
						builtinVaultEnabled: true,
					},
				},
			};
		},
		async saveData(data: unknown) {
			savedPayload = data as Record<string, unknown>;
		},
	}, {
		async ensureAiDataFolders() {},
	} as never, createNoopLogger(), createServiceDependencies({
		encryptAiRuntimeSettings: (settings) => {
			encryptedRuntime = {
				...settings,
				vendorApiKeys: {},
				vendorApiKeysByDevice: {
					OpenAI: {
						deviceA: 'encrypted-value',
					},
				},
			};
			return encryptedRuntime;
		},
		syncServers: async (aiDataFolder, servers) => {
			syncServersArgs = {
				aiDataFolder,
				servers,
			};
			return [{
				id: 'server-1',
				name: 'Server 1',
				enabled: true,
				transportType: 'stdio',
				timeout: 30000,
			}];
		},
	}));

	await settingsService.save({
		...DEFAULT_SETTINGS,
		aiDataFolder: 'Next/AI Data/',
		chat: {
			...DEFAULT_SETTINGS.chat,
			enableQuickActions: true,
			quickActions: [{ id: 'runtime-only' } as never],
			skills: ['legacy-skill'] as never,
		},
		aiRuntime: {
			...DEFAULT_SETTINGS.aiRuntime,
			vendorApiKeys: { OpenAI: 'sk-test-1234567890' },
			editorStatus: { isTextInserting: true },
			mcp: {
				...DEFAULT_SETTINGS.aiRuntime.mcp,
				builtinVaultEnabled: true,
				servers: [{
					id: 'server-1',
					name: 'Server 1',
					enabled: true,
					transportType: 'stdio',
					timeout: 30000,
				} as never],
			},
		},
	});

	assert.ok(savedPayload);
	assert.equal(savedPayload?.promptTemplateFolder, undefined);
	assert.equal(savedPayload?.aiDataFolder, 'Next/AI Data');
	const persistedChat = (savedPayload?.chat ?? {}) as Record<string, unknown>;
	assert.equal(persistedChat.enableQuickActions, true);
	assert.equal('quickActions' in persistedChat, false);
	assert.equal('skills' in persistedChat, false);
	assert.equal('chatFolder' in persistedChat, false);
	const persistedAiRuntime = (savedPayload?.aiRuntime ?? {}) as Record<string, unknown>;
	assert.equal('vendorApiKeys' in persistedAiRuntime, false);
	assert.equal('editorStatus' in persistedAiRuntime, false);
	assert.equal('enableDefaultSystemMsg' in persistedAiRuntime, false);
	const persistedMcp = (persistedAiRuntime.mcp ?? {}) as Record<string, unknown>;
	assert.equal('servers' in persistedMcp, false);
	assert.equal('builtinVaultEnabled' in persistedMcp, false);
	assert.deepEqual(persistedAiRuntime.vendorApiKeysByDevice, {
		OpenAI: {
			deviceA: 'encrypted-value',
		},
	});
	assert.equal(encryptedRuntime !== null, true);
	assert.deepEqual(syncServersArgs, {
		aiDataFolder: 'Next/AI Data',
		servers: [{
			id: 'server-1',
			name: 'Server 1',
			enabled: true,
			transportType: 'stdio',
			timeout: 30000,
		}],
	});
});

test('SettingsDomainService save 在 MCP servers 同步失败时仍会保存其余设置并记录错误', async () => {
	installTestWindow();
	const { SettingsDomainService } = await import('./service');
	const { DEFAULT_SETTINGS } = await import('./config');
	let savedPayload: Record<string, unknown> | null = null;
	const loggedMessages: string[] = [];
	const settingsService = new SettingsDomainService({
		app: {},
		async loadData() {
			return {};
		},
		async saveData(data: unknown) {
			savedPayload = data as Record<string, unknown>;
		},
	}, {
		async ensureAiDataFolders() {},
	} as never, {
		...createNoopLogger(),
		error(message: string): void {
			loggedMessages.push(message);
		},
	}, createServiceDependencies({
		encryptAiRuntimeSettings: (settings) => ({
			...settings,
			vendorApiKeys: {},
			vendorApiKeysByDevice: {},
		}),
		syncServers: async () => {
			throw new Error('disk unavailable');
		},
	}));

	await settingsService.save({
		...DEFAULT_SETTINGS,
		aiRuntime: {
			...DEFAULT_SETTINGS.aiRuntime,
			mcp: {
				...DEFAULT_SETTINGS.aiRuntime.mcp,
				servers: [{
					id: 'server-2',
					name: 'Server 2',
					enabled: true,
					transportType: 'stdio',
					timeout: 30000,
				} as never],
			},
		},
	});

	assert.ok(savedPayload);
	assert.equal(
		loggedMessages.includes('[SettingsDomain] 保存 MCP 服务器 Markdown 配置失败，继续保存其余设置'),
		true,
	);
	const persistedAiRuntime = (savedPayload?.aiRuntime ?? {}) as Record<string, unknown>;
	const persistedMcp = (persistedAiRuntime.mcp ?? {}) as Record<string, unknown>;
	assert.equal('servers' in persistedMcp, false);
});

test('SettingsDomainService 会委托 provider 和迁移适配器执行公共入口', async () => {
	installTestWindow();
	const { SettingsDomainService } = await import('./service');
	const { DEFAULT_SETTINGS } = await import('./config');
	const calls: string[] = [];
	const settingsService = new SettingsDomainService({
		app: {},
		async loadData() { return {}; },
		async saveData() {},
	}, {
		async ensureAiDataFolders(aiDataFolder: string): Promise<void> {
			calls.push(`ensure:${aiDataFolder}`);
		},
	} as never, createNoopLogger(), createServiceDependencies({
		migrateAIDataStorage: async (settings) => {
			calls.push(`migrate:${settings.aiDataFolder}`);
		},
		cleanupLegacyAIStorage: async () => {
			calls.push('cleanup');
		},
	}));
	await settingsService.ensureAiDataFolders('System/AI Data');
	await settingsService.migrateAiDataStorage(DEFAULT_SETTINGS);
	await settingsService.cleanupLegacyAiStorage();
	assert.deepEqual(calls, ['ensure:System/AI Data', `migrate:${DEFAULT_SETTINGS.aiDataFolder}`, 'cleanup']);
});
