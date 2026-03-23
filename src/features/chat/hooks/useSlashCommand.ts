import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { SlashCommandItem, SlashCommandType } from '../types/slashCommand';
import type { SkillDefinition } from 'src/features/skills';
import type { SubAgentDefinition } from 'src/features/sub-agents';
import type { ChatService } from '../services/ChatService';

interface UseSlashCommandOptions {
	service: ChatService;
	inputValue: string;
	onExecuteCommand: (item: SlashCommandItem) => void;
	disabled?: boolean;
}

interface UseSlashCommandReturn {
	visible: boolean;
	items: SlashCommandItem[];
	filterText: string;
	selectedIndex: number;
	menuPosition: { top: number; left: number };
	handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
	handleSelect: (item: SlashCommandItem) => void;
	handleClose: () => void;
	setTextareaRef: (textarea: HTMLTextAreaElement | null) => void;
}

/**
 * 将 SkillDefinition 转换为 SlashCommandItem
 */
const skillToCommandItem = (skill: SkillDefinition): SlashCommandItem => ({
	name: skill.metadata.name,
	description: skill.metadata.description,
	type: 'skill' as SlashCommandType,
	definition: skill,
});

/**
 * 将 SubAgentDefinition 转换为 SlashCommandItem
 */
const agentToCommandItem = (agent: SubAgentDefinition): SlashCommandItem => ({
	name: agent.metadata.name,
	description: agent.metadata.description,
	type: 'agent' as SlashCommandType,
	definition: agent,
});

/**
 * 斜杠命令 Hook
 * 管理斜杠命令自动补全的状态和逻辑
 */
