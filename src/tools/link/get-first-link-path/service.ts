import type { BuiltinValidationResult, ToolContext } from '../../runtime/types';
import type {
	GetFirstLinkPathArgs,
	GetFirstLinkPathResult,
} from './schema';

export function cleanLinkText(linkText: string): string {
	let cleaned = linkText.trim();

	if (cleaned.startsWith('[[') && cleaned.endsWith(']]')) {
		cleaned = cleaned.slice(2, -2);
	} else if (cleaned.startsWith('[[')) {
		cleaned = cleaned.slice(2);
	} else if (cleaned.endsWith(']]')) {
		cleaned = cleaned.slice(0, -2);
	}

	const pipeIndex = cleaned.indexOf('|');
	if (pipeIndex !== -1) {
		cleaned = cleaned.slice(0, pipeIndex);
	}

	const hashIndex = cleaned.indexOf('#');
	if (hashIndex !== -1) {
		cleaned = cleaned.slice(0, hashIndex);
	}

	return cleaned.trim();
}

export const validateGetFirstLinkPathInput = (
	args: GetFirstLinkPathArgs,
): BuiltinValidationResult => {
	if (!cleanLinkText(args.internal_link)) {
		return {
			ok: false,
			summary: 'internal_link 在清理别名和标题后不能为空。',
		};
	}
	return { ok: true };
};

export const summarizeGetFirstLinkPath = (
	args: Partial<GetFirstLinkPathArgs>,
): string | null => {
	const value = args.internal_link;
	if (typeof value !== 'string') {
		return null;
	}
	return cleanLinkText(value) || value.trim() || null;
};

export const describeGetFirstLinkPathActivity = (
	args: Partial<GetFirstLinkPathArgs>,
): string | null => {
	const summary = summarizeGetFirstLinkPath(args);
	return summary ? `解析内部链接: ${summary}` : '解析内部链接';
};

export const executeGetFirstLinkPath = (
	args: GetFirstLinkPathArgs,
	context: ToolContext,
): GetFirstLinkPathResult => {
	const cleanedLink = cleanLinkText(args.internal_link);
	const targetFile = context.app.metadataCache.getFirstLinkpathDest(cleanedLink, '');

	if (targetFile) {
		return {
			file_path: targetFile.path,
			found: true,
		};
	}

	return {
		file_path: '',
		found: false,
	};
};
