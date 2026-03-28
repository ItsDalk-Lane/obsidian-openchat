import type { LintViolation, ManagedFile } from './shared';
import {
	type DomainLayer,
	classifyManagedFile,
	collectManagedFiles,
	failIfViolations,
	getImportSpecifiers,
	isDirectExecution,
	resolveWorkspaceImport,
} from './shared';

const ALLOWED_DOMAIN_LAYER_IMPORTS: Record<DomainLayer, ReadonlySet<DomainLayer>> = {
	types: new Set(['types']),
	config: new Set(['types', 'config']),
	service: new Set(['types', 'config', 'service']),
	ui: new Set(['types', 'config', 'service', 'ui']),
};

const PROVIDER_ALLOWED_LAYERS = new Set<DomainLayer>(['service', 'ui']);
const PROVIDER_CONTRACT_PATH = 'src/providers/providers.types.ts';
const OBSIDIAN_PROVIDER_PATH = 'src/providers/obsidian-api.ts';

export function lintArchitecture(workspaceRoot: string): LintViolation[] {
	const files = collectManagedFiles(workspaceRoot);
	return lintArchitectureFiles(files);
}

export function lintArchitectureFiles(files: readonly ManagedFile[]): LintViolation[] {
	const violations: LintViolation[] = [];
	for (const file of files) {
		for (const imported of getImportSpecifiers(file.sourceFile)) {
			const resolved = resolveWorkspaceImport(file.relativePath, imported.specifier);
			if (file.category.kind === 'domain') {
				lintDomainImport(file, imported.line, resolved, violations);
				continue;
			}
			if (file.category.kind === 'provider') {
				lintProviderImport(file, imported.line, resolved, violations);
			}
		}
	}
	return violations;
}

function lintDomainImport(
	file: ManagedFile & { category: Extract<ManagedFile['category'], { kind: 'domain' }> },
	line: number,
	resolved: string | null,
	violations: LintViolation[],
): void {
	if (resolved === 'obsidian') {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/no-direct-obsidian',
			message:
				'域代码不能直接导入 obsidian。\n修复方法：\n1. 将 Notice、Vault、Workspace 等调用收敛到 src/providers/obsidian-api.ts。\n2. 通过 provider 注入最小接口，而不是把 App 或 Plugin 继续向下透传。',
		});
		return;
	}
	if (!resolved) {
		return;
	}
	const importedCategory = classifyManagedFile(resolved);
	if (importedCategory.kind === 'provider') {
		if (!PROVIDER_ALLOWED_LAYERS.has(file.category.layer)) {
			violations.push({
				filePath: file.relativePath,
				line,
				rule: 'arch/provider-layer-boundary',
				message:
					`依赖方向错误：${file.category.layer} 层不能直接导入 providers。\n修复方法：\n1. 若当前文件是类型定义，请把 provider 相关契约下沉到调用方。\n2. 若当前文件是配置默认值，请把宿主能力延后到 service 或 ui 层注入。`,
			});
			return;
		}
		if (resolved !== PROVIDER_CONTRACT_PATH) {
			violations.push({
				filePath: file.relativePath,
				line,
				rule: 'arch/provider-contract-only',
				message:
					'域层只能依赖 provider 契约，不能直接导入 provider 实现。\n修复方法：\n1. 从 src/providers/providers.types.ts 导入接口类型。\n2. 在 src/main.ts、src/core/FeatureCoordinator.ts 或命令层组合根中创建 provider 实例后再注入域层。',
			});
		}
		return;
	}
	if (importedCategory.kind === 'domain') {
		if (importedCategory.domainName !== file.category.domainName) {
			violations.push({
				filePath: file.relativePath,
				line,
				rule: 'arch/no-cross-domain-import',
				message:
					`禁止从域 ${file.category.domainName} 直接导入域 ${importedCategory.domainName}。\n修复方法：\n1. 若共享的是数据结构，将稳定接口提取到 src/providers/。\n2. 若共享的是行为，改为通过 providers/event-bus.ts 发布事件。\n3. 参考 docs/architecture.md 中的“跨域关注点：Providers”。`,
			});
			return;
		}
		if (!ALLOWED_DOMAIN_LAYER_IMPORTS[file.category.layer].has(importedCategory.layer)) {
			violations.push({
				filePath: file.relativePath,
				line,
				rule: 'arch/layer-direction',
				message:
					`依赖方向错误：${file.category.layer} 层不能导入 ${importedCategory.layer} 层。\n修复方法：\n1. 将共享类型下沉到 types.ts。\n2. 将默认值与 schema 下沉到 config.ts。\n3. 将只给 UI 使用的行为保留在 ui.ts，不要反向拉回 service.ts。`,
			});
		}
		return;
	}
	if (resolved.startsWith('src/commands/') || resolved.startsWith('infra/')) {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/domain-boundary',
			message:
				'域内部不应依赖命令层或 infra。\n修复方法：\n1. 把运行时参数收敛为 provider 或适配器接口。\n2. 让命令层消费域，而不是让域反向依赖命令层。',
		});
	}
}

function lintProviderImport(
	file: ManagedFile & { category: Extract<ManagedFile['category'], { kind: 'provider' }> },
	line: number,
	resolved: string | null,
	violations: LintViolation[],
): void {
	if (resolved === 'obsidian') {
		if (file.relativePath !== OBSIDIAN_PROVIDER_PATH) {
			violations.push({
				filePath: file.relativePath,
				line,
				rule: 'arch/provider-obsidian-boundary',
				message:
					'只有 src/providers/obsidian-api.ts 可以直接导入 obsidian。\n修复方法：\n1. 其他 provider 若需要宿主能力，请通过 obsidian-api provider 或调用方注入最小接口。\n2. 保持 providers/settings.ts 与 providers/event-bus.ts 为宿主无关实现。',
			});
		}
		return;
	}
	if (!resolved) {
		return;
	}
	const importedCategory = classifyManagedFile(resolved);
	if (file.category.role === 'contract') {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/provider-contract-dependency',
			message:
				'providers.types.ts 必须保持零本地依赖。\n修复方法：\n1. 仅在该文件中声明稳定接口与数据结构。\n2. 将实现细节移动到具体 provider 文件。',
		});
		return;
	}
	if (
		importedCategory.kind === 'provider'
		&& importedCategory.role === 'implementation'
		&& importedCategory.moduleName !== file.category.moduleName
	) {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/provider-no-implementation-coupling',
			message:
				'provider 实现之间不能直接耦合。\n修复方法：\n1. 共享契约请放到 src/providers/providers.types.ts。\n2. 共享宿主能力请在组合根中分别创建后注入。',
		});
		return;
	}
	if (
		importedCategory.kind === 'domain'
		|| importedCategory.kind === 'consumer'
		|| resolved === 'src/main.ts'
		|| resolved.startsWith('src/commands/')
		|| resolved.startsWith('src/core/')
		|| resolved.startsWith('infra/')
	) {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/provider-reverse-dependency',
			message:
				'provider 不得反向依赖 domains、core、commands 或 infra。\n修复方法：\n1. 将业务相关决策留在组合根。\n2. 让 provider 只暴露宿主能力，不感知具体业务域。',
		});
	}
}

if (isDirectExecution(import.meta.url)) {
	failIfViolations('lint:arch', lintArchitecture(process.cwd()));
}
