import type { RefObject } from 'react';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { localInstance } from 'src/i18n/locals';
import type { FolderTreeItem } from './fileMenuUtils';

interface FileMenuPopupFolderSelectorViewProps {
	selectedIndex: number;
	folderSearchQuery: string;
	selectedFolders: ReadonlySet<string>;
	folderTreeItems: ReadonlyArray<FolderTreeItem>;
	onBack: () => void;
	onClearSelection: () => void;
	onConfirm: () => void;
	onSearchChange: (value: string) => void;
	onToggleFolder: (folder: { path: string; name: string }) => void;
	onToggleFolderExpand: (folderPath: string) => void;
	onSelectIndex: (index: number) => void;
	folderSearchInputRef: RefObject<HTMLInputElement>;
	listRef: RefObject<HTMLDivElement>;
	activeItemRef: RefObject<HTMLDivElement>;
}

export const FileMenuPopupFolderSelectorView = ({
	selectedIndex,
	folderSearchQuery,
	selectedFolders,
	folderTreeItems,
	onBack,
	onClearSelection,
	onConfirm,
	onSearchChange,
	onToggleFolder,
	onToggleFolderExpand,
	onSelectIndex,
	folderSearchInputRef,
	listRef,
	activeItemRef,
}: FileMenuPopupFolderSelectorViewProps) => {
	return (
		<>
			<div className="ff-header">
				<div className="ff-header-left">
					<button onClick={onBack} className="ff-back-btn">← {localInstance.chat_file_menu_back}</button>
					<span className="ff-title">{localInstance.chat_file_menu_select_folder}</span>
				</div>
				{selectedFolders.size > 0 && (
					<div className="ff-header-actions">
						<button onClick={onClearSelection} className="ff-btn-secondary">{localInstance.chat_file_menu_cancel}</button>
						<button onClick={onConfirm} className="ff-btn-primary">{localInstance.chat_file_menu_confirm} ({selectedFolders.size})</button>
					</div>
				)}
			</div>
			<div className="ff-search-container">
				<input
					ref={folderSearchInputRef}
					type="text"
					value={folderSearchQuery}
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder={localInstance.chat_file_menu_search_folders_placeholder}
					className="ff-search-input"
				/>
			</div>
			<div ref={listRef} className="ff-list-container">
				{folderTreeItems.length === 0 ? (
					<div className="ff-empty-message">
						{folderSearchQuery ? localInstance.chat_file_menu_no_folders_match : localInstance.chat_file_menu_no_folders}
					</div>
				) : (
					<div className="ff-list">
						{folderTreeItems.map(({ folder, level, isExpanded }, index) => (
							<div key={folder.path}>
								<div
									ref={selectedIndex === index ? activeItemRef : undefined}
									className={`ff-folder-item ${selectedFolders.has(folder.path) ? 'ff-selected' : ''} ${selectedIndex === index ? 'ff-keyboard-active' : ''}`}
									style={{ paddingLeft: `${8 + level * 16}px` }}
									onMouseEnter={() => onSelectIndex(index)}
								>
									<div className="ff-folder-toggle">
										{folder.hasChildren ? (
											<button
												onClick={(event) => {
													event.stopPropagation();
													onToggleFolderExpand(folder.path);
												}}
												className="ff-toggle-btn"
											>
												{isExpanded ? <ChevronDown className="ff-icon-xs" /> : <ChevronRight className="ff-icon-xs" />}
											</button>
										) : (
											<div className="ff-toggle-spacer" />
										)}
									</div>
									<div
										className="ff-folder-content"
										onClick={() => onToggleFolder({ path: folder.path, name: folder.name })}
									>
										<Folder className="ff-icon" />
										<div className="ff-folder-name">{folder.name === '' ? '根目录' : folder.name}</div>
									</div>
									<div className="ff-check-container">
										{selectedFolders.has(folder.path) && <div className="ff-check-mark">✓</div>}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
			{selectedFolders.size === 0 && (
				<div className="ff-footer">{localInstance.chat_file_menu_choose_folders}</div>
			)}
		</>
	);
};