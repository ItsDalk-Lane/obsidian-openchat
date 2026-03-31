import type { RefObject } from 'react';
import { File, Folder } from 'lucide-react';
import { localInstance } from 'src/i18n/locals';
import {
	getFileSecondaryText,
	getFolderSecondaryText,
	type FileMenuSearchResult,
} from './fileMenuUtils';

interface FileMenuPopupMenuViewProps {
	selectedIndex: number;
	searchQuery: string;
	searchResults: ReadonlyArray<FileMenuSearchResult>;
	isSearching: boolean;
	onSearchQueryChange: (value: string) => void;
	onSelectIndex: (index: number) => void;
	onOpenFileSelector: () => void;
	onOpenFolderSelector: () => void;
	onSelectSearchResult: (result: FileMenuSearchResult) => void;
	menuSearchInputRef: RefObject<HTMLInputElement>;
	listRef: RefObject<HTMLDivElement>;
	activeItemRef: RefObject<HTMLDivElement>;
}

export const FileMenuPopupMenuView = ({
	selectedIndex,
	searchQuery,
	searchResults,
	isSearching,
	onSearchQueryChange,
	onSelectIndex,
	onOpenFileSelector,
	onOpenFolderSelector,
	onSelectSearchResult,
	menuSearchInputRef,
	listRef,
	activeItemRef,
}: FileMenuPopupMenuViewProps) => {
	return (
		<>
			<div ref={listRef} className="ff-menu-options">
				<div
					ref={selectedIndex === 0 && !searchQuery.trim() ? activeItemRef : undefined}
					onClick={onOpenFileSelector}
					onMouseEnter={() => onSelectIndex(0)}
					className={`ff-menu-item ${selectedIndex === 0 && !searchQuery.trim() ? 'ff-keyboard-active' : ''}`}
				>
					<File className="ff-icon" />
					<div className="ff-menu-content">
						<div className="ff-menu-title">{localInstance.select_file}</div>
						<div className="ff-menu-desc">{localInstance.chat_file_menu_choose_files}</div>
					</div>
				</div>
				<div
					ref={selectedIndex === 1 && !searchQuery.trim() ? activeItemRef : undefined}
					onClick={onOpenFolderSelector}
					onMouseEnter={() => onSelectIndex(1)}
					className={`ff-menu-item ${selectedIndex === 1 && !searchQuery.trim() ? 'ff-keyboard-active' : ''}`}
				>
					<Folder className="ff-icon" />
					<div className="ff-menu-content">
						<div className="ff-menu-title">{localInstance.chat_file_menu_select_folder}</div>
						<div className="ff-menu-desc">{localInstance.chat_file_menu_choose_folders}</div>
					</div>
				</div>
			</div>
			<div className="ff-divider"></div>
			<div className="ff-search-container">
				<input
					ref={menuSearchInputRef}
					type="text"
					value={searchQuery}
					onChange={(event) => onSearchQueryChange(event.target.value)}
					placeholder={localInstance.chat_file_menu_search_placeholder}
					className="ff-search-input"
				/>
			</div>
			{searchQuery && (
				<div ref={listRef} className="ff-search-results">
					{isSearching ? (
						<div className="ff-empty-message">{localInstance.chat_file_menu_searching}</div>
					) : searchResults.length > 0 ? (
						<div className="ff-results-list">
							{searchResults.map((result, index) => (
								<div
									key={result.type === 'folder' ? result.folder?.path : result.file?.path}
									ref={selectedIndex === index ? activeItemRef : undefined}
									onClick={() => onSelectSearchResult(result)}
									onMouseEnter={() => onSelectIndex(index)}
									className={`ff-result-item ${selectedIndex === index ? 'ff-keyboard-active' : ''}`}
								>
									{result.type === 'folder' ? (
										<>
											<Folder className="ff-icon" />
											<div className="ff-result-info">
												<div className="ff-result-name">{result.folder?.name}</div>
												{result.folder && (
													<div className="ff-result-path">{getFolderSecondaryText(result.folder)}</div>
												)}
											</div>
										</>
									) : (
										<>
											<File className="ff-icon" />
											<div className="ff-result-info">
												<div className="ff-result-name">{result.file?.basename ?? result.file?.name}</div>
												<div className="ff-result-path">{result.file ? getFileSecondaryText(result.file) : ''}</div>
											</div>
										</>
									)}
								</div>
							))}
						</div>
					) : (
						<div className="ff-empty-message">{localInstance.chat_file_menu_no_match}</div>
					)}
				</div>
			)}
		</>
	);
};