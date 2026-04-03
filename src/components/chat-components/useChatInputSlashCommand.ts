import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatService } from 'src/core/chat/services/chat-service';
import type { SlashCommandItem } from 'src/core/chat/types/slashCommand';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { SkillDefinition } from 'src/domains/skills/types';
import type { SubAgentDefinition } from 'src/tools/sub-agents/types';

export interface UseChatInputSlashCommandReturn {
	slashCommandItems: SlashCommandItem[];
	executeSlashCommand: (item: SlashCommandItem) => Promise<void>;
}

/**
 * 管理斜杠命令数据源与执行逻辑。
 */
export function useChatInputSlashCommand(
	service: ChatService,
): UseChatInputSlashCommandReturn {
	const [slashCommandItems, setSlashCommandItems] = useState<SlashCommandItem[]>([]);
	const slashCommandLoadingRef = useRef(false);

	// 加载斜杠命令列表
	useEffect(() => {
		const loadCommands = async () => {
			if (slashCommandLoadingRef.current) return;
			slashCommandLoadingRef.current = true;

			try {
				const [skillsResult, agentsResult] = await Promise.all([
					service.loadRunnableSkills(),
					service.loadInstalledSubAgents(),
				]);

				const skillItems: SlashCommandItem[] = skillsResult.skills.map((skill: SkillDefinition) => ({
					name: skill.metadata.name,
					description: skill.metadata.description,
					type: 'skill' as const,
					definition: skill,
				}));

				const agentItems: SlashCommandItem[] = agentsResult.agents.map((agent: SubAgentDefinition) => ({
					name: agent.metadata.name,
					description: agent.metadata.description,
					type: 'agent' as const,
					definition: agent,
				}));

				// 混合并按名称排序
				const allItems = [...skillItems, ...agentItems].sort((a, b) =>
					a.name.localeCompare(b.name)
				);

				setSlashCommandItems(allItems);
			} catch (error) {
				DebugLogger.error('[ChatInput] 加载命令列表失败', error);
				setSlashCommandItems([]);
			} finally {
				slashCommandLoadingRef.current = false;
			}
		};

		void loadCommands();

		// 监听变化
		const unsubSkills = service.onInstalledSkillsChange?.(() => {
			void loadCommands();
		});
		const unsubAgents = service.onInstalledSubAgentsChange?.(() => {
			void loadCommands();
		});

		return () => {
			unsubSkills?.();
			unsubAgents?.();
		};
	}, [service]);

	// 执行斜杠命令
	const executeSlashCommand = useCallback(
		async (item: SlashCommandItem) => {
			try {
				if (item.type === 'skill') {
					await service.executeSkillCommand(item.name);
				} else {
					await service.executeSubAgentCommand(item.name);
				}
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				service.getObsidianApiProvider().notify(
					localInstance.chat_command_execute_failed_prefix.replace('{message}', reason)
				);
				DebugLogger.error('[ChatInput] 执行命令失败', error);
			}
		},
		[service]
	);

	return {
		slashCommandItems,
		executeSlashCommand,
	};
}
