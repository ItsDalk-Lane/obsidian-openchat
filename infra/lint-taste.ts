import ts from 'typescript';
import type { LintViolation, ManagedFile } from './shared';
import {
	collectManagedFiles,
	failIfViolations,
	findNodeLine,
	getLineCount,
	isDirectExecution,
} from './shared';
import { getImportSpecifiers, resolveFolderImportTarget } from './import-helpers';

const FILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/u;
const PASCAL_CASE_PATTERN = /^[A-Z][A-Za-z0-9]*$/u;
const CAMEL_CASE_PATTERN = /^[a-z][A-Za-z0-9]*$/u;
const SIDE_EFFECT_VERBS = /^(save|mutate|register|delete|create|update|emit|dispatch|dispose|cancel|ensure|build|run|initialize|open|close|refresh|sync|handle|trigger|start|stop|connect|disconnect|confirm|resolve|send|report|wait|schedule|request|cleanup|load|notify|show|execute|generate|regenerate|edit|toggle|insert|retry|attach|restore|select|queue|flush|clear|prepare|onload|on[A-Z])/u;
const SIDE_EFFECT_CALLS = /(dispatch\(|abort\(|setTimeout\(|clearTimeout\(|notify\(|emit\(|register[A-Z]|open\(|close\(|writeFile\(|readFile\()/u;
const MAX_FILE_LINES = 500;
const ALLOWED_CONSOLE_FILES = new Set(['src/utils/DebugLogger.ts']);

export function lintTaste(workspaceRoot: string): LintViolation[] {
	const files = collectManagedFiles(workspaceRoot);
	return lintTasteFiles(files);
}

export function lintTasteFiles(files: readonly ManagedFile[]): LintViolation[] {
	const violations: LintViolation[] = [];
	const knownFiles = new Set(files.map((file) => file.relativePath));
	for (const file of files) {
		collectFileLevelViolations(file, knownFiles, violations);
		collectSyntaxViolations(file, violations);
	}
	return violations;
}

function collectFileLevelViolations(
	file: ManagedFile,
	knownFiles: ReadonlySet<string>,
	violations: LintViolation[],
): void {
	const lineCount = getLineCount(file.content);
	if (lineCount > MAX_FILE_LINES) {
		violations.push({
			filePath: file.relativePath,
			rule: 'taste/max-lines',
			message:
				`文件当前为 ${lineCount} 行，超过 ${MAX_FILE_LINES} 行上限。\n修复方法：\n1. 按子功能拆分到同一 domain 目录。\n2. 把纯类型和默认配置下沉到 types.ts / config.ts。`,
		});
	}
	const baseName = file.relativePath.split('/').pop()?.replace(/\.(ts|tsx)$/u, '') ?? '';
	if (shouldEnforceStructuredNaming(file) && !FILE_NAME_PATTERN.test(baseName)) {
		violations.push({
			filePath: file.relativePath,
			rule: 'taste/file-name',
			message:
				`文件名 ${baseName} 不符合 kebab-case。\n修复方法：\n1. 使用全小写。\n2. 需要分词时用连字符，例如 editor-state.ts。`,
		});
	}
	if (
		file.category.kind !== 'shim'
		&& (
			/^\s*export\s+(?:\*|\{[^}]+\})\s+from\s+/mu.test(file.content)
			|| file.relativePath.endsWith('/index.ts')
		)
	) {
		violations.push({
			filePath: file.relativePath,
			rule: 'taste/no-barrel-export',
			message:
				'禁止 barrel export。\n修复方法：\n1. 直接从具体文件导入。\n2. 对外入口请使用明确命名文件，而不是 index.ts 聚合导出。',
		});
	}
	for (const imported of getImportSpecifiers(file.sourceFile)) {
		if (!resolveFolderImportTarget(file.relativePath, imported.specifier, knownFiles)) {
			continue;
		}
		violations.push({
			filePath: file.relativePath,
			line: imported.line,
			rule: 'taste/no-folder-import',
			message:
				'禁止通过文件夹路径导入 index.ts barrel。\n修复方法：\n1. 直接从具体文件导入。\n2. 若需要稳定入口，请使用具名文件，而不是目录默认入口。',
		});
	}
}

function collectSyntaxViolations(file: ManagedFile, violations: LintViolation[]): void {
	const sourceFile = file.sourceFile;
	const visit = (node: ts.Node): void => {
		if (shouldEnforceStructuredNaming(file)) {
			collectNamingViolations(file, sourceFile, node, violations);
		}
		if (ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isPropertySignature(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
			const nodeText = node.getText(sourceFile);
			if (/(^|\W)any(\W|$)/u.test(nodeText) && /(:\s*any\b|as\s+any\b|<\s*any\s*>)/u.test(nodeText)) {
				violations.push({
					filePath: file.relativePath,
					line: findNodeLine(sourceFile, node),
					rule: 'taste/no-any',
					message:
						'检测到显式 any。\n修复方法：\n1. 优先使用 unknown。\n2. 在靠近边界的位置添加类型守卫或判别联合。',
				});
			}
		}
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
			const target = node.expression.expression.getText(sourceFile);
			const method = node.expression.name.getText(sourceFile);
			if (
				target === 'console'
				&& ['log', 'info', 'warn', 'error'].includes(method)
				&& !ALLOWED_CONSOLE_FILES.has(file.relativePath)
			) {
				violations.push({
					filePath: file.relativePath,
					line: findNodeLine(sourceFile, node),
					rule: 'taste/no-console',
					message:
						'禁止直接使用 console。\n修复方法：\n1. 调试日志改用 DebugLogger。\n2. 面向用户的反馈改用 Notice 或 provider 通知接口。',
				});
			}
		}
		if (shouldEnforceStructuredNaming(file) && isNamedFunctionLike(node) && node.body) {
			const functionName = getFunctionLikeName(node, sourceFile);
			const bodyText = node.body.getText(sourceFile);
			if (!SIDE_EFFECT_VERBS.test(functionName) && SIDE_EFFECT_CALLS.test(bodyText)) {
				violations.push({
					filePath: file.relativePath,
					line: findNodeLine(sourceFile, node),
					rule: 'taste/side-effect-name',
					message:
						`函数 ${functionName} 含有副作用，但命名没有体现动作。\n修复方法：\n1. 使用 save/mutate/register/delete/create/update 等动词前缀。\n2. 若函数应保持纯逻辑，请把副作用调用移到调用方。`,
				});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
}

function shouldEnforceStructuredNaming(file: ManagedFile): boolean {
	return file.category.kind === 'infra'
		|| file.category.kind === 'provider'
		|| file.category.kind === 'domain'
		|| file.category.kind === 'chat';
}

function collectNamingViolations(
	file: ManagedFile,
	sourceFile: ts.SourceFile,
	node: ts.Node,
	violations: LintViolation[],
): void {
	if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
		pushNameViolation(file, sourceFile, node.name, 'taste/type-name', '类型、接口和枚举', PASCAL_CASE_PATTERN, 'PascalCase，例如 EditorContext。', violations);
		return;
	}
	if (ts.isClassDeclaration(node) && node.name) {
		pushNameViolation(file, sourceFile, node.name, 'taste/class-name', '类', PASCAL_CASE_PATTERN, 'PascalCase，例如 SettingsDomainService。', violations);
		return;
	}
	if (ts.isFunctionDeclaration(node) && node.name) {
		pushNameViolation(file, sourceFile, node.name, 'taste/function-name', '函数', CAMEL_CASE_PATTERN, 'camelCase，例如 buildEditorContext。', violations);
		return;
	}
	if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
		pushNameViolation(file, sourceFile, node.name, 'taste/function-name', '方法', CAMEL_CASE_PATTERN, 'camelCase，例如 refreshSkills。', violations);
		return;
	}
	if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isFunctionInitializer(node.initializer)) {
		pushNameViolation(file, sourceFile, node.name, 'taste/function-name', '函数变量', CAMEL_CASE_PATTERN, 'camelCase，例如 resolveToolExecutionSettings。', violations);
	}
}

function pushNameViolation(
	file: ManagedFile,
	sourceFile: ts.SourceFile,
	nameNode: ts.Identifier,
	rule: string,
	label: string,
	pattern: RegExp,
	example: string,
	violations: LintViolation[],
): void {
	const name = nameNode.getText(sourceFile);
	if (pattern.test(name)) {
		return;
	}
	violations.push({
		filePath: file.relativePath,
		line: findNodeLine(sourceFile, nameNode),
		rule,
		message:
			`${label}命名 ${name} 不符合规范。\n修复方法：\n1. ${example}\n2. 避免使用缩写、全大写或含连字符的标识符。`,
	});
}

function isFunctionInitializer(node: ts.Expression | undefined): node is ts.ArrowFunction | ts.FunctionExpression {
	return Boolean(node) && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function isNamedFunctionLike(node: ts.Node): node is ts.FunctionDeclaration | ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction {
	return ts.isFunctionDeclaration(node)
		|| ts.isMethodDeclaration(node)
		|| (ts.isFunctionExpression(node) && ts.isVariableDeclaration(node.parent))
		|| (ts.isArrowFunction(node) && ts.isVariableDeclaration(node.parent));
}

function getFunctionLikeName(
	node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.FunctionExpression | ts.ArrowFunction,
	sourceFile: ts.SourceFile,
): string {
	if (ts.isFunctionDeclaration(node) && node.name) {
		return node.name.getText(sourceFile);
	}
	if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
		return node.name.getText(sourceFile);
	}
	if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
		return node.parent.name.getText(sourceFile);
	}
	return 'anonymousFunction';
}

if (isDirectExecution(import.meta.url)) {
	failIfViolations('lint:taste', lintTaste(process.cwd()));
}
