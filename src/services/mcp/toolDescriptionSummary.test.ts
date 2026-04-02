import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DISCOVER_SKILLS_TOOL_NAME,
	INVOKE_SKILL_TOOL_NAME,
} from 'src/tools/skill/skill-tools';
import {
	BUILTIN_SERVER_ID,
} from 'src/tools/runtime/constants';
import {
	DELEGATE_SUB_AGENT_TOOL_NAME,
	DISCOVER_SUB_AGENTS_TOOL_NAME,
} from 'src/tools/sub-agents/types';
import { summarizeToolDescriptionForUi } from './toolDescriptionSummary';

const summarizeBuiltin = (name: string): string => {
	return summarizeToolDescriptionForUi({
		name,
		description: '',
		serverId: BUILTIN_SERVER_ID,
	});
};

test('legacy 工具摘要会指向新的 canonical 名称', () => {
	assert.match(summarizeBuiltin('get_time'), /get_current_time/);
	assert.match(summarizeBuiltin('fetch'), /fetch_webpage/);
	assert.match(summarizeBuiltin('list_directory'), /list_directory_flat/);
});

test('wrapper 与 discover/delegate 工具摘要会说明默认使用方式', () => {
	assert.equal(summarizeBuiltin('convert_time'), '把一个时间从源时区换算到目标时区。');
	assert.equal(summarizeBuiltin('fetch_webpages_batch'), '批量抓取多个已知网页。');
	assert.match(summarizeBuiltin(DISCOVER_SKILLS_TOOL_NAME), /先发现/);
	assert.match(summarizeBuiltin(INVOKE_SKILL_TOOL_NAME), /discover_skills/);
	assert.match(summarizeBuiltin(DISCOVER_SUB_AGENTS_TOOL_NAME), /委托目标/);
	assert.match(summarizeBuiltin(DELEGATE_SUB_AGENT_TOOL_NAME), /discover_sub_agents/);
});