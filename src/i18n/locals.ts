import type { Local } from './local';
import { en } from './en';
import { zh } from './zh';
import { zhTw } from './zhTw';

interface ObsidianLanguageModule {
	getLanguage?: () => string;
}

function tryRequireObsidian(): ObsidianLanguageModule | null {
	const requireFn = Function(
		'return typeof require !== "undefined" ? require : undefined;',
	)() as ((id: string) => unknown) | undefined;
	if (!requireFn) {
		return null;
	}

	try {
		return requireFn('obsidian') as ObsidianLanguageModule;
	} catch {
		return null;
	}
}

function getFallbackLanguage(): string {
	const windowObject = globalThis.window as
		| { localStorage?: { getItem: (key: string) => string | null } }
		| undefined;
	const storedLanguage = windowObject?.localStorage?.getItem('language');
	if (typeof storedLanguage === 'string' && storedLanguage.length > 0) {
		return storedLanguage;
	}

	const navigatorLanguage = globalThis.navigator?.language;
	if (typeof navigatorLanguage === 'string' && navigatorLanguage.length > 0) {
		return navigatorLanguage;
	}

	return 'en';
}

function getCurrentLanguage(): string {
	const obsidianLanguage = tryRequireObsidian()?.getLanguage?.();
	if (typeof obsidianLanguage === 'string' && obsidianLanguage.length > 0) {
		return obsidianLanguage;
	}
	return getFallbackLanguage();
}

export class Locals {
	static get(): Local {
		const lang = getCurrentLanguage();
		if (lang === 'zh-CN' || lang === 'zh') {
			return { ...zh };
		}
		if (lang === 'zh-TW') {
			return { ...zhTw };
		}
		return { ...en };
	}
}

export const localInstance = Locals.get();
