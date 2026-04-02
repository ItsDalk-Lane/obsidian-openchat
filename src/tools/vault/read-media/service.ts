import type { App } from 'obsidian';
import { getFileOrThrow } from '../_shared/helpers';
import { normalizeFilePath } from '../_shared/path';
import { getMimeType, toBase64 } from '../filesystemFileOps';

type MediaContentType = 'image' | 'audio' | 'blob';

const resolveMediaContentType = (mimeType: string): MediaContentType => {
	if (mimeType.startsWith('image/')) {
		return 'image';
	}
	if (mimeType.startsWith('audio/')) {
		return 'audio';
	}
	return 'blob';
};

export const executeReadMedia = async (
	app: App,
	args: { file_path: string },
): Promise<{
	content: Array<{
		type: MediaContentType;
		data: string;
		mimeType: string;
	}>;
} | {
	isError: true;
	content: Array<{
		type: 'text';
		text: string;
	}>;
}> => {
	try {
		const normalizedPath = normalizeFilePath(args.file_path, 'file_path');
		const file = getFileOrThrow(app, normalizedPath);
		const binary = await app.vault.readBinary(file);
		const mimeType = getMimeType(normalizedPath);
		return {
			content: [
				{
					type: resolveMediaContentType(mimeType),
					data: toBase64(binary),
					mimeType,
				},
			],
		};
	} catch (error) {
		return {
			isError: true,
			content: [
				{
					type: 'text',
					text: error instanceof Error ? error.message : String(error),
				},
			],
		};
	}
};
