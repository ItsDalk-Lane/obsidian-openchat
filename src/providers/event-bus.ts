/**
 * @module providers/event-bus
 * @description 提供显式、可清理的 typed event bus。
 *
 * @dependencies src/providers/providers.types
 * @side-effects 注册和触发内存态监听器
 * @invariants 不依赖全局单例；clear 后不保留监听器。
 */

import type { EventBus } from './providers.types';

/**
 * @precondition 事件 map 由调用方通过泛型约束描述
 * @postcondition 返回可复用的 typed event bus
 * @throws 从不抛出
 * @example createEventBus<MyEvents>()
 */
export function createEventBus<TEvents extends Record<string, unknown>>(): EventBus<TEvents> {
	const listeners = new Map<keyof TEvents, Set<(payload: unknown) => void>>();
	return {
		emit<TKey extends keyof TEvents>(eventName: TKey, payload: TEvents[TKey]): void {
			const currentListeners = listeners.get(eventName);
			if (!currentListeners) {
				return;
			}
			for (const listener of currentListeners) {
				listener(payload);
			}
		},
		on<TKey extends keyof TEvents>(eventName: TKey, listener: (payload: TEvents[TKey]) => void): () => void {
			const currentListeners = listeners.get(eventName) ?? new Set<(payload: unknown) => void>();
			currentListeners.add(listener as (payload: unknown) => void);
			listeners.set(eventName, currentListeners);
			return () => {
				currentListeners.delete(listener as (payload: unknown) => void);
				if (currentListeners.size === 0) {
					listeners.delete(eventName);
				}
			};
		},
		clear(): void {
			listeners.clear();
		},
	};
}
