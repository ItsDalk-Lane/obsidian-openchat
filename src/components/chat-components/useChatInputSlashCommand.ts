import { useState, useRef, useMemo, useCallback, useEffect, type RefObject } from 'react';
import type { ChatService } from 'src/core/chat/services/ChatService';
import type { SlashCommandItem } from 'src/core/chat/types/slashCommand';
import { Notice } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { SkillDefinition } from 'src/domains/skills/types';
import type { SubAgentDefinition } from 'src/tools/sub-agents';

export interface UseChatInputSlashCommandReturn {
	slashCommandVisible: boolean;
	setSlashCommandVisible: (v: boolean) => void;
	slashCommandItems: SlashCommandItem[];
	slashCommandFilter: string;
	slashCommandSelectedIndex: number;
	setSlashCommandSelectedIndex: (v: number | ((prev: number) => number)) => void;
	slashCommandPosition: { top: number; left: number };
	filteredSlashCommandItems: SlashCommandItem[];
	executeSlashCommand: (item: SlashCommandItem) => Promise<void>;
	closeSlashCommandMenu: () => void;
}

/**
 * 管理斜杠命令的状态与逻辑，提取自 ChatInput
 */
export function useChatInputSlashCommand(
	service: ChatService,
	value: string,
	isGenerating: boolean,
	textareaRef: RefObject<HTMLTextAreaElement>
): UseChatInputSlashCommandReturn {
	const [slashCommandVisible, setSlashCommandVisible] = useState(false);
	const [slashCommandItems, setSlashCommandItems] = useState<SlashCommandItem[]>([]);
	const [slashCommandFilter, setSlashCommandFilter] = useState('');
	const [slashCommandSelectedIndex, setSlashCommandSelectedIndex] = useState(0);
	const [slashCommandPosition, setSlashCommandPosition] = useState({ top: 0, left: 0 });
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [slashCommandStartIndex, setSlashCommandStartIndex] = useState<number | null>(null);
	const slashCommandLoadingRef = useRef(false);

	// 加载斜杠命令列表
	useEffect(() => {
		const loadCommands = async () => {
			if (slashCommandLoadingRef.current) return;
			slashCommandLoadingRef.current = true;

			try {
				const [skillsResult, agentsResult] = await Promise.all([
					service.loadInstalledSkills(),
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

	// 监听输入值变化，检测斜杠命令
	useEffect(() => {
		if (isGenerating) {
			setSlashCommandVisible(false);
			setSlashCommandStartIndex(null);
			return;
		}

		const textarea = textareaRef.current;
		if (!textarea) return;

		const { selectionStart } = textarea;
		const textBeforeCursor = value.substring(0, selectionStart);
		const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

		if (lastSlashIndex === -1) {
			setSlashCommandVisible(false);
			setSlashCommandStartIndex(null);
			setSlashCommandFilter('');
			return;
		}

		// 检查斜杠后面是否有空格或换行
		const textAfterSlash = textBeforeCursor.substring(lastSlashIndex + 1);
		if (textAfterSlash.includes(' ') || textAfterSlash.includes('\n')) {
			setSlashCommandVisible(false);
			setSlashCommandStartIndex(null);
			setSlashCommandFilter('');
			return;
		}

		// 检查斜杠前面是否是空格或行首
		const charBeforeSlash = lastSlashIndex > 0 ? textBeforeCursor[lastSlashIndex - 1] : '';
		if (charBeforeSlash !== '' && charBeforeSlash !== ' ' && charBeforeSlash !== '\n') {
			setSlashCommandVisible(false);
			setSlashCommandStartIndex(null);
			setSlashCommandFilter('');
			return;
		}

		// 更新菜单状态
		setSlashCommandStartIndex(lastSlashIndex);
		setSlashCommandFilter(textAfterSlash);
		setSlashCommandSelectedIndex(0);

		// 计算菜单位置
		const textareaRect = textarea.getBoundingClientRect();
		const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
		const lines = textBeforeCursor.split('\n');
		const currentLineIndex = lines.length - 1;
		const currentLineText = lines[currentLineIndex] || '';
		const charWidth = 8; // 估算的字符宽度
		const offsetX = Math.min(currentLineText.length * charWidth, textareaRect.width - 280);
		const offsetY = Math.min((currentLineIndex + 1) * lineHeight, textareaRect.height);

		setSlashCommandPosition({
			top: textareaRect.top + offsetY + 10,
			left: Math.max(10, textareaRect.left + offsetX),
		});

		setSlashCommandVisible(true);
	}, [value, isGenerating, textareaRef]);

	// 过滤后的候选项
	const filteredSlashCommandItems = useMemo(() => {
		if (!slashCommandFilter) return slashCommandItems;

		const lowerFilter = slashCommandFilter.toLowerCase();
		return slashCommandItems
			.filter((item) => {
				const nameMatch = item.name.toLowerCase().includes(lowerFilter);
				const descMatch = item.description.toLowerCase().includes(lowerFilter);
				return nameMatch || descMatch;
			})
			.sort((a, b) => {
				const aStartsWith = a.name.toLowerCase().startsWith(lowerFilter);
				const bStartsWith = b.name.toLowerCase().startsWith(lowerFilter);
				if (aStartsWith && !bStartsWith) return -1;
				if (!aStartsWith && bStartsWith) return 1;
				return a.name.localeCompare(b.name);
			});
	}, [slashCommandItems, slashCommandFilter]);

	// 执行斜杠命令
	const executeSlashCommand = useCallback(
		async (item: SlashCommandItem) => {
			setSlashCommandVisible(false);
			setSlashCommandStartIndex(null);
			setSlashCommandFilter('');

			try {
				if (item.type === 'skill') {
					await service.executeSkillCommand(item.name);
				} else {
					await service.executeSubAgentCommand(item.name);
				}
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				new Notice(localInstance.chat_command_execute_failed_prefix.replace('{message}', reason));
				DebugLogger.error('[ChatInput] 执行命令失败', error);
			}
		},
		[service]
	);

	// 关闭斜杠命令菜单
	const closeSlashCommandMenu = useCallback(() => {
		setSlashCommandVisible(false);
		setSlashCommandStartIndex(null);
		setSlashCommandFilter('');
	}, []);

	return {
		slashCommandVisible,
		setSlashCommandVisible,
		slashCommandItems,
		slashCommandFilter,
		slashCommandSelectedIndex,
		setSlashCommandSelectedIndex,
		slashCommandPosition,
		filteredSlashCommandItems,
		executeSlashCommand,
		closeSlashCommandMenu,
	};
}
