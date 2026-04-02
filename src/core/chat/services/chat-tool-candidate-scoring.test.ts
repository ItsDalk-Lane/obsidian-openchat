import assert from 'node:assert/strict';
import test from 'node:test';
import type {
	DiscoveryEntry,
	TaskSignature,
	ToolScoreCard,
} from './chat-tool-selection-types';
import { scoreDiscoveryEntries } from './chat-tool-candidate-scoring';

const createEntry = (
	toolName: string,
	familyId: string,
	overrides?: Partial<DiscoveryEntry>,
): DiscoveryEntry => ({
	stableId: toolName,
	toolName,
	familyId,
	displayName: toolName,
	oneLinePurpose: toolName,
	visibility: 'default',
	capabilityTags: [],
	source: 'builtin',
	sourceId: 'builtin',
	riskLevel: 'read-only',
	argumentComplexity: 'low',
	requiredArgsSummary: [],
	whenToUse: [],
	whenNotToUse: [],
	...(overrides ?? {}),
});

const createSignature = (overrides?: Partial<TaskSignature>): TaskSignature => ({
	normalizedQuery: 'default query',
	nextAction: 'locate',
	targetKind: 'vault',
	targetExplicitness: 'unknown',
	scope: 'vault',
	writeIntent: 'none',
	confidence: 'medium',
	environment: {
		hasSelectedText: false,
		hasSelectedFiles: false,
		hasSelectedFolders: false,
		hasContextualTarget: false,
		hasActiveFile: false,
		selectionKind: 'none',
		latestToolNames: [],
		workflowStage: 'initial',
	},
	reasons: [],
	...(overrides ?? {}),
});

const expectFirst = (cards: ToolScoreCard[], toolName: string): ToolScoreCard => {
	assert.equal(cards[0]?.toolName, toolName);
	return cards[0]!;
};

test('scoreDiscoveryEntries 会在 locate 阶段优先打分 find_paths 高于 read_file', () => {
	const cards = scoreDiscoveryEntries({
		signature: createSignature({
			normalizedQuery: '我之前记录的 react 性能优化方案有哪些',
			reasons: ['target-not-yet-resolved'],
		}),
		entries: [
			createEntry('find_paths', 'builtin.vault.discovery', {
				capabilityTags: ['find', 'path', '查找'],
			}),
			createEntry('read_file', 'builtin.vault.read', {
				requiredArgsSummary: ['file_path'],
			}),
			createEntry('edit_file', 'builtin.vault.write', {
				riskLevel: 'mutating',
				requiredArgsSummary: ['file_path'],
			}),
		],
	});

	const first = expectFirst(cards, 'find_paths');
	assert.ok(first.breakdown.domainMatch > 0);
	assert.ok(cards.find((card) => card.toolName === 'read_file')!.breakdown.targetFit < 0);
	assert.ok(cards.find((card) => card.toolName === 'edit_file')!.breakdown.riskAdjustment < 0);
	assert.ok(cards.find((card) => card.toolName === 'edit_file')!.blockedReasons.includes('write-intent-missing'));
});

test('scoreDiscoveryEntries 会在显式读取当前文件时优先提升 read_file', () => {
	const cards = scoreDiscoveryEntries({
		signature: createSignature({
			nextAction: 'read',
			targetKind: 'file',
			targetExplicitness: 'contextual',
			scope: 'single',
			confidence: 'high',
			environment: {
				hasSelectedText: false,
				hasSelectedFiles: true,
				hasSelectedFolders: false,
				hasContextualTarget: true,
				hasActiveFile: false,
				selectionKind: 'file',
				latestToolNames: [],
				workflowStage: 'initial',
			},
		}),
		entries: [
			createEntry('read_file', 'builtin.vault.read', {
				requiredArgsSummary: ['file_path'],
				capabilityTags: ['read', 'file'],
			}),
			createEntry('find_paths', 'builtin.vault.discovery', {
				capabilityTags: ['find', 'path'],
			}),
		],
	});

	const first = expectFirst(cards, 'read_file');
	assert.ok(first.breakdown.targetFit > 0);
	assert.ok(first.breakdown.contextFit > 0);
	assert.ok(first.score > cards[1]!.score);
	assert.ok(cards[1]!.breakdown.targetFit <= 0);
});

test('scoreDiscoveryEntries 会利用 post-discovery 工作流先验提升读取工具', () => {
	const cards = scoreDiscoveryEntries({
		signature: createSignature({
			nextAction: 'read',
			targetKind: 'file',
			targetExplicitness: 'contextual',
			scope: 'single',
			confidence: 'medium',
			environment: {
				hasSelectedText: false,
				hasSelectedFiles: false,
				hasSelectedFolders: false,
				hasContextualTarget: true,
				hasActiveFile: false,
				selectionKind: 'none',
				recentDiscovery: {
					toolName: 'find_paths',
					hasResults: true,
					resultCount: 2,
					targetKind: 'file',
				},
				latestToolNames: ['find_paths'],
				workflowStage: 'post-discovery',
			},
		}),
		entries: [
			createEntry('read_file', 'builtin.vault.read', {
				requiredArgsSummary: ['file_path'],
			}),
			createEntry('search_content', 'builtin.vault.search', {
				requiredArgsSummary: ['pattern'],
			}),
		],
	});

	const readCard = cards.find((card) => card.toolName === 'read_file')!;
	const searchCard = cards.find((card) => card.toolName === 'search_content')!;
	assert.ok(readCard.breakdown.workflowPrior > 0);
	assert.ok(readCard.breakdown.contextFit > 0);
	assert.ok(readCard.score > searchCard.score);
	assert.equal(cards[0]?.toolName, 'read_file');
	assert.equal(cards[1]?.toolName, 'search_content');
});

test('scoreDiscoveryEntries 会利用 query_index 的非文件数据源提升 metadata 工具', () => {
	const cards = scoreDiscoveryEntries({
		signature: createSignature({
			nextAction: 'metadata',
			targetKind: 'vault',
			targetExplicitness: 'contextual',
			scope: 'vault',
			confidence: 'medium',
			environment: {
				hasSelectedText: false,
				hasSelectedFiles: false,
				hasSelectedFolders: false,
				hasContextualTarget: true,
				hasActiveFile: false,
				selectedTextFilePath: undefined,
				selectedTextRange: undefined,
				selectionKind: 'none',
				recentDiscovery: {
					toolName: 'query_index',
					hasResults: true,
					resultCount: 2,
					targetKind: 'vault',
					dataSource: 'tag',
				},
				latestToolNames: ['query_index'],
				workflowStage: 'post-discovery',
			},
		}),
		entries: [
			createEntry('query_index', 'builtin.vault.search', {
				requiredArgsSummary: ['expression'],
			}),
			createEntry('read_file', 'builtin.vault.read', {
				requiredArgsSummary: ['file_path'],
			}),
		],
	});

	assert.equal(cards[0]?.toolName, 'query_index');
	assert.ok((cards[0]?.breakdown.contextFit ?? 0) > (cards[1]?.breakdown.contextFit ?? 0));
});