/**
 * @module quick-actions/service-result
 * @description 提供 quick-actions 域内部使用的 Result 构造与兼容异常包装。
 *
 * @dependencies src/domains/quick-actions/types
 * @side-effects 无
 * @invariants 仅承载可预期错误的结构化表达，不处理宿主能力。
 */

import type {
	QuickActionDomainError,
	QuickActionResult,
} from './types';

export class QuickActionCompatibilityError extends Error {
	readonly source: QuickActionDomainError['source'];
	readonly kind: QuickActionDomainError['kind'];

	constructor(readonly domainError: QuickActionDomainError) {
		super(domainError.message);
		this.name = 'QuickActionCompatibilityError';
		this.source = domainError.source;
		this.kind = domainError.kind;
	}
}

export function ok<T>(value: T): QuickActionResult<T, never> {
	return { ok: true, value };
}

export function err<E extends QuickActionDomainError>(
	error: E,
): QuickActionResult<never, E> {
	return { ok: false, error };
}

export function unwrapQuickActionResult<T, E extends QuickActionDomainError>(
	result: QuickActionResult<T, E>,
): T {
	if (!result.ok) {
		throw new QuickActionCompatibilityError(result.error);
	}
	return result.value;
}
