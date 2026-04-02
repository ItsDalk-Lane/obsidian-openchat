import type { App } from 'obsidian';
import {
	normalizeAndValidatePath,
} from 'src/core/services/fileOperationHelpers';
import { convertFrontmatterValue } from 'src/utils/convertFrontmatterValue';
import type {
	BuiltinPermissionDecision,
	BuiltinValidationResult,
} from '../../runtime/types';
import {
	getFileOrThrow,
	parseFrontmatterDocument,
	serializeFrontmatterDocument,
} from '../_shared/helpers';
import { normalizeFilePath } from '../_shared/path';
import type {
	PropertyEditArgs,
	PropertyEditOperation,
	PropertyEditResult,
} from './schema';

const normalizePropertyEditPath = (filePath: string): string => {
	normalizeAndValidatePath(filePath);
	const normalized = normalizeFilePath(filePath, 'file_path');
	if (!normalized.endsWith('.md')) {
		throw new Error('property_edit 目前只支持 Markdown 文件');
	}
	return normalized;
};

const normalizePropertyKey = (key: string): string => {
	const normalized = key.trim();
	if (!normalized) {
		throw new Error('属性 key 不能为空');
	}
	return normalized;
};

const normalizePropertyEditArgs = (
	args: PropertyEditArgs,
): PropertyEditArgs => ({
	file_path: normalizePropertyEditPath(args.file_path),
	operations: args.operations.map((operation) => ({
		...operation,
		key: normalizePropertyKey(operation.key),
	})),
});

const formatPreviewValue = (value: unknown): string => {
	if (value === undefined) {
		return 'undefined';
	}
	return JSON.stringify(value);
};

const isSameYamlValue = (left: unknown, right: unknown): boolean => (
	JSON.stringify(left) === JSON.stringify(right)
);

const toComparableArray = (value: unknown): unknown[] => (
	Array.isArray(value) ? value : [value]
);

const recordKeyChange = (
	updatedKeys: string[],
	key: string,
): void => {
	if (!updatedKeys.includes(key)) {
		updatedKeys.push(key);
	}
};

const applySetOperation = (
	app: App,
	frontmatter: Record<string, unknown>,
	operation: Extract<PropertyEditOperation, { action: 'set' }>,
	updatedKeys: string[],
	diffLines: string[],
): void => {
	const nextValue = convertFrontmatterValue(app, operation.key, operation.value, {
		strictMode: true,
	});
	const previousValue = frontmatter[operation.key];
	if (isSameYamlValue(previousValue, nextValue)) {
		return;
	}
	frontmatter[operation.key] = nextValue;
	recordKeyChange(updatedKeys, operation.key);
	diffLines.push(
		`set ${operation.key}: ${formatPreviewValue(previousValue)} -> ${formatPreviewValue(nextValue)}`,
	);
};

const applyDeleteOperation = (
	frontmatter: Record<string, unknown>,
	operation: Extract<PropertyEditOperation, { action: 'delete' }>,
	updatedKeys: string[],
	diffLines: string[],
): void => {
	if (!(operation.key in frontmatter)) {
		return;
	}
	diffLines.push(`delete ${operation.key}`);
	delete frontmatter[operation.key];
	recordKeyChange(updatedKeys, operation.key);
};

const applyAppendOperation = (
	app: App,
	frontmatter: Record<string, unknown>,
	operation: Extract<PropertyEditOperation, { action: 'append' }>,
	updatedKeys: string[],
	diffLines: string[],
): void => {
	const appendedValues = toComparableArray(
		convertFrontmatterValue(app, operation.key, operation.value, {
			strictMode: true,
		}),
	);
	if (appendedValues.length === 0) {
		return;
	}
	const currentValue = frontmatter[operation.key];
	const nextValue = Array.isArray(currentValue)
		? [...currentValue, ...appendedValues]
		: currentValue === undefined
			? [...appendedValues]
			: [currentValue, ...appendedValues];
	if (isSameYamlValue(currentValue, nextValue)) {
		return;
	}
	frontmatter[operation.key] = nextValue;
	recordKeyChange(updatedKeys, operation.key);
	diffLines.push(`append ${operation.key}: + ${formatPreviewValue(appendedValues)}`);
};

