import fs from 'node:fs';
import path from 'node:path';

interface CleanupViolation {
	filePath: string;
	message: string;
}

const REQUIRED_DOC_PATHS = [
	'docs/architecture.md',
	'docs/debugging.md',
	'docs/garbage-collection.md',
	'docs/golden-principles.md',
	'docs/quality-grades.md',
];

const ARCHITECTURE_STALE_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
	{
		pattern: /\bChatServiceOps\b/u,
		message: '架构文档仍引用已删除的 ChatServiceOps，请改成当前真实模块名。',
	},
	{
		pattern: /\bChatServiceCore\b/u,
		message: '架构文档仍引用已删除的 ChatServiceCore，请改成当前真实模块名。',
	},
];

const FORBIDDEN_IMPORT_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
	{
		pattern: /from\s+['"]src\/editor\/chat['"]/u,
		message: '检测到 src/editor/chat 的 folder import，请改成具体文件导入。',
	},
	{
		pattern: /from\s+['"]src\/tools\/sub-agents['"]/u,
		message: '检测到 src/tools/sub-agents 的 folder import，请改成具体文件导入。',
	},
	{
		pattern: /import\(\s*['"]src\/tools\/sub-agents['"]\s*\)/u,
		message: '检测到 src/tools/sub-agents 的动态 folder import，请改成具体文件导入。',
	},
];

function main(): void {
	const violations: CleanupViolation[] = [];
	checkRequiredDocs(violations);
	checkDecisionRecords(violations);
	checkArchitectureDocFreshness(violations);
	checkForbiddenImports(violations);

	if (violations.length === 0) {
		process.stdout.write('cleanup: 0 violations\n');
		return;
	}

	for (const violation of violations) {
		process.stderr.write(`[cleanup] ${violation.filePath}\n`);
		process.stderr.write(`${violation.message}\n`);
	}
	process.stderr.write(`cleanup: ${violations.length} violations\n`);
	process.exitCode = 1;
}

function checkRequiredDocs(violations: CleanupViolation[]): void {
	for (const relativePath of REQUIRED_DOC_PATHS) {
		if (!fs.existsSync(relativePath)) {
			violations.push({
				filePath: relativePath,
				message: '缺少 CLAUDE.md 要求的核心文档文件。',
			});
		}
	}
}

function checkDecisionRecords(violations: CleanupViolation[]): void {
	const decisionsPath = 'docs/decisions';
	if (!fs.existsSync(decisionsPath)) {
		violations.push({
			filePath: decisionsPath,
			message: '缺少 ADR 目录 docs/decisions。',
		});
		return;
	}
	const hasRecord = fs.readdirSync(decisionsPath).some((entry) => entry.endsWith('.md'));
	if (!hasRecord) {
		violations.push({
			filePath: decisionsPath,
			message: 'docs/decisions 目录为空，请至少保留一条 ADR。',
		});
	}
}

function checkArchitectureDocFreshness(violations: CleanupViolation[]): void {
	const architecturePath = 'docs/architecture.md';
	if (!fs.existsSync(architecturePath)) {
		return;
	}
	const content = fs.readFileSync(architecturePath, 'utf8');
	for (const entry of ARCHITECTURE_STALE_PATTERNS) {
		if (entry.pattern.test(content)) {
			violations.push({
				filePath: architecturePath,
				message: entry.message,
			});
		}
	}
}

function checkForbiddenImports(violations: CleanupViolation[]): void {
	for (const filePath of collectSourceFiles('src')) {
		const content = fs.readFileSync(filePath, 'utf8');
		for (const entry of FORBIDDEN_IMPORT_PATTERNS) {
			if (!entry.pattern.test(content)) {
				continue;
			}
			violations.push({
				filePath,
				message: entry.message,
			});
		}
	}
}

function collectSourceFiles(rootPath: string): string[] {
	if (!fs.existsSync(rootPath)) {
		return [];
	}
	const files: string[] = [];
	walkDirectory(rootPath, files);
	return files;
}

function walkDirectory(directoryPath: string, files: string[]): void {
	for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
		const absoluteEntryPath = path.join(directoryPath, entry.name);
		if (entry.isDirectory()) {
			walkDirectory(absoluteEntryPath, files);
			continue;
		}
		if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
			files.push(absoluteEntryPath);
		}
	}
}

main();
