import { useEffect, useRef, useMemo, useCallback } from 'react';
import { Zap, Bot } from 'lucide-react';
import type { SlashCommandItem, SlashCommandMenuProps } from 'src/core/chat/types/slashCommand';
import { localInstance } from 'src/i18n/locals';

/**
 * 高亮匹配文本
 */
const highlightMatch = (text: string, filterText: string): React.ReactNode => {
	if (!filterText) return text;

	const index = text.toLowerCase().indexOf(filterText.toLowerCase());
	if (index === -1) return text;

	const before = text.slice(0, index);
	const match = text.slice(index, index + filterText.length);
	const after = text.slice(index + filterText.length);

	return (
		<>
			{before}
			<span className="slash-command-highlight">{match}</span>
			{after}
		</>
	);
};

/**
 * 斜杠命令自动补全菜单组件
 */
export const SlashCommandMenu = ({
	items,
	filterText,
	visible,
	selectedIndex,
	menuPosition,
	onSelect,
	onClose,
	maxHeight,
}: SlashCommandMenuProps) => {
	const listRef = useRef<HTMLDivElement>(null);
	const selectedItemRef = useRef<HTMLDivElement>(null);

	// 过滤和排序候选项
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
				// 前缀匹配优先
				const aStartsWith = a.name.toLowerCase().startsWith(lowerFilter);
				const bStartsWith = b.name.toLowerCase().startsWith(lowerFilter);
				if (aStartsWith && !bStartsWith) return -1;
				if (!aStartsWith && bStartsWith) return 1;
				return a.name.localeCompare(b.name);
			});
	}, [items, filterText]);

	// 滚动到选中项
	useEffect(() => {
		if (selectedItemRef.current && listRef.current) {
			const selectedItem = selectedItemRef.current;
			const list = listRef.current;
			const itemTop = selectedItem.offsetTop;
			const itemBottom = itemTop + selectedItem.offsetHeight;
			const listTop = list.scrollTop;
			const listBottom = listTop + list.clientHeight;

			if (itemTop < listTop) {
				list.scrollTop = itemTop;
			} else if (itemBottom > listBottom) {
				list.scrollTop = itemBottom - list.clientHeight;
			}
		}
	}, [selectedIndex, filteredItems.length]);

	// 点击外部关闭
	useEffect(() => {
		if (!visible) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (listRef.current && !listRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		// 延迟添加监听器，避免立即触发
		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
		}, 100);

		return () => {
			clearTimeout(timer);
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [visible, onClose]);

	const handleItemClick = useCallback(
		(item: SlashCommandItem) => {
			onSelect(item);
		},
		[onSelect]
	);

	if (!visible) return null;

	const computedMaxHeight = maxHeight ?? Math.floor(window.innerHeight * 0.4);

	const renderEmptyState = () => (
		<div className="slash-command-empty">
			{items.length === 0
				? localInstance.slash_command_empty || '暂无可用命令'
				: localInstance.slash_command_no_match || '无匹配项'}
		</div>
	);

	const renderItem = (item: SlashCommandItem, index: number) => {
		const isSelected = index === selectedIndex;
		const Icon = item.type === 'skill' ? Zap : Bot;
		const typeLabel = item.type === 'skill' ? 'Skill' : 'Agent';

		return (
			<div
				key={`${item.type}-${item.name}`}
				ref={isSelected ? selectedItemRef : undefined}
				className={`slash-command-item ${isSelected ? 'slash-command-item--selected' : ''}`}
				onClick={() => handleItemClick(item)}
				role="option"
				aria-selected={isSelected}
			>
				<div className="slash-command-item__icon">
					<Icon className="tw-size-4" />
				</div>
				<div className="slash-command-item__content">
					<div className="slash-command-item__header">
						<span className="slash-command-item__name">
							{highlightMatch(item.name, filterText)}
						</span>
						<span className={`slash-command-item__type slash-command-item__type--${item.type}`}>
							{typeLabel}
						</span>
					</div>
					<div className="slash-command-item__description">
						{highlightMatch(item.description, filterText)}
					</div>
				</div>
			</div>
		);
	};

	return (
		<div
			ref={listRef}
			className="slash-command-menu"
			style={{
				position: 'fixed',
				top: menuPosition.top,
				left: menuPosition.left,
				maxHeight: computedMaxHeight,
			}}
			role="listbox"
		>
			{filteredItems.length === 0 ? renderEmptyState() : filteredItems.map(renderItem)}
		</div>
	);
};
