/**
 * @module skills/registry
 * @description 提供 skills 域的快照缓存、索引与统一查询能力。
 *
 * @dependencies src/domains/skills/types
 * @side-effects 调用 source 进行扫描
 * @invariants 当前只聚合单一本地 source，但结构需保持后续可扩展。
 */

import type {
	SkillDefinition,
	SkillId,
	SkillQueryOptions,
	SkillScanError,
	SkillScanResult,
	SkillSource,
} from './types';

const DEFAULT_RELEVANT_SKILL_LIMIT = 3;
const MAX_RELEVANCE_QUERY_LENGTH = 600;
const MAX_RELEVANCE_TOKENS = 12;

export class SkillRegistry {
	private snapshot: SkillScanResult | null = null;
	private refreshPromise: Promise<SkillScanResult> | null = null;
	private readonly skillsById = new Map<SkillId, SkillDefinition>();
	private readonly skillsByName = new Map<string, SkillDefinition>();

	constructor(private readonly source: SkillSource) {}

	getSnapshot(): SkillScanResult | null {
		return this.snapshot;
	}

	async scan(): Promise<SkillScanResult> {
		if (this.snapshot) {
			return this.snapshot;
		}
		return await this.refresh();
	}

	async refresh(): Promise<SkillScanResult> {
		if (!this.refreshPromise) {
			this.refreshPromise = this.doRefresh().finally(() => {
				this.refreshPromise = null;
			});
		}
		return await this.refreshPromise;
	}

	findById(id: string): SkillDefinition | undefined {
		return this.skillsById.get(this.source.normalizePath(id));
	}

	findByName(name: string, options?: SkillQueryOptions): SkillDefinition | undefined {
		const matched = this.skillsByName.get(name.trim());
		if (!matched) {
			return undefined;
		}
		if (options?.includeDisabled) {
			return matched;
		}
		return matched.metadata.enabled === false ? undefined : matched;
	}

	resolveRelevantSkills(
		query: string,
		limit = DEFAULT_RELEVANT_SKILL_LIMIT,
		options?: SkillQueryOptions,
	): SkillDefinition[] {
		const snapshot = this.snapshot;
		const normalizedQuery = normalizeRelevantSkillQuery(query);
		const normalizedLimit = normalizeRelevantSkillLimit(limit);
		if (!snapshot || !normalizedQuery || normalizedLimit <= 0) {
			return [];
		}

		return snapshot.skills
			.map((skill) => ({
				skill,
				score: scoreSkillDefinition(skill, normalizedQuery),
			}))
			.filter((entry) => {
				if (entry.score <= 0) {
					return false;
				}
				if (options?.includeDisabled) {
					return true;
				}
				return entry.skill.metadata.enabled !== false;
			})
			.sort((left, right) =>
				right.score - left.score
				|| left.skill.metadata.name.localeCompare(right.skill.metadata.name),
			)
			.slice(0, normalizedLimit)
			.map((entry) => entry.skill);
	}

	clearCache(): void {
		this.snapshot = null;
		this.skillsById.clear();
		this.skillsByName.clear();
	}

	private async doRefresh(): Promise<SkillScanResult> {
		const sourceResult = await this.source.scan();
		const normalizedById = new Map<SkillId, SkillDefinition>();
		const normalizedByName = new Map<string, SkillDefinition>();
		const duplicateWarnings: SkillScanError[] = [];

		for (const skill of sourceResult.skills) {
			const normalizedSkill = this.normalizeSkillDefinition(skill);
			const previous = normalizedByName.get(normalizedSkill.metadata.name);
			if (previous) {
				duplicateWarnings.push({
					path: normalizedSkill.skillFilePath,
					reason: `Skill 名称重复，已覆盖先前定义: ${normalizedSkill.metadata.name}`,
					severity: 'warning',
				});
				normalizedById.delete(previous.skillFilePath);
			}
			normalizedByName.set(normalizedSkill.metadata.name, normalizedSkill);
			normalizedById.set(normalizedSkill.skillFilePath, normalizedSkill);
		}

		const snapshot: SkillScanResult = {
			skills: [...normalizedByName.values()].sort((left, right) =>
				left.metadata.name.localeCompare(right.metadata.name),
			),
			errors: [...sourceResult.errors, ...duplicateWarnings],
		};

		this.snapshot = snapshot;
		this.skillsById.clear();
		this.skillsByName.clear();
		for (const skill of snapshot.skills) {
			this.skillsById.set(skill.skillFilePath, skill);
			this.skillsByName.set(skill.metadata.name, skill);
		}

		return snapshot;
	}

	private normalizeSkillDefinition(skill: SkillDefinition): SkillDefinition {
		return {
			...skill,
			skillFilePath: this.source.normalizePath(skill.skillFilePath),
			basePath: this.source.normalizePath(skill.basePath),
		};
	}
}

function normalizeRelevantSkillLimit(limit: number): number {
	if (!Number.isFinite(limit)) {
		return DEFAULT_RELEVANT_SKILL_LIMIT;
	}
	return Math.max(0, Math.trunc(limit));
}

function normalizeRelevantSkillQuery(query: string): string {
	return query
		.toLowerCase()
		.trim()
		.replace(/\s+/gu, ' ')
		.slice(0, MAX_RELEVANCE_QUERY_LENGTH);
}

function tokenizeRelevantSkillQuery(query: string): string[] {
	const tokens = new Set<string>();
	for (const rawToken of query.split(/[\s,.;:!?()[\]{}"'`]+/gu)) {
		const normalizedToken = rawToken.replace(/^\/+|\/+$/gu, '').trim();
		if (!normalizedToken || normalizedToken.length < 2) {
			continue;
		}
		tokens.add(normalizedToken);
		if (tokens.size >= MAX_RELEVANCE_TOKENS) {
			break;
		}
	}
	return [...tokens];
}

function scoreSkillDefinition(skill: SkillDefinition, query: string): number {
	const name = normalizeRelevantSkillQuery(skill.metadata.name);
	const description = normalizeRelevantSkillQuery(skill.metadata.description);
	const whenToUse = normalizeRelevantSkillQuery(skill.metadata.when_to_use ?? '');
	const queryTokens = tokenizeRelevantSkillQuery(query);
	let score = 0;

	if (query === name) {
		score += 240;
	}
	if (query === `/${name}`) {
		score += 260;
	}
	if (query.includes(`/${name}`)) {
		score += 180;
	}
	if (query.includes(name)) {
		score += 120;
	}
	if (name.includes(query)) {
		score += 110;
	}
	if (whenToUse.includes(query)) {
		score += 70;
	}
	if (description.includes(query)) {
		score += 45;
	}

	for (const token of queryTokens) {
		if (token === name) {
			score += 80;
		} else if (name.includes(token)) {
			score += 36;
		}
		if (whenToUse.includes(token)) {
			score += 20;
		}
		if (description.includes(token)) {
			score += 12;
		}
	}

	return score;
}