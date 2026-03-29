import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { normalizePath } from './shared';

export function getImportSpecifiers(sourceFile: ts.SourceFile): Array<{
	specifier: string;
	line: number;
	isTypeOnly: boolean;
}> {
	const specifiers: Array<{ specifier: string; line: number; isTypeOnly: boolean }> = [];
	const visit = (node: ts.Node): void => {
		if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
			const text = node.moduleSpecifier.getText(sourceFile).slice(1, -1);
			const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
			const isTypeOnly = ts.isImportDeclaration(node)
				? Boolean(node.importClause?.isTypeOnly)
				: Boolean(node.isTypeOnly);
			specifiers.push({ specifier: text, line, isTypeOnly });
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

export function resolveFolderImportTarget(
	fromFile: string,
	importSpecifier: string,
	knownFiles?: ReadonlySet<string>,
): string | null {
	const normalizedSpecifier = normalizePath(importSpecifier);
	if (
		(!normalizedSpecifier.startsWith('.')
			&& !normalizedSpecifier.startsWith('src/'))
		|| normalizedSpecifier === 'obsidian'
	) {
		return null;
	}
	if (
		normalizedSpecifier.endsWith('/index')
		|| normalizedSpecifier.endsWith('/index.ts')
		|| normalizedSpecifier.endsWith('/index.tsx')
	) {
		return null;
	}
	const basePath = normalizedSpecifier.startsWith('src/')
		? normalizedSpecifier
		: path.posix.normalize(
			path.posix.join(path.posix.dirname(normalizePath(fromFile)), normalizedSpecifier),
		);
	const directCandidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`];
	if (directCandidates.some((candidate) => fileExists(candidate, knownFiles))) {
		return null;
	}
	const indexCandidates = [`${basePath}/index.ts`, `${basePath}/index.tsx`];
	return indexCandidates.find((candidate) => fileExists(candidate, knownFiles)) ?? null;
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

function fileExists(relativePath: string, knownFiles?: ReadonlySet<string>): boolean {
	return Boolean(knownFiles?.has(relativePath)) || fs.existsSync(path.join(process.cwd(), relativePath));
}
