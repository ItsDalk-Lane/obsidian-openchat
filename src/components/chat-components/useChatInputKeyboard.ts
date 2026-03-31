import { useCallback } from 'react';
import type { ChatInputSelectorItem } from './chatInputSelectorUtils';

interface UseChatInputKeyboardOptions {
	selectorVisible: boolean;
	filteredItems: ReadonlyArray<ChatInputSelectorItem>;
	selectedIndex: number;
	setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
	handleSelectorSelect: (item: ChatInputSelectorItem) => void;
	closeMenu: () => void;
	handleSubmit: () => Promise<void>;
}

export function useChatInputKeyboard({
	selectorVisible,
	filteredItems,
	selectedIndex,
	setSelectedIndex,
	handleSelectorSelect,
	closeMenu,
	handleSubmit,
}: UseChatInputKeyboardOptions) {
	return useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.nativeEvent.isComposing) {
			return;
		}

		if (selectorVisible) {
			switch (event.key) {
				case 'ArrowDown':
					event.preventDefault();
					setSelectedIndex((previous) =>
						previous < filteredItems.length - 1 ? previous + 1 : 0,
					);
					return;
				case 'ArrowUp':
					event.preventDefault();
					setSelectedIndex((previous) =>
						previous > 0 ? previous - 1 : filteredItems.length - 1,
					);
					return;
				case 'Enter':
				case 'Tab':
					if (filteredItems.length > 0) {
						event.preventDefault();
						const selectedItem = filteredItems[selectedIndex];
						if (selectedItem) {
							handleSelectorSelect(selectedItem);
						}
					}
					return;
				case 'Escape':
					event.preventDefault();
					closeMenu();
					return;
			}
		}

		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void handleSubmit();
		}
	}, [closeMenu, filteredItems, handleSelectorSelect, handleSubmit, selectedIndex, selectorVisible, setSelectedIndex]);
}