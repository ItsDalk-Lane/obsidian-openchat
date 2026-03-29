import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface ManagedFile {
	absolutePath: string;
	relativePath: string;
	content: string;
	sourceFile: ts.SourceFile;
	category: ManagedFileCategory;
}

export type DomainLayer = 'types' | 'config' | 'service' | 'ui';
export type ProviderRole = 'contract' | 'implementation';
export type ChatRole = 'service' | 'host-adapter' | 'consumer';
export type ModuleScope =
	| 'root'
	| 'command'
	| 'component'
	| 'context'
	| 'core'
	| 'editor'
	| 'hook'
	| 'i18n'
	| 'runtime-adapter'
	| 'service'
	| 'settings'
	| 'shared'
	| 'tool'
	| 'type';
export type ShimScope = 'command' | 'core' | 'editor' | 'service' | 'settings' | 'type';

export type ManagedFileCategory =
	| { kind: 'infra' }
	| { kind: 'provider'; role: ProviderRole; moduleName: string }
	| { kind: 'chat'; role: ChatRole }
	| { kind: 'domain'; domainName: string; layer: DomainLayer }
	| { kind: 'module'; scope: ModuleScope }
	| { kind: 'shim'; scope: ShimScope }
	| { kind: 'unknown' };

export interface LintViolation {
	filePath: string;
	message: string;
	line?: number;
	rule: string;
}

