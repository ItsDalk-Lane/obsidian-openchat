import type { RefObject } from 'react';
import { File } from 'lucide-react';
import { localInstance } from 'src/i18n/locals';
import {
	getFileSecondaryText,
	type FileMenuFileItem,
} from './fileMenuUtils';

interface FileMenuPopupFileSelectorViewProps {
	selectedIndex: number;
	fileSearchQuery: string;
	selectedFiles: ReadonlySet<string>;
	filteredFiles: ReadonlyArray<FileMenuFileItem>;
	onBack: () => void;
	onClearSelection: () => void;
	onConfirm: () => void;
	onSearchChange: (value: string) => void;
	onToggleFile: (file: { path: string; name: string; extension: string }) => void;
	onSelectIndex: (index: number) => void;
	fileSearchInputRef: RefObject<HTMLInputElement>;
	listRef: RefObject<HTMLDivElement>;
	activeItemRef: RefObject<HTMLDivElement>;
}

export const FileMenuPopupFileSelectorView = ({
	selectedIndex,
	fileSearchQuery,
	selectedFiles,
	filteredFiles,
	onBack,
	onClearSelection,
	onConfirm,
	onSearchChange,
	onToggleFile,
	onSelectIndex,
	fileSearchInputRef,
	listRef,
	activeItemRef,
}: FileMenuPopupFileSelectorViewProps) => {
	return (
		<>
			<div className="ff-header">
				<div className="ff-header-left">
					<button onClick={onBack} className="ff-back-btn">← {localInstance.chat_file_menu_back}</button>
					<span className="ff-title">{localInstance.select_file}</span>
				</div>
				{selectedFiles.size > 0 && (
					<div className="ff-header-actions">
						<button onClick={onClearSelection} className="ff-btn-secondary">{localInstance.chat_file_menu_cancel}</button>
						<button onClick={onConfirm} className="ff-btn-primary">{localInstance.chat_file_menu_confirm} ({selectedFiles.size})</button>
					</div>
				)}
			</div>
			<div className="ff-search-container">
				<input
					ref={fileSearchInputRef}
					type="text"
					value={fileSearchQuery}
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder={localInstance.chat_file_menu_search_files_placeholder}
					className="ff-search-input"
				/>
			</div>
			<div ref={listRef} className="ff-list-container">
				{filteredFiles.length === 0 ? (
					<div className="ff-empty-message">
						{fileSearchQuery ? localInstance.chat_file_menu_no_files_match : localInstance.chat_file_menu_no_files}
					</div>
				) : (
					<div className="ff-list">
						{filteredFiles.map((file, index) => (
							<div
								key={file.path}
								ref={selectedIndex === index ? activeItemRef : undefined}
								onClick={() => onToggleFile({
									path: file.path,
									name: file.name,
									extension: file.extension,
								})}
								onMouseEnter={() => onSelectIndex(index)}
								className={`ff-file-item ${selectedFiles.has(file.path) ? 'ff-selected' : ''} ${selectedIndex === index ? 'ff-keyboard-active' : ''}`}
							>
								<File className="ff-icon" />
								<div className="ff-file-info">
									<div className="ff-file-name">{file.basename}</div>
									<div className="ff-file-path">{getFileSecondaryText(file)}</div>
								</div>
								{selectedFiles.has(file.path) && <div className="ff-check-mark">✓</div>}
							</div>
						))}
					</div>
				)}
			</div>
			{selectedFiles.size === 0 && (
				<div className="ff-footer">{localInstance.chat_file_menu_choose_files}</div>
			)}
		</>
	);
};