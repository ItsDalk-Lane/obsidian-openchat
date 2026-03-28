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

export type ManagedFileCategory =
	| { kind: 'infra' }
	| { kind: 'provider'; role: ProviderRole; moduleName: string }
	| { kind: 'consumer' }
	| { kind: 'domain'; domainName: string; layer: DomainLayer }
	| { kind: 'unknown' };

export interface LintViolation {
	filePath: string;
	message: string;
	line?: number;
	rule: string;
}

const MANAGED_ROOTS = ['infra', 'src/providers', 'src/domains'];
const MANAGED_EXPLICIT_FILES = [
	'src/main.ts',
	'src/core/FeatureCoordinator.ts',
	'src/commands/ai-runtime/AiRuntimeCommandManager.ts',
];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

export const DOMAIN_LAYER_ORDER: Record<DomainLayer, number> = {
	types: 0,
	config: 1,
	service: 2,
	ui: 3,
};

export function normalizePath(value: string): string {
	return value.replace(/\\/g, '/');
}

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
	for (const explicitFile of MANAGED_EXPLICIT_FILES) {
		const absoluteFile = path.join(workspaceRoot, explicitFile);
		if (!fs.existsSync(absoluteFile)) {
			continue;
		}
		files.push(readManagedFile(workspaceRoot, absoluteFile));
	}
	return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
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
	if (
		normalized === 'src/main.ts'
		|| normalized === 'src/core/FeatureCoordinator.ts'
		|| normalized === 'src/commands/ai-runtime/AiRuntimeCommandManager.ts'
	) {
		return { kind: 'consumer' };
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

export function getImportSpecifiers(sourceFile: ts.SourceFile): Array<{ specifier: string; line: number }> {
	const specifiers: Array<{ specifier: string; line: number }> = [];
	const visit = (node: ts.Node): void => {
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
			const text = node.moduleSpecifier.getText(sourceFile).slice(1, -1);
			const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
			specifiers.push({ specifier: text, line });
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return specifiers;
}

export function resolveWorkspaceImport(fromFile: string, importSpecifier: string): string | null {
	if (importSpecifier === 'obsidian') {
		return 'obsidian';
	}
	if (importSpecifier.startsWith('src/')) {
		return resolveImportCandidate(importSpecifier);
	}
	if (!importSpecifier.startsWith('.')) {
		return null;
	}
	const baseDirectory = path.posix.dirname(normalizePath(fromFile));
	const candidates = buildImportCandidates(path.posix.normalize(path.posix.join(baseDirectory, importSpecifier)));
	for (const candidate of candidates) {
		if (candidate.endsWith('.ts') || candidate.endsWith('.tsx')) {
			return normalizePath(candidate);
		}
	}
	return null;
}

function resolveImportCandidate(importSpecifier: string): string | null {
	const candidates = buildImportCandidates(normalizePath(importSpecifier));
	for (const candidate of candidates) {
		if (candidate.endsWith('.ts') || candidate.endsWith('.tsx')) {
			return normalizePath(candidate);
		}
	}
	return null;
}

function buildImportCandidates(basePath: string): string[] {
	return [
		basePath,
		`${basePath}.ts`,
		`${basePath}.tsx`,
		`${basePath}/index.ts`,
		`${basePath}/index.tsx`,
	].map((candidate) => path.posix.normalize(candidate));
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
	if (content.length === 0) {
		return 0;
	}
	return content.split(/\r?\n/u).length;
}
