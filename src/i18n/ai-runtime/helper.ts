import en from './locale/en';
import zhCN from './locale/zh-cn';
import zhTW from './locale/zh-tw';
import { DebugLogger } from 'src/utils/DebugLogger';

const localeMap: { [key: string]: Partial<typeof en> } = {
	en,
	'en-US': en,
	'zh-TW': zhTW,
	'zh-CN': zhCN,
	zh: zhCN,
};

const lang = window.localStorage.getItem('language');
const locale = localeMap[lang || 'zh'] ?? zhCN;

export function t(str: keyof typeof en | string): string {
	if (!locale) {
		DebugLogger.error('Error: locale not found', lang);
	}

	if (str in en) {
		const key = str as keyof typeof en;
		return (locale && locale[key]) || en[key];
	}

	return str;
}
