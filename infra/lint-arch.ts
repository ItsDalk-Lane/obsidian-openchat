import ts from 'typescript';
import type { LintViolation, ManagedFile } from './shared';
import {
	type DomainLayer,
	classifyManagedFile,
	collectManagedFiles,
	failIfViolations,
	isDirectExecution,
} from './shared';
import { getImportSpecifiers, resolveWorkspaceImport } from './import-helpers';
import { lintGlobalHostUsage } from './lint-arch-support';

const ALLOWED_DOMAIN_LAYER_IMPORTS: Record<DomainLayer, ReadonlySet<DomainLayer>> = {
	types: new Set(['types']),
	config: new Set(['types', 'config']),
	service: new Set(['types', 'config', 'service']),
	ui: new Set(['types', 'config', 'service', 'ui']),
};

const PROVIDER_ALLOWED_LAYERS = new Set<DomainLayer>(['service', 'ui']);
const PROVIDER_CONTRACT_PATH = 'src/providers/providers.types.ts';
const OBSIDIAN_PROVIDER_PATH = 'src/providers/obsidian-api.ts';
const PLUGIN_ENTRY_PATH = 'src/main.ts';
const ALLOWED_PLUGIN_IMPORTERS = new Set(['src/core/FeatureCoordinator.ts']);

export function lintArchitecture(workspaceRoot: string): LintViolation[] {
	return lintArchitectureFiles(collectManagedFiles(workspaceRoot));
}

export function lintArchitectureFiles(files: readonly ManagedFile[]): LintViolation[] {
	const violations: LintViolation[] = [];
	for (const file of files) {
		for (const imported of getImportSpecifiers(file.sourceFile)) {
			const resolved = resolveWorkspaceImport(file.relativePath, imported.specifier);
			if (
				resolved === PLUGIN_ENTRY_PATH
				&& file.relativePath !== PLUGIN_ENTRY_PATH
				&& !ALLOWED_PLUGIN_IMPORTERS.has(file.relativePath)
			) {
				violations.push({
					filePath: file.relativePath,
					line: imported.line,
					rule: 'arch/no-plugin-leak',
					message:
						'禁止在组合根之外直接导入 OpenChatPlugin。\n修复方法：\n1. 让 src/core/FeatureCoordinator.ts 创建最小 host adapter。\n2. 向下游传递接口而不是 Plugin 实例。',
				});
				continue;
			}
			if (file.category.kind === 'domain') {
				lintDomainImport(file, imported.line, resolved, imported.isTypeOnly, violations);
				continue;
			}
			if (file.category.kind === 'chat') {
				lintChatImport(file, imported.line, resolved, imported.isTypeOnly, violations);
				continue;
			}
			if (file.category.kind === 'provider') {
				lintProviderImport(file, imported.line, resolved, imported.isTypeOnly, violations);
				continue;
			}
			if (file.category.kind === 'module') {
				lintModuleImport(file, imported.line, resolved, imported.isTypeOnly, violations);
			}
		}
		if (file.category.kind === 'shim') {
			lintShimStructure(file, violations);
		}
		lintGlobalHostUsage(file, violations);
	}
	return violations;
}

function lintDomainImport(
	file: ManagedFile & { category: Extract<ManagedFile['category'], { kind: 'domain' }> },
	line: number,
	resolved: string | null,
	isTypeOnly: boolean,
	violations: LintViolation[],
): void {
	if (resolved === 'obsidian' && !isTypeOnly) {
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
	if (resolved.startsWith('src/core/') || resolved.startsWith('src/components/')) {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/domain-no-core-component',
			message:
				'域层不能直接导入 src/core/ 或 src/components/。\n修复方法：\n1. 在域内定义 Port 接口，通过构造参数注入。\n2. 在 FeatureCoordinator 或命令层组合根中提供适配器。',
		});
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
	// 已知 shim 豁免：settings 域 types 层对 src/settings/ 和 src/types/ 的 type-only 导入。
	// 当前因 AiRuntimeSettings / ChatSettings 仍定义在 legacy 全局模块而必须保留。
	// 迁移计划：docs/plans/migrate-legacy-types.md
	// 补强规则时请勿对上述路径产生误报。
}

