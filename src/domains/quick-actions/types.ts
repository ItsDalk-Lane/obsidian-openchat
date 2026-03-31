/**
 * @module quick-actions/types
 * @description 定义 quick-actions 域的核心数据结构与端口契约。
 *
 * @dependencies src/types/chat（纯 shim 共享类型入口）
 * @side-effects 无
 * @invariants 不包含运行时代码，不依赖 UI 或命令层。
 */

export type { QuickAction, QuickActionType } from 'src/types/chat';

// --- 从 service-data.ts 迁入 ---

/** 数据层运行时端口：由宿主注入 AI 数据目录与快捷操作同步能力。 */
export interface QuickActionDataRuntimePort {
	getAiDataFolder(): string;
	syncRuntimeQuickActions(
		quickActions: import('src/types/chat').QuickAction[],
	): void;
}

// --- 从 service-execution.ts 迁入 ---

/** 快捷操作执行结果。 */
export interface QuickActionExecutionResult {
	success: boolean;
	content: string;
	error?: string;
}

export type QuickActionResult<T, E extends QuickActionDomainError> =
	| { ok: true; value: T }
	| { ok: false; error: E };

interface QuickActionDomainErrorBase<
	Source extends 'data' | 'execution',
	Kind extends string,
> {
	readonly source: Source;
	readonly kind: Kind;
	readonly message: string;
}

export type QuickActionDataError =
	| (QuickActionDomainErrorBase<'data', 'invalid-group-target'> & {
		readonly targetGroupId: string;
	})
	| (QuickActionDomainErrorBase<'data', 'self-target'> & {
		readonly quickActionId: string;
	})
	| (QuickActionDomainErrorBase<'data', 'descendant-target'> & {
		readonly quickActionId: string;
		readonly targetGroupId: string;
	})
	| (QuickActionDomainErrorBase<'data', 'max-depth-exceeded'> & {
		readonly quickActionId: string;
		readonly targetGroupId: string | null;
	})
	| (QuickActionDomainErrorBase<'data', 'cycle-detected'> & {
		readonly groupId: string;
		readonly childId: string;
	})
	| (QuickActionDomainErrorBase<'data', 'storage-folder-missing'> & {
		readonly aiDataFolder: string;
	});

export type QuickActionExecutionError =
	| (QuickActionDomainErrorBase<'execution', 'group-not-executable'> & {
		readonly quickActionId: string;
	})
	| (QuickActionDomainErrorBase<'execution', 'missing-model-config'> & {
		readonly requestedModelTag?: string;
	})
	| (QuickActionDomainErrorBase<'execution', 'provider-missing'> & {
		readonly vendor: string;
	})
	| (QuickActionDomainErrorBase<'execution', 'template-read-failed'> & {
		readonly path: string;
	});

export type QuickActionDomainError =
	| QuickActionDataError
	| QuickActionExecutionError;

// --- 执行端口：隔离 service-execution.ts 对宿主 provider 装配的依赖 ---

/** 快捷操作使用的消息结构（只需 role + content）。 */
export interface QuickActionMessage {
	readonly role: 'system' | 'user';
	readonly content: string;
}

/** 快捷操作使用的 provider 配置视图（只映射实际访问的字段）。 */
export interface QuickActionProviderConfig {
	readonly tag: string;
	readonly vendor: string;
	readonly options: Record<string, unknown>;
}

/** 快捷操作使用的运行时设置视图（只需 providers 列表）。 */
export interface QuickActionRuntimeSettings {
	readonly defaultModel: string;
	readonly providers: readonly QuickActionProviderConfig[];
	readonly quickActionsSystemPrompt?: string;
}

/** 请求发送函数签名。 */
export type QuickActionSendRequest = (
	messages: readonly QuickActionMessage[],
	controller: AbortController,
	resolveEmbed: () => Promise<ArrayBuffer>,
) => AsyncGenerator<string, void, unknown>;

/**
 * 执行端口：封装 vendor 查找、options 构建与请求发送。
 * 实现方从域内 vendor registry 与 provider option helper
 * 获取真实能力后注入 QuickActionExecutionService。
 */
export interface QuickActionProviderAdapter {
	/**
	 * 根据 vendor 名称和选项创建请求发送函数。
	 * 内部处理 vendor 查找、reasoning 禁用等逻辑。
	 * 返回 null 表示 vendor 不存在。
	 */
	createSendRequest(
		vendorName: string,
		options: Record<string, unknown>,
	): QuickActionSendRequest | null;
}

// --- 从 service-data-utils.ts 迁入 ---

/** 从 Markdown frontmatter 解析出的原始快捷操作记录（字段均可选）。 */
export interface RawQuickAction
	extends Partial<import('src/types/chat').QuickAction> {
	skillType?: import('src/types/chat').QuickActionType;
	isSkillGroup?: boolean;
}

/** YAML 解析器签名。 */
export type QuickActionYamlParser = (content: string) => unknown;

/** YAML 序列化器签名。 */
export type QuickActionYamlStringifier = (content: unknown) => string;
