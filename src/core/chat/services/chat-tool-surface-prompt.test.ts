import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolDefinition } from 'src/types/tool';
import { CURRENT_LOOP_TOOL_CAPABILITIES } from './provider-tool-capability-matrix';
import type {
	CandidateScope,
	ProviderToolDiscoveryPayload,
	ProviderToolExecutablePayload,
} from './chat-tool-selection-types';
import { buildToolSurfacePromptBlock } from './chat-tool-surface-prompt';

const EXECUTABLE_TOOL: ToolDefinition = {
	name: 'read_file',
	title: 'read_file',
	description: '读取一个已知文本文件。',
	inputSchema: { type: 'object' },
	source: 'builtin',
	sourceId: 'builtin',
	discovery: {
		displayName: 'read_file',
		oneLinePurpose: '读取一个已知文本文件。',
		whenToUse: [],
		whenNotToUse: [],
		requiredArgsSummary: ['file_path'],
		riskLevel: 'read-only',
		argumentComplexity: 'low',
		discoveryVisibility: 'default',
		capabilityTags: ['file'],
	},
};

const SCOPE: CandidateScope = {
	mode: 'workflow',
	candidateToolNames: ['delegate_sub_agent'],
	candidateServerIds: ['github'],
	reasons: ['workflow.delegate'],
	query: 'review the current diff',
};

test('buildToolSurfacePromptBlock 会输出 executable、workflow 与 server 摘要', () => {
	const discoveryPayload: ProviderToolDiscoveryPayload = {
		surfaceMode: 'current-loop',
		capabilities: CURRENT_LOOP_TOOL_CAPABILITIES,
		catalog: {
			version: 1,
			entries: [],
			workflowEntries: [{
				stableId: 'workflow.delegate.code-reviewer',
				toolName: 'delegate_sub_agent',
				familyId: 'workflow.delegate',
				displayName: 'code-reviewer',
				oneLinePurpose: '审查当前改动并标记风险。',
				visibility: 'workflow-only',
				capabilityTags: ['sub-agent', 'review'],
				source: 'workflow',
				sourceId: 'sub-agents',
				riskLevel: 'mutating',
				argumentComplexity: 'high',
				requiredArgsSummary: ['agent', 'task'],
				whenToUse: [],
				whenNotToUse: [],
			}],
			serverEntries: [{
				serverId: 'github',
				displayName: 'GitHub',
				oneLinePurpose: '处理 GitHub PR 与 issue 工作流。',
				capabilityTags: ['github', 'pull-request'],
			}],
		},
		scope: SCOPE,
	};
	const executablePayload: ProviderToolExecutablePayload = {
		surfaceMode: 'current-loop',
		capabilities: CURRENT_LOOP_TOOL_CAPABILITIES,
		toolSet: {
			tools: [EXECUTABLE_TOOL],
			scope: SCOPE,
		},
	};

	const block = buildToolSurfacePromptBlock({
		providerDiscoveryPayload: discoveryPayload,
		providerExecutablePayload: executablePayload,
	});

	assert.ok(block);
	assert.match(block, /<tool-surface>/);
	assert.match(block, /selection_mode=workflow/);
	assert.match(block, /- read_file: 读取一个已知文本文件。 \| risk=read-only \| args=file_path/);
	assert.match(block, /- code-reviewer: 审查当前改动并标记风险。 \| tool=delegate_sub_agent \| args=agent, task/);
	assert.match(block, /- GitHub: 处理 GitHub PR 与 issue 工作流。 \| server=github/);
	assert.match(block, /<\/tool-surface>/);
});

test('buildToolSurfacePromptBlock 在 provider 不支持 discovery payload 时返回空', () => {
	const block = buildToolSurfacePromptBlock({
		providerDiscoveryPayload: {
			surfaceMode: 'current-loop',
			capabilities: {
				...CURRENT_LOOP_TOOL_CAPABILITIES,
				supportsDiscoveryPayload: false,
			},
			catalog: {
				version: 1,
				entries: [],
				workflowEntries: [],
				serverEntries: [],
			},
			scope: {
				mode: 'atomic-tools',
				candidateToolNames: [],
				candidateServerIds: [],
				reasons: [],
				query: 'noop',
			},
		},
	});

	assert.equal(block, undefined);
});