function lintChatImport(
	file: ManagedFile & { category: Extract<ManagedFile['category'], { kind: 'chat' }> },
	line: number,
	resolved: string | null,
	isTypeOnly: boolean,
	violations: LintViolation[],
): void {
	if (resolved === 'obsidian') {
		if (file.category.role === 'service' && !isTypeOnly) {
			violations.push({
				filePath: file.relativePath,
				line,
				rule: 'arch/chat-no-direct-obsidian',
				message:
					'chat service/helper 不能直接导入 obsidian。\n修复方法：\n1. 宿主能力收敛到 src/providers/obsidian-api.ts。\n2. 若只是类型，请改为 type-only import；若是行为，请通过 provider 或 consumer 壳层注入。',
			});
		}
		return;
	}
	if (!resolved) {
		return;
	}
	const importedCategory = classifyManagedFile(resolved);
	if (
		file.category.role === 'service'
		&& (
			resolved.startsWith('src/components/')
			|| resolved.startsWith('src/editor/')
			|| resolved.startsWith('src/commands/')
			|| (importedCategory.kind === 'chat' && importedCategory.role === 'consumer')
		)
	) {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/chat-service-boundary',
			message:
				'chat service/helper 不得反向依赖 commands、components、editor 或 chat 组合根 consumer。\n修复方法：\n1. 将宿主/UI 交互保留在 ChatFeatureManager、ChatViewCoordinator 等 consumer 壳层。\n2. service 只依赖 provider、domain pure helper 与同层 service 协作者。',
		});
		return;
	}
	if (
		file.category.role === 'service'
		&& importedCategory.kind === 'provider'
		&& resolved !== PROVIDER_CONTRACT_PATH
	) {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/chat-provider-contract-only',
			message:
				'chat service/helper 只能依赖 provider 契约，不能直接导入 provider 实现。\n修复方法：\n1. 从 src/providers/providers.types.ts 导入接口类型。\n2. 在 FeatureCoordinator 或 ChatFeatureManager 中创建 provider 后注入。',
		});
	}
}

function lintProviderImport(
	file: ManagedFile & { category: Extract<ManagedFile['category'], { kind: 'provider' }> },
	line: number,
	resolved: string | null,
	isTypeOnly: boolean,
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
		|| (importedCategory.kind === 'module' && importedCategory.scope !== 'root')
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

function lintModuleImport(
	file: ManagedFile & { category: Extract<ManagedFile['category'], { kind: 'module' }> },
	line: number,
	resolved: string | null,
	_isTypeOnly: boolean,
	violations: LintViolation[],
): void {
	if (!resolved || resolved === 'obsidian') {
		return;
	}

	const importedCategory = classifyManagedFile(resolved);
	if (
		file.category.scope === 'runtime-adapter'
		&& (
			resolved.startsWith('src/commands/')
			|| resolved.startsWith('src/components/')
			|| (importedCategory.kind === 'domain' && importedCategory.layer === 'ui')
		)
	) {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/runtime-adapter-boundary',
			message:
				'LLMProviders 只能依赖共享类型、纯工具和服务契约，不能反向依赖命令层或业务 UI。\n修复方法：\n1. 把 UI 相关拼装移动到 commands/components。\n2. 把共享数据结构下沉到 types 或 provider 契约。',
		});
		return;
	}

	if (
		file.category.scope === 'tool'
		&& (
			resolved.startsWith('src/commands/')
			|| resolved.startsWith('src/components/')
			|| (importedCategory.kind === 'domain' && importedCategory.layer === 'ui')
		)
	) {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/tool-boundary',
			message:
				'tools 目录不应依赖具体命令层或业务 UI。\n修复方法：\n1. 将输入/输出参数收敛为纯数据。\n2. 把 UI 与宿主交互放在调用 tools 的上层壳文件。',
		});
		return;
	}

	if (
		file.category.scope === 'component'
		&& importedCategory.kind === 'module'
		&& importedCategory.scope === 'command'
	) {
		violations.push({
			filePath: file.relativePath,
			line,
			rule: 'arch/component-command-boundary',
			message:
				'共享组件不应直接依赖命令壳层。\n修复方法：\n1. 由上层把回调和状态注入组件。\n2. 把命令注册与宿主交互留在 commands/ 目录。',
		});
	}
}

function lintShimStructure(
	file: ManagedFile & { category: Extract<ManagedFile['category'], { kind: 'shim' }> },
	violations: LintViolation[],
): void {
	for (const statement of file.sourceFile.statements) {
		const isAllowed = ts.isImportDeclaration(statement)
			|| ts.isExportDeclaration(statement)
			|| ts.isTypeAliasDeclaration(statement)
			|| ts.isInterfaceDeclaration(statement);
		if (isAllowed) {
			continue;
		}
		violations.push({
			filePath: file.relativePath,
			line: file.sourceFile.getLineAndCharacterOfPosition(statement.getStart(file.sourceFile)).line + 1,
			rule: 'arch/shim-only-reexport',
			message:
				'兼容 shim 只能保留 import/export/type alias，不能承载业务逻辑。\n修复方法：\n1. 把真实实现迁到 domains/、commands/ 或 settings/ 新文件。\n2. 旧路径只保留转发出口。',
		});
		break;
	}
}

if (isDirectExecution(import.meta.url)) {
	failIfViolations('lint:arch', lintArchitecture(process.cwd()));
}
