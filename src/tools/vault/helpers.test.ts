import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRegex } from './regex';

test('resolveRegex 接受普通短正则', () => {
	const regex = resolveRegex('^notes/.+\\.md$');
	assert.ok(regex instanceof RegExp);
	assert.equal(regex?.test('notes/demo.md'), true);
});

test('resolveRegex 拒绝明显高风险的嵌套量词', () => {
	assert.throws(() => resolveRegex('(a+)+b'), /高风险模式/);
});

test('resolveRegex 拒绝反向引用模式', () => {
	assert.throws(() => resolveRegex('(a)\\1'), /高风险模式/);
});

test('resolveRegex 拒绝超长正则', () => {
	assert.throws(() => resolveRegex('a'.repeat(161)), /长度不能超过 160 个字符/);
});