/**
 * @module providers/settings
 * @description 提供显式注入的设置读取与替换接口。
 *
 * @dependencies src/providers/providers.types
 * @side-effects 取决于调用方传入的 replace 实现
 * @invariants 不直接持有插件实例，只依赖注入函数。
 */

import type { SettingsProvider } from './providers.types';

/**
 * @precondition getCurrentSettings 和 replaceSettings 均已提供
 * @postcondition 返回统一的 SettingsProvider
 * @throws 从不抛出
 * @example createSettingsProvider({ getCurrentSettings, replaceSettings })
 */
export function createSettingsProvider<TSettings>(params: {
	getCurrentSettings: () => TSettings;
	replaceSettings: (nextSettings: TSettings) => Promise<TSettings>;
}): SettingsProvider<TSettings> {
	return {
		getSnapshot(): Readonly<TSettings> {
			return params.getCurrentSettings();
		},
		async replaceSettings(nextSettings: TSettings): Promise<TSettings> {
			return await params.replaceSettings(nextSettings);
		},
		async updateSettings(updater: (current: Readonly<TSettings>) => TSettings): Promise<TSettings> {
			return await params.replaceSettings(updater(params.getCurrentSettings()));
		},
	};
}
