import { getLanguage } from 'obsidian';
import type { Local } from './local';
import { en } from './en';
import { zh } from './zh';
import { zhTw } from './zhTw';

export class Locals {
	static get(): Local {
		const lang = getLanguage();
		if (lang === 'zh-CN' || lang === 'zh') {
			return { ...zh };
		}
		if (lang === 'zh-TW') {
			return { ...zhTw };
		}
		return { ...en };
	}
}

export function isZh(): boolean {
	const lang = getLanguage();
	return lang === 'zh' || lang === 'zh-TW' || lang === 'zh-CN';
}

export const localInstance = Locals.get();
