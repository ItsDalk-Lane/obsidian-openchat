import en from './locale/en';
import zhCN from './locale/zh-cn';
import zhTW from './locale/zh-tw';
import { DebugLogger } from 'src/utils/DebugLogger';

type LocaleDictionary = Partial<Record<keyof typeof en, string>>;

const localeMap: Record<string, LocaleDictionary> = {
	en,
	'en-US': en,
	'zh-TW': zhTW,
	'zh-CN': zhCN,
	zh: zhCN,
};

const getStoredLanguage = (): string | null => {
	const hostWindow = globalThis as typeof globalThis & {
		window?: {
			localStorage?: {
				getItem: (key: string) => string | null;
			};
		};
	};

	return hostWindow.window?.localStorage?.getItem('language') ?? null;
};

const resolveLocale = (): LocaleDictionary => {
	const lang = getStoredLanguage();
	return localeMap[lang || 'zh'] ?? zhCN;
};

export function t(str: keyof typeof en | string): string {
	const lang = getStoredLanguage();
	const locale = resolveLocale();

	if (!locale) {
		DebugLogger.error('Error: locale not found', lang);
	}

	if (str in en) {
		const key = str as keyof typeof en;
		return (locale && locale[key]) || en[key];
	}

	return str;
}
