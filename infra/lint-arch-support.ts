import ts from 'typescript';
import type { LintViolation, ManagedFile } from './shared';

const OBSIDIAN_PROVIDER_PATH = 'src/providers/obsidian-api.ts';

export function lintGlobalHostUsage(file: ManagedFile, violations: LintViolation[]): void {
	const shouldLint =
		(file.category.kind === 'provider' && file.relativePath !== OBSIDIAN_PROVIDER_PATH)
		|| (file.category.kind === 'chat' && file.category.role === 'service');
	if (!shouldLint) {
		return;
	}
	const declaredNames = collectDeclaredNames(file.sourceFile);
	const visit = (node: ts.Node): void => {
		if (
			(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
			&& ts.isIdentifier(node.expression)
			&& (node.expression.text === 'window' || node.expression.text === 'document')
			&& !declaredNames.has(node.expression.text)
		) {
			violations.push({
				filePath: file.relativePath,
				line:
					node.expression.getSourceFile().getLineAndCharacterOfPosition(
						node.expression.getStart(node.expression.getSourceFile()),
					).line + 1,
				rule: 'arch/no-global-host-access',
				message:
					'禁止在未授权位置直接访问 window/document。\n修复方法：\n1. provider 实现请通过 src/providers/obsidian-api.ts 或调用方注入宿主能力。\n2. chat service 请改为依赖 host adapter、provider 或标准全局 API 包装。',
			});
		}
		ts.forEachChild(node, visit);
	};
	visit(file.sourceFile);
}

function collectDeclaredNames(sourceFile: ts.SourceFile): Set<string> {
	const names = new Set<string>();
	const visit = (node: ts.Node): void => {
		if (
			(ts.isVariableDeclaration(node) || ts.isParameter(node))
			&& ts.isIdentifier(node.name)
		) {
			names.add(node.name.text);
		}
		if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
			names.add(node.name.text);
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return names;
}