export const useSlashCommand = ({
	service,
	inputValue,
	onExecuteCommand,
	disabled = false,
}: UseSlashCommandOptions): UseSlashCommandReturn => {
	const [visible, setVisible] = useState(false);
	const [items, setItems] = useState<SlashCommandItem[]>([]);
	const [filterText, setFilterText] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
	const [slashStartIndex, setSlashStartIndex] = useState<number | null>(null);

	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const loadingRef = useRef(false);

	// 加载 skills 和 agents 列表
	useEffect(() => {
		const loadCommands = async () => {
			if (loadingRef.current) return;
			loadingRef.current = true;

			try {
				const [skillsResult, agentsResult] = await Promise.all([
					service.loadInstalledSkills(),
					service.loadInstalledSubAgents(),
				]);

				const skillItems = skillsResult.skills.map(skillToCommandItem);
				const agentItems = agentsResult.agents.map(agentToCommandItem);

				// 混合并按名称排序
				const allItems = [...skillItems, ...agentItems].sort((a, b) =>
					a.name.localeCompare(b.name)
				);

				setItems(allItems);
			} catch (error) {
				console.error('[useSlashCommand] 加载命令列表失败:', error);
				setItems([]);
			} finally {
				loadingRef.current = false;
			}
		};

		void loadCommands();

		// 监听 skills 和 agents 变化
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

	// 过滤后的候选项
	const filteredItems = useMemo(() => {
		if (!filterText) return items;

		const lowerFilter = filterText.toLowerCase();
		return items
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
	}, [items, filterText]);

	// 更新菜单位置
	const updateMenuPosition = useCallback((textarea: HTMLTextAreaElement) => {
		// 获取光标位置
		const { selectionStart } = textarea;
		const textBeforeCursor = textarea.value.substring(0, selectionStart);

		// 创建一个临时元素来测量光标位置
		const mirror = document.createElement('div');
		mirror.style.cssText = `
			position: absolute;
			visibility: hidden;
			white-space: pre-wrap;
			word-wrap: break-word;
			width: ${textarea.clientWidth}px;
			font-family: ${getComputedStyle(textarea).fontFamily};
			font-size: ${getComputedStyle(textarea).fontSize};
			line-height: ${getComputedStyle(textarea).lineHeight};
			padding: ${getComputedStyle(textarea).padding};
			border: ${getComputedStyle(textarea).border};
			box-sizing: border-box;
		`;

		// 添加文本内容（使用 &nbsp; 保留空格）
		mirror.textContent = textBeforeCursor;
		document.body.appendChild(mirror);

		// 获取光标相对于 textarea 的位置
		const cursorX = mirror.clientWidth;
		const cursorY = mirror.clientHeight;

		document.body.removeChild(mirror);

		// 获取 textarea 在视口中的位置
		const textareaRect = textarea.getBoundingClientRect();
		const top = textareaRect.top + cursorY + 20; // 20px 偏移，避免覆盖光标
		const left = textareaRect.left + Math.min(cursorX, textareaRect.width - 250); // 确保不超出右边界

		setMenuPosition({
			top: Math.min(top, window.innerHeight - 200), // 确保不超出底部
			left: Math.max(10, left), // 确保不超出左边界
		});
	}, []);

	// 监听输入值变化，检测斜杠命令
	useEffect(() => {
		if (disabled) {
			setVisible(false);
			setSlashStartIndex(null);
			return;
		}

		// 查找光标前最近的斜杠
		const textarea = textareaRef.current;
		if (!textarea) return;

		const { selectionStart } = textarea;
		const textBeforeCursor = inputValue.substring(0, selectionStart);
		const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

		if (lastSlashIndex === -1) {
			// 没有斜杠，关闭菜单
			setVisible(false);
			setSlashStartIndex(null);
			setFilterText('');
			return;
		}

		// 检查斜杠后面是否有空格（如果有空格，说明不是命令）
		const textAfterSlash = textBeforeCursor.substring(lastSlashIndex + 1);
		if (textAfterSlash.includes(' ') || textAfterSlash.includes('\n')) {
			setVisible(false);
			setSlashStartIndex(null);
			setFilterText('');
			return;
		}

		// 检查斜杠前面是否是空格或行首（确保是命令开始）
		const charBeforeSlash = lastSlashIndex > 0 ? textBeforeCursor[lastSlashIndex - 1] : '';
		if (charBeforeSlash !== '' && charBeforeSlash !== ' ' && charBeforeSlash !== '\n') {
			setVisible(false);
			setSlashStartIndex(null);
			setFilterText('');
			return;
		}

		// 显示菜单
		setSlashStartIndex(lastSlashIndex);
		setFilterText(textAfterSlash);
		setSelectedIndex(0);
		updateMenuPosition(textarea);
		setVisible(true);
	}, [inputValue, disabled, updateMenuPosition]);

	// 设置 textarea 引用
	const setTextareaRef = useCallback((textarea: HTMLTextAreaElement | null) => {
		textareaRef.current = textarea;
	}, []);

	// 处理键盘事件
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
			if (!visible || disabled) return false;

			switch (event.key) {
				case 'ArrowDown':
					event.preventDefault();
					setSelectedIndex((prev) =>
						prev < filteredItems.length - 1 ? prev + 1 : 0
					);
					return true;

				case 'ArrowUp':
					event.preventDefault();
					setSelectedIndex((prev) =>
						prev > 0 ? prev - 1 : filteredItems.length - 1
					);
					return true;

				case 'Enter':
					if (filteredItems.length > 0) {
						event.preventDefault();
						const selectedItem = filteredItems[selectedIndex];
						if (selectedItem) {
							handleSelect(selectedItem);
						}
					}
					return true;

				case 'Escape':
					event.preventDefault();
					handleClose();
					return true;

				case 'Tab':
					if (filteredItems.length > 0) {
						event.preventDefault();
						const selectedItem = filteredItems[selectedIndex];
						if (selectedItem) {
							handleSelect(selectedItem);
						}
					}
					return true;

				default:
					return false;
			}
		},
		[visible, disabled, filteredItems, selectedIndex]
	);

	// 处理选择
	const handleSelect = useCallback(
		(item: SlashCommandItem) => {
			setVisible(false);
			setSlashStartIndex(null);
			setFilterText('');
			onExecuteCommand(item);
		},
		[onExecuteCommand]
	);

	// 关闭菜单
	const handleClose = useCallback(() => {
		setVisible(false);
		setSlashStartIndex(null);
		setFilterText('');
	}, []);

	return {
		visible,
		items,
		filterText,
		selectedIndex,
		menuPosition,
		handleKeyDown,
		handleSelect,
		handleClose,
		setTextareaRef,
	};
};

// 导出 setTextareaRef 的类型
export type { UseSlashCommandReturn };
