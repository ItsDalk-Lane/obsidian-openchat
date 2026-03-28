import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from './event-bus';

test('EventBus 会按注册顺序广播给同一事件的多个监听器', () => {
	type Events = {
		'refresh': { count: number };
	};
	const bus = createEventBus<Events>();
	const calls: string[] = [];
	bus.on('refresh', (payload) => {
		calls.push(`first:${payload.count}`);
	});
	bus.on('refresh', (payload) => {
		calls.push(`second:${payload.count}`);
	});
	bus.emit('refresh', { count: 2 });
	assert.deepEqual(calls, ['first:2', 'second:2']);
});

test('EventBus 取消订阅后不再触发监听器，重复清理也安全', () => {
	type Events = {
		'refresh': { count: number };
	};
	const bus = createEventBus<Events>();
	let callCount = 0;
	const unsubscribe = bus.on('refresh', () => {
		callCount += 1;
	});
	bus.emit('refresh', { count: 1 });
	unsubscribe();
	unsubscribe();
	bus.emit('refresh', { count: 2 });
	assert.equal(callCount, 1);
});

test('EventBus clear 会移除所有事件监听器', () => {
	type Events = {
		refresh: { count: number };
		flush: { ok: boolean };
	};
	const bus = createEventBus<Events>();
	let refreshCalls = 0;
	let flushCalls = 0;
	bus.on('refresh', () => {
		refreshCalls += 1;
	});
	bus.on('flush', () => {
		flushCalls += 1;
	});
	bus.clear();
	bus.emit('refresh', { count: 1 });
	bus.emit('flush', { ok: true });
	assert.equal(refreshCalls, 0);
	assert.equal(flushCalls, 0);
});