import { useCallback, useEffect, useRef } from 'react';
import type { ChatInputSelectorItem, ChatInputMenuPosition } from './chatInputSelectorUtils';

interface ChatInputSelectorMenuProps<T = unknown> {
	items: ChatInputSelectorItem<T>[];
	visible: boolean;
	selectedIndex: number;
	menuPosition: ChatInputMenuPosition;
	filterText: string;
	emptyStateText: string;
	onSelect: (item: ChatInputSelectorItem<T>) => void;
	onClose: () => void;
	renderIcon: (item: ChatInputSelectorItem<T>) => React.ReactNode;
	maxHeight?: number;
}

const highlightMatch = (text: string, filterText: string): React.ReactNode => {
	if (!filterText) {
		return text;
	}

	const matchIndex = text.toLowerCase().indexOf(filterText.toLowerCase());
	if (matchIndex === -1) {
		return text;
	}

	const before = text.slice(0, matchIndex);
	const match = text.slice(matchIndex, matchIndex + filterText.length);
	const after = text.slice(matchIndex + filterText.length);

	return (
		<>
			{before}
			<span className="slash-command-highlight">{match}</span>
			{after}
		</>
	);
};

export const ChatInputSelectorMenu = <T,>({
	items,
	visible,
	selectedIndex,
	menuPosition,
	filterText,
	emptyStateText,
	onSelect,
	onClose,
	renderIcon,
	maxHeight,
}: ChatInputSelectorMenuProps<T>) => {
	const listRef = useRef<HTMLDivElement>(null);
	const selectedItemRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!selectedItemRef.current || !listRef.current) {
			return;
		}

		const selectedItem = selectedItemRef.current;
		const list = listRef.current;
		const itemTop = selectedItem.offsetTop;
		const itemBottom = itemTop + selectedItem.offsetHeight;
		const listTop = list.scrollTop;
		const listBottom = listTop + list.clientHeight;

		if (itemTop < listTop) {
			list.scrollTop = itemTop;
			return;
		}

		if (itemBottom > listBottom) {
			list.scrollTop = itemBottom - list.clientHeight;
		}
	}, [items.length, selectedIndex]);

	useEffect(() => {
		if (!visible) {
			return;
		}

		const handleClickOutside = (event: MouseEvent) => {
			if (listRef.current && !listRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
		}, 100);

		return () => {
			clearTimeout(timer);
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [onClose, visible]);

	const handleItemClick = useCallback(
		(item: ChatInputSelectorItem<T>) => {
			onSelect(item);
		},
		[onSelect],
	);

	if (!visible) {
		return null;
	}

	const computedMaxHeight = maxHeight ?? Math.floor(window.innerHeight * 0.4);

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
			{items.length === 0 ? (
				<div className="slash-command-empty">{emptyStateText}</div>
			) : (
				items.map((item, index) => {
					const isSelected = index === selectedIndex;

					return (
						<div
							key={item.id}
							ref={isSelected ? selectedItemRef : undefined}
							className={`slash-command-item ${isSelected ? 'slash-command-item--selected' : ''}`}
							onClick={() => handleItemClick(item)}
							role="option"
							aria-selected={isSelected}
						>
							<div className="slash-command-item__icon">
								{renderIcon(item)}
							</div>
							<div className="slash-command-item__content">
								<div className="slash-command-item__header">
									<span className="slash-command-item__name">
										{highlightMatch(item.name, filterText)}
									</span>
									<span className={`slash-command-item__type slash-command-item__type--${item.kind}`}>
										{item.typeLabel}
									</span>
								</div>
								<div className="slash-command-item__description">
									{highlightMatch(item.description, filterText)}
								</div>
							</div>
						</div>
					);
				})
			)}
		</div>
	);
};