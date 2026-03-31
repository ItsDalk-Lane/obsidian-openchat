import { normalizeVaultPath } from 'src/utils/aiPathSupport';
import type { SelectedFile } from '../types/chat';

export const MANAGED_IMPORTED_ATTACHMENT_SOURCE = 'managed-import';
export const MANAGED_IMPORTED_FILES_FRONTMATTER_KEY = 'managedImportedFiles';

const normalizeManagedImportedPath = (path: string): string => normalizeVaultPath(path);

export const isManagedImportedSelectedFile = (
	file: Pick<SelectedFile, 'attachmentSource'> | null | undefined,
): boolean => file?.attachmentSource === MANAGED_IMPORTED_ATTACHMENT_SOURCE;

export const mergeManagedImportedFilePaths = (
	...groups: ReadonlyArray<readonly string[] | undefined>
): string[] => {
	const merged = new Set<string>();
	for (const group of groups) {
		for (const path of group ?? []) {
			if (typeof path !== 'string' || path.trim().length === 0) {
				continue;
			}
			merged.add(normalizeManagedImportedPath(path));
		}
	}
	return Array.from(merged);
};

export const getManagedImportedFilePaths = (
	selectedFiles: readonly SelectedFile[] | undefined,
): string[] => {
	return mergeManagedImportedFilePaths(
		(selectedFiles ?? [])
			.filter((file) => isManagedImportedSelectedFile(file))
			.map((file) => file.path),
	);
};

export const readManagedImportedFilePaths = (
	frontmatter: Record<string, unknown> | null | undefined,
): string[] => {
	const values = frontmatter?.[MANAGED_IMPORTED_FILES_FRONTMATTER_KEY];
	return Array.isArray(values)
		? mergeManagedImportedFilePaths(values.filter((value): value is string => typeof value === 'string'))
		: [];
};