const MANAGED_ROOTS = ['infra', 'src'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

export const DOMAIN_LAYER_ORDER: Record<DomainLayer, number> = {
	types: 0,
	config: 1,
	service: 2,
	ui: 3,
};

const SHIM_FILE_SCOPES: Record<string, ShimScope> = {
	'src/commands/chat/chat-view-coordinator.ts': 'command',
	'src/commands/chat/chat-view-coordinator-ui.ts': 'command',
	'src/core/chat/utils/markdown.ts': 'core',
	'src/editor/selectionToolbar/QuickActionDataService.ts': 'editor',
	'src/editor/selectionToolbar/QuickActionExecutionService.ts': 'editor',
	'src/editor/selectionToolbar/quickActionDataUtils.ts': 'editor',
	'src/editor/selectionToolbar/quickActionGroupHelpers.ts': 'editor',
	'src/editor/types/chat.ts': 'editor',
	'src/services/mcp/types.ts': 'service',
	'src/settings/ai-runtime/api.ts': 'settings',
	'src/types/chat.ts': 'type',
	'src/types/mcp.ts': 'type',
	'src/types/provider.ts': 'type',
	'src/types/sub-agent.ts': 'type',
	'src/types/system-prompt.ts': 'type',
};

export function normalizePath(value: string): string { return value.replace(/\\/g, '/'); }

export function createManagedFile(relativePath: string, content: string): ManagedFile {
	const normalized = normalizePath(relativePath);
	return {
		absolutePath: normalized,
		relativePath: normalized,
		content,
		sourceFile: ts.createSourceFile(normalized, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
		category: classifyManagedFile(normalized),
	};
}

export function collectManagedFiles(workspaceRoot: string): ManagedFile[] {
	const files: ManagedFile[] = [];
	for (const root of MANAGED_ROOTS) {
		const absoluteRoot = path.join(workspaceRoot, root);
		if (!fs.existsSync(absoluteRoot)) {
			continue;
		}
		walkDirectory(workspaceRoot, absoluteRoot, files);
	}
	return dedupeManagedFiles(files).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function walkDirectory(workspaceRoot: string, directoryPath: string, files: ManagedFile[]): void {
	for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
		const absoluteEntryPath = path.join(directoryPath, entry.name);
		if (entry.isDirectory()) {
			walkDirectory(workspaceRoot, absoluteEntryPath, files);
			continue;
		}
		if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			continue;
		}
		if (entry.name.endsWith('.test.ts')) {
			continue;
		}
		files.push(readManagedFile(workspaceRoot, absoluteEntryPath));
	}
}

function readManagedFile(workspaceRoot: string, absolutePath: string): ManagedFile {
	const relativePath = normalizePath(path.relative(workspaceRoot, absolutePath));
	const content = fs.readFileSync(absolutePath, 'utf8');
	return {
		absolutePath,
		relativePath,
		content,
		sourceFile: ts.createSourceFile(relativePath, content, ts.ScriptTarget.Latest, true),
		category: classifyManagedFile(relativePath),
	};
}

export function classifyManagedFile(relativePath: string): ManagedFileCategory {
	const normalized = normalizePath(relativePath);
	if (normalized.startsWith('infra/')) {
		return { kind: 'infra' };
	}
	if (normalized.startsWith('src/providers/')) {
		const fileName = normalized.split('/').pop()?.replace(/\.(ts|tsx)$/u, '') ?? '';
		return {
			kind: 'provider',
			role: normalized === 'src/providers/providers.types.ts' ? 'contract' : 'implementation',
			moduleName: fileName === 'providers.types'
				? 'providers.types'
				: fileName.replace(/-(core|runtime|impl|internal|adapter)$/u, ''),
		};
	}
	const shimScope = SHIM_FILE_SCOPES[normalized];
	if (shimScope) {
		return { kind: 'shim', scope: shimScope };
	}
	if (normalized === 'src/core/chat/chat-feature-manager.tsx') {
		return { kind: 'chat', role: 'consumer' };
	}
	if (
		normalized === 'src/core/chat/services/file-content-service.ts'
		|| normalized === 'src/core/chat/services/message-service.ts'
	) {
		return { kind: 'chat', role: 'host-adapter' };
	}
	if (
		normalized.startsWith('src/core/chat/services/')
		|| normalized.startsWith('src/core/chat/runtime/')
		|| normalized.startsWith('src/core/chat/utils/')
	) {
		return { kind: 'chat', role: 'service' };
	}
	if (normalized.startsWith('src/commands/chat/')) {
		return { kind: 'chat', role: 'consumer' };
	}
	if (
		normalized === 'src/main.ts'
		|| normalized === 'src/core/FeatureCoordinator.ts'
		|| normalized === 'src/core/PluginStartupCoordinator.ts'
		|| normalized === 'src/core/settings-adapter-assembly.ts'
		|| normalized === 'src/core/chat-assembler.ts'
		|| normalized === 'src/core/ai-runtime-assembler.ts'
		|| normalized === 'src/core/feature-query-facade.ts'
	) {
		return { kind: 'module', scope: 'root' };
	}
	if (normalized.startsWith('src/commands/')) {
		return { kind: 'module', scope: 'command' };
	}
	if (normalized.startsWith('src/components/')) {
		return { kind: 'module', scope: 'component' };
	}
	if (normalized.startsWith('src/contexts/')) {
		return { kind: 'module', scope: 'context' };
	}
	if (normalized.startsWith('src/editor/')) {
		return { kind: 'module', scope: 'editor' };
	}
	if (normalized.startsWith('src/hooks/')) {
		return { kind: 'module', scope: 'hook' };
	}
	if (normalized.startsWith('src/i18n/')) {
		return { kind: 'module', scope: 'i18n' };
	}
	if (normalized.startsWith('src/LLMProviders/')) {
		return { kind: 'module', scope: 'runtime-adapter' };
	}
	if (normalized.startsWith('src/services/')) {
		return { kind: 'module', scope: 'service' };
	}
	if (normalized.startsWith('src/settings/')) {
		return { kind: 'module', scope: 'settings' };
	}
	if (normalized.startsWith('src/tools/')) {
		return { kind: 'module', scope: 'tool' };
	}
	if (normalized.startsWith('src/types/')) {
		return { kind: 'module', scope: 'type' };
	}
	if (normalized.startsWith('src/utils/')) {
		return { kind: 'module', scope: 'shared' };
	}
	if (normalized.startsWith('src/core/')) {
		return { kind: 'module', scope: 'core' };
	}
	const domainMatch = normalized.match(/^src\/domains\/([^/]+)\/(types|config|service|ui)\.tsx?$/u);
	if (domainMatch) {
		return {
			kind: 'domain',
			domainName: domainMatch[1],
			layer: domainMatch[2] as DomainLayer,
		};
	}
	const topLevelSupportMatch = normalized.match(
		/^src\/domains\/([^/]+)\/(types|config|service|ui)-[a-z0-9-]+\.tsx?$/u,
	);
	if (topLevelSupportMatch) {
		return {
			kind: 'domain',
			domainName: topLevelSupportMatch[1],
			layer: topLevelSupportMatch[2] as DomainLayer,
		};
	}
	const nestedLayerMatch = normalized.match(
		/^src\/domains\/([^/]+)\/(types|config|service|ui)\/.+\.tsx?$/u,
	);
	if (nestedLayerMatch) {
		return {
			kind: 'domain',
			domainName: nestedLayerMatch[1],
			layer: nestedLayerMatch[2] as DomainLayer,
		};
	}
	const serviceSupportMatch = normalized.match(
		/^src\/domains\/([^/]+)\/(internal|runtime|transport)\/.+\.tsx?$/u,
	);
	if (serviceSupportMatch) {
		return {
			kind: 'domain',
			domainName: serviceSupportMatch[1],
			layer: 'service',
		};
	}
	return { kind: 'unknown' };
}

function dedupeManagedFiles(files: readonly ManagedFile[]): ManagedFile[] {
	const deduped = new Map<string, ManagedFile>();
	for (const file of files) {
		deduped.set(file.relativePath, file);
	}
	return [...deduped.values()];
}

export function printViolations(prefix: string, violations: readonly LintViolation[]): void {
	if (violations.length === 0) {
		process.stdout.write(`${prefix}: 0 violations\n`);
		return;
	}
	for (const violation of violations) {
		const location = violation.line ? `${violation.filePath}:${violation.line}` : violation.filePath;
		process.stderr.write(`[${violation.rule}] ${location}\n`);
		process.stderr.write(`${violation.message}\n`);
	}
	process.stderr.write(`${prefix}: ${violations.length} violations\n`);
}

export function failIfViolations(prefix: string, violations: readonly LintViolation[]): void {
	printViolations(prefix, violations);
	process.exitCode = violations.length === 0 ? 0 : 1;
}

export function isDirectExecution(importMetaUrl: string): boolean {
	const entry = process.argv[1];
	if (!entry) {
		return false;
	}
	return importMetaUrl === pathToFileURL(path.resolve(entry)).href;
}

export function findNodeLine(sourceFile: ts.SourceFile, node: ts.Node): number {
	return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function getLineCount(content: string): number {
	return content.length === 0 ? 0 : content.split(/\r?\n/u).length;
}