test('buildToolSurfacePromptBlock 会转义 XML 敏感字符', () => {
	const block = buildToolSurfacePromptBlock({
		providerDiscoveryPayload: {
			surfaceMode: 'current-loop',
			capabilities: CURRENT_LOOP_TOOL_CAPABILITIES,
			catalog: {
				version: 1,
				entries: [],
				workflowEntries: [{
					stableId: 'workflow.delegate.<danger>',
					toolName: 'delegate_sub_agent',
					familyId: 'workflow.delegate',
					displayName: 'code<reviewer>&',
					oneLinePurpose: '审查<当前>改动 & 输出建议',
					visibility: 'workflow-only',
					capabilityTags: ['sub-agent', 'review'],
					source: 'workflow',
					sourceId: 'sub-agents',
					riskLevel: 'mutating',
					argumentComplexity: 'high',
					requiredArgsSummary: ['agent', 'task'],
					whenToUse: [],
					whenNotToUse: [],
				}],
				serverEntries: [{
					serverId: 'github<internal>',
					displayName: 'GitHub & Internal',
					oneLinePurpose: '处理 <private> PR 与 issue 工作流',
					capabilityTags: ['github', 'pull-request'],
				}],
			},
			scope: {
				...SCOPE,
				candidateServerIds: ['github<internal>'],
			},
		},
		providerExecutablePayload: {
			surfaceMode: 'current-loop',
			capabilities: CURRENT_LOOP_TOOL_CAPABILITIES,
			toolSet: {
				tools: [{
					...EXECUTABLE_TOOL,
					name: 'read<file>&',
					description: '读取 <危险> & 内容',
					discovery: {
						...EXECUTABLE_TOOL.discovery!,
						displayName: 'read<file>&',
						oneLinePurpose: '读取 <危险> & 内容',
					},
				}],
				scope: SCOPE,
			},
		},
	});

	assert.ok(block);
	assert.match(block, /read&lt;file&gt;&amp;/);
	assert.match(block, /code&lt;reviewer&gt;&amp;/);
	assert.match(block, /GitHub &amp; Internal/);
	assert.match(block, /github&lt;internal&gt;/);
	assert.doesNotMatch(block, /读取 <危险>|code<reviewer>&|GitHub & Internal \| server=github<internal>/);
});

test('buildToolSurfacePromptBlock 在超预算时回退到精简块', () => {
	const executableTools = Array.from({ length: 8 }, (_, index) => ({
		...EXECUTABLE_TOOL,
		name: `read_file_${index}`,
		description: 'x'.repeat(400),
		discovery: {
			...EXECUTABLE_TOOL.discovery!,
			displayName: `read<file>&${index}`,
			oneLinePurpose: `read<file>&${index} `.repeat(30),
		},
	} satisfies ToolDefinition));
	const block = buildToolSurfacePromptBlock({
		providerDiscoveryPayload: {
			surfaceMode: 'current-loop',
			capabilities: CURRENT_LOOP_TOOL_CAPABILITIES,
			catalog: {
				version: 1,
				entries: [],
				workflowEntries: [{
					stableId: 'workflow.delegate.large',
					toolName: 'delegate_sub_agent',
					familyId: 'workflow.delegate',
					displayName: 'code-reviewer',
					oneLinePurpose: '审查当前改动并标记风险 '.repeat(30),
					visibility: 'workflow-only',
					capabilityTags: ['sub-agent', 'review'],
					source: 'workflow',
					sourceId: 'sub-agents',
					riskLevel: 'mutating',
					argumentComplexity: 'high',
					requiredArgsSummary: ['agent', 'task'],
					whenToUse: [],
					whenNotToUse: [],
				}],
				serverEntries: [{
					serverId: 'github',
					displayName: 'GitHub',
					oneLinePurpose: '处理 GitHub PR 与 issue 工作流 '.repeat(30),
					capabilityTags: ['github', 'pull-request'],
				}],
			},
			scope: SCOPE,
		},
		providerExecutablePayload: {
			surfaceMode: 'current-loop',
			capabilities: CURRENT_LOOP_TOOL_CAPABILITIES,
			toolSet: {
				tools: executableTools,
				scope: SCOPE,
			},
		},
	});

	assert.ok(block);
	assert.match(block, /tool_surface_summary=omitted_for_budget/);
	assert.match(block, /executable_count=8/);
});