const applyRemoveOperation = (
	app: App,
	frontmatter: Record<string, unknown>,
	operation: Extract<PropertyEditOperation, { action: 'remove' }>,
	updatedKeys: string[],
	diffLines: string[],
): void => {
	const currentValue = frontmatter[operation.key];
	if (currentValue === undefined) {
		return;
	}
	const removeValues = toComparableArray(
		convertFrontmatterValue(app, operation.key, operation.value, {
			strictMode: true,
		}),
	);
	const shouldRemove = (value: unknown): boolean => (
		removeValues.some((candidate) => isSameYamlValue(candidate, value))
	);
	const nextValue = Array.isArray(currentValue)
		? currentValue.filter((item) => !shouldRemove(item))
		: shouldRemove(currentValue)
			? undefined
			: currentValue;
	if (isSameYamlValue(currentValue, nextValue)) {
		return;
	}
	if (Array.isArray(nextValue) && nextValue.length > 0) {
		frontmatter[operation.key] = nextValue;
	} else if (nextValue === undefined || (Array.isArray(nextValue) && nextValue.length === 0)) {
		delete frontmatter[operation.key];
	}
	recordKeyChange(updatedKeys, operation.key);
	diffLines.push(`remove ${operation.key}: - ${formatPreviewValue(removeValues)}`);
};

const applyPropertyEditOperation = (
	app: App,
	frontmatter: Record<string, unknown>,
	operation: PropertyEditOperation,
	updatedKeys: string[],
	diffLines: string[],
): void => {
	switch (operation.action) {
		case 'set':
			applySetOperation(app, frontmatter, operation, updatedKeys, diffLines);
			return;
		case 'delete':
			applyDeleteOperation(frontmatter, operation, updatedKeys, diffLines);
			return;
		case 'append':
			applyAppendOperation(app, frontmatter, operation, updatedKeys, diffLines);
			return;
		case 'remove':
			applyRemoveOperation(app, frontmatter, operation, updatedKeys, diffLines);
			return;
	}
};

const hasDestructivePropertyOperation = (
	operation: PropertyEditOperation,
): boolean => operation.action === 'delete' || operation.action === 'remove';

const listAffectedKeys = (args: PropertyEditArgs): string => (
	args.operations.map((operation) => operation.key).join(', ')
);

export const validatePropertyEditInput = (
	args: PropertyEditArgs,
): BuiltinValidationResult => {
	try {
		normalizePropertyEditArgs(args);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			summary: error instanceof Error ? error.message : String(error),
			notes: [
				'property_edit 只处理 Markdown frontmatter / Properties，不处理正文文本。',
			],
		};
	}
};

export const checkPropertyEditPermissions = async (
	_app: App,
	args: PropertyEditArgs,
): Promise<BuiltinPermissionDecision<PropertyEditArgs>> => {
	const updatedArgs = normalizePropertyEditArgs(args);
	const destructive = updatedArgs.operations.some(hasDestructivePropertyOperation);
	if (!destructive) {
		return { behavior: 'allow', updatedArgs };
	}
	return {
		behavior: 'ask',
		message: `将删除 ${updatedArgs.file_path} 中的一个或多个属性值`,
		updatedArgs,
		escalatedRisk: 'destructive',
		confirmation: {
			title: '确认属性删除',
			body: `${updatedArgs.file_path}\n${listAffectedKeys(updatedArgs)}`,
			confirmLabel: '确认修改',
		},
	};
};

export const summarizePropertyEdit = (
	args: Partial<PropertyEditArgs>,
): string | null => {
	if (!args.file_path) {
		return null;
	}
	const count = Array.isArray(args.operations) ? args.operations.length : 0;
	return `${args.file_path}${count > 0 ? ` (${count} ops)` : ''}`;
};

export const describePropertyEditActivity = (
	args: Partial<PropertyEditArgs>,
): string | null => (
	args.file_path ? `编辑属性 ${args.file_path}` : null
);

export const executePropertyEdit = async (
	app: App,
	args: PropertyEditArgs,
): Promise<PropertyEditResult> => {
	const normalized = normalizePropertyEditArgs(args);
	const file = getFileOrThrow(app, normalized.file_path);
	const originalContent = await app.vault.cachedRead(file);
	const parsed = parseFrontmatterDocument(originalContent);
	const frontmatter = { ...parsed.frontmatter };
	const updatedKeys: string[] = [];
	const diffLines: string[] = [];

	for (const operation of normalized.operations) {
		applyPropertyEditOperation(app, frontmatter, operation, updatedKeys, diffLines);
	}

	if (updatedKeys.length > 0) {
		const nextContent = serializeFrontmatterDocument(frontmatter, parsed.body);
		await app.vault.modify(file, nextContent);
	}

	return {
		file_path: normalized.file_path,
		updated_keys: updatedKeys,
		...(diffLines.length > 0 ? { diff_preview: diffLines.join('\n') } : {}),
	};
};

export const isDestructivePropertyEdit = (
	args: PropertyEditArgs,
): boolean => args.operations.some(hasDestructivePropertyOperation);
