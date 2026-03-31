import type { ChangeEvent, RefObject } from 'react';
import type { ChatService } from 'src/core/chat/services/chat-service';
import { FileMenuPopup } from './FileMenuPopup';
import { PromptTemplateMenu } from './PromptTemplateMenu';
import { ChatInputSelectorMenu } from './ChatInputSelectorMenu';
import type {
	ChatInputAnchorPosition,
	ChatInputMenuPosition,
	ChatInputSelectorItem,
} from './chatInputSelectorUtils';
import { renderChatInputSelectorIcon } from './chatInputSelectorIcons';
import type { PromptTemplateEntry } from './promptTemplateUtils';

interface ChatInputOverlaysProps {
	service: ChatService;
	imageInputRef: RefObject<HTMLInputElement>;
	onImageInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
	templateMenuVisible: boolean;
	fileMenuVisible: boolean;
	secondaryMenuAnchor: ChatInputAnchorPosition | null;
	promptTemplateEntries: ReadonlyArray<PromptTemplateEntry>;
	onCloseTemplateMenu: () => void;
	onTemplateApplied: () => void;
	onCloseFileMenu: () => void;
	onSelectFile: (file: { path: string; name: string; extension: string }) => void;
	onSelectFolder: (folder: { path: string; name: string }) => void;
	selectorItems: ChatInputSelectorItem[];
	filterText: string;
	selectorVisible: boolean;
	selectedIndex: number;
	menuPosition: ChatInputMenuPosition;
	emptyStateText: string;
	onSelectSelectorItem: (item: ChatInputSelectorItem) => void;
	onCloseSelector: () => void;
}

export const ChatInputOverlays = ({
	service,
	imageInputRef,
	onImageInputChange,
	templateMenuVisible,
	fileMenuVisible,
	secondaryMenuAnchor,
	promptTemplateEntries,
	onCloseTemplateMenu,
	onTemplateApplied,
	onCloseFileMenu,
	onSelectFile,
	onSelectFolder,
	selectorItems,
	filterText,
	selectorVisible,
	selectedIndex,
	menuPosition,
	emptyStateText,
	onSelectSelectorItem,
	onCloseSelector,
}: ChatInputOverlaysProps) => {
	return (
		<>
			<input
				ref={imageInputRef}
				type="file"
				accept="image/*"
				multiple
				style={{ display: 'none' }}
				onChange={onImageInputChange}
			/>

			<PromptTemplateMenu
				visible={templateMenuVisible}
				service={service}
				anchorPosition={secondaryMenuAnchor}
				templates={promptTemplateEntries}
				onClose={onCloseTemplateMenu}
				onApplied={onTemplateApplied}
			/>

			<FileMenuPopup
				isOpen={fileMenuVisible}
				onClose={onCloseFileMenu}
				service={service}
				onSelectFile={onSelectFile}
				onSelectFolder={onSelectFolder}
				anchorPosition={secondaryMenuAnchor}
			/>

			<ChatInputSelectorMenu
				items={selectorItems}
				filterText={filterText}
				visible={selectorVisible}
				selectedIndex={selectedIndex}
				menuPosition={menuPosition}
				emptyStateText={emptyStateText}
				onSelect={onSelectSelectorItem}
				onClose={onCloseSelector}
				renderIcon={renderChatInputSelectorIcon}
			/>
		</>
	);
};