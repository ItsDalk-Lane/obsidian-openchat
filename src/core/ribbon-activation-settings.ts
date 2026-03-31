import type { PluginSettings } from 'src/domains/settings/types';

export interface RibbonActivationSettingsDeps {
	ensureBootstrapSettingsLoaded(): Promise<PluginSettings>;
	getCurrentSettings(): Readonly<PluginSettings>;
}

export const getRibbonActivationOpenMode = async (
	deps: RibbonActivationSettingsDeps,
): Promise<PluginSettings['chat']['openMode']> => {
	await deps.ensureBootstrapSettingsLoaded();
	return deps.getCurrentSettings().chat.openMode;
};