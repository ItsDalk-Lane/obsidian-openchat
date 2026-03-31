import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';
import { DebugLogger } from 'src/utils/DebugLogger';
import type { ChatService } from 'src/core/chat/services/chat-service';
import type {
	ChatAttachmentFileInput,
	ChatAttachmentFolderInput,
} from 'src/domains/chat/service-attachment-selection';
import {
	resolveMenuPositionFromAnchor,
	type ChatInputAnchorPosition,
} from './chatInputSelectorUtils';
import {
	getFilteredFiles,
	getFolderTree,
	searchVaultEntries,
	type FileMenuSearchResult,
} from './fileMenuUtils';
import { FileMenuPopupFileSelectorView } from './FileMenuPopupFileSelectorView';
import { FileMenuPopupFolderSelectorView } from './FileMenuPopupFolderSelectorView';
import { FileMenuPopupMenuView } from './FileMenuPopupMenuView';
import './FileMenuPopup.css';

interface FileMenuPopupProps {
	isOpen: boolean;
	onClose: () => void;
	service: ChatService;
	onSelectFile: (file: ChatAttachmentFileInput) => void;
	onSelectFolder: (folder: ChatAttachmentFolderInput) => void;
	anchorPosition: ChatInputAnchorPosition | null;
}

type ViewType = 'menu' | 'fileSelector' | 'folderSelector';

export const FileMenuPopup = ({
	isOpen,
	onClose,
	service,
	onSelectFile,
	onSelectFolder,
	anchorPosition,
}: FileMenuPopupProps) => {
	const popupRef = useRef<HTMLDivElement>(null);
	const menuSearchInputRef = useRef<HTMLInputElement>(null);
	const fileSearchInputRef = useRef<HTMLInputElement>(null);
	const folderSearchInputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const activeItemRef = useRef<HTMLDivElement>(null);
	const obsidianApi = service.getObsidianApiProvider();
	const [currentView, setCurrentView] = useState<ViewType>('menu');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState<FileMenuSearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [fileSearchQuery, setFileSearchQuery] = useState('');
	const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
	const [folderSearchQuery, setFolderSearchQuery] = useState('');
	const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']));

	const filteredFiles = useMemo(
		() => getFilteredFiles(obsidianApi, fileSearchQuery),
		[fileSearchQuery, obsidianApi],
	);
	const folderTreeItems = useMemo(
		() => getFolderTree(obsidianApi, folderSearchQuery, expandedFolders),
		[expandedFolders, folderSearchQuery, obsidianApi],
	);
	const popupPosition = useMemo(
		() => anchorPosition
			? resolveMenuPositionFromAnchor(anchorPosition, {
				menuWidth: 380,
				menuHeight: 420,
			})
			: { top: 12, left: 12 },
		[anchorPosition],
	);

	const resetPopupState = useCallback(() => {
		setCurrentView('menu');
		setSelectedIndex(0);
		setSearchQuery('');
		setSearchResults([]);
		setFileSearchQuery('');
		setSelectedFiles(new Set());
		setFolderSearchQuery('');
		setSelectedFolders(new Set());
		setExpandedFolders(new Set(['/']));
	}, []);

	const focusCurrentInput = useCallback(() => {
		window.requestAnimationFrame(() => {
			if (currentView === 'menu') {
				menuSearchInputRef.current?.focus();
				return;
			}
			if (currentView === 'fileSelector') {
				fileSearchInputRef.current?.focus();
				return;
			}

			folderSearchInputRef.current?.focus();
		});
	}, [currentView]);

	const handleSelectSearchResult = useCallback((result: FileMenuSearchResult) => {
		if (result.type === 'folder' && result.folder) {
			onSelectFolder({
				path: result.folder.path,
				name: result.folder.name,
			});
		} else if (result.file) {
			onSelectFile({
				path: result.file.path,
				name: result.file.name,
				extension: result.file.extension,
			});
		}

		onClose();
	}, [onClose, onSelectFile, onSelectFolder]);

	const activateSelectedItem = useCallback(() => {
		if (currentView === 'menu') {
			if (searchQuery.trim()) {
				const result = searchResults[selectedIndex];
				if (!result) {
					return;
				}

				handleSelectSearchResult(result);
				return;
			}

			if (selectedIndex === 0) {
				setCurrentView('fileSelector');
				return;
			}

			if (selectedIndex === 1) {
				setCurrentView('folderSelector');
			}
			return;
		}

		if (currentView === 'fileSelector') {
			const file = filteredFiles[selectedIndex];
			if (!file) {
				return;
			}

			onSelectFile({
				path: file.path,
				name: file.name,
				extension: file.extension,
			});
			onClose();
			return;
		}

		const folderItem = folderTreeItems[selectedIndex]?.folder;
		if (!folderItem) {
			return;
		}

		onSelectFolder({
			path: folderItem.path,
			name: folderItem.name,
		});
		onClose();
	}, [
		currentView,
		filteredFiles,
		folderTreeItems,
		handleSelectSearchResult,
		onClose,
		onSelectFile,
		onSelectFolder,
		searchQuery,
		searchResults,
		selectedIndex,
	]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		resetPopupState();
	}, [isOpen, resetPopupState]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		focusCurrentInput();
	}, [currentView, focusCurrentInput, isOpen]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handleClickOutside = (event: MouseEvent) => {
			if (popupRef.current?.contains(event.target as Node)) {
				return;
			}

			onClose();
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isOpen, onClose]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		if (currentView !== 'menu' || searchQuery.trim() === '') {
			setSearchResults([]);
			setIsSearching(false);
			return;
		}

		const performSearch = () => {
			setIsSearching(true);
			try {
				setSearchResults(searchVaultEntries(obsidianApi, searchQuery));
			} catch (error) {
				DebugLogger.error('[FileMenuPopup] 搜索时出错', error);
				setSearchResults([]);
			} finally {
				setIsSearching(false);
			}
		};

		const timeoutId = window.setTimeout(performSearch, 200);
		return () => window.clearTimeout(timeoutId);
	}, [currentView, isOpen, obsidianApi, searchQuery]);

	useEffect(() => {
		setSelectedIndex(0);
	}, [currentView, searchQuery, searchResults, fileSearchQuery, folderSearchQuery]);

	useEffect(() => {
		if (!activeItemRef.current || !listRef.current) {
			return;
		}

		activeItemRef.current.scrollIntoView({ block: 'nearest' });
	}, [selectedIndex]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const getActiveItemCount = (): number => {
			if (currentView === 'menu') {
				return searchQuery.trim() ? searchResults.length : 2;
			}

			if (currentView === 'fileSelector') {
				return filteredFiles.length;
			}

			return folderTreeItems.length;
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			const itemCount = getActiveItemCount();
			switch (event.key) {
				case 'ArrowDown':
					if (itemCount === 0) {
						return;
					}
					event.preventDefault();
					setSelectedIndex((previous) => (
						previous < itemCount - 1 ? previous + 1 : 0
					));
					return;
				case 'ArrowUp':
					if (itemCount === 0) {
						return;
					}
					event.preventDefault();
					setSelectedIndex((previous) => (
						previous > 0 ? previous - 1 : itemCount - 1
					));
					return;
				case 'Enter':
				case 'Tab':
					if (itemCount === 0) {
						return;
					}
					event.preventDefault();
					activateSelectedItem();
					return;
				case 'Escape':
					event.preventDefault();
					onClose();
					return;
				default:
					return;
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [
		activateSelectedItem,
		currentView,
		filteredFiles,
		folderTreeItems,
		isOpen,
		onClose,
		searchQuery,
		searchResults,
	]);

	const toggleFolder = useCallback((folderPath: string) => {
		setExpandedFolders((previous) => {
			const next = new Set(previous);
			if (next.has(folderPath)) {
				next.delete(folderPath);
			} else {
				next.add(folderPath);
			}
			return next;
		});
	}, []);

	const handleFileToggle = useCallback((file: ChatAttachmentFileInput) => {
		setSelectedFiles((previous) => {
			const next = new Set(previous);
			if (next.has(file.path)) {
				next.delete(file.path);
			} else {
				next.add(file.path);
			}
			return next;
		});
	}, []);

	const handleFolderToggle = useCallback((folder: ChatAttachmentFolderInput) => {
		setSelectedFolders((previous) => {
			const next = new Set(previous);
			if (next.has(folder.path)) {
				next.delete(folder.path);
			} else {
				next.add(folder.path);
			}
			return next;
		});
	}, []);

	const handleConfirmFiles = useCallback(() => {
		filteredFiles
			.filter((file) => selectedFiles.has(file.path))
			.forEach((file) => {
				onSelectFile({
					path: file.path,
					name: file.name,
					extension: file.extension,
				});
			});
		onClose();
	}, [filteredFiles, onClose, onSelectFile, selectedFiles]);

	const handleConfirmFolders = useCallback(() => {
		folderTreeItems
			.map((item) => item.folder)
			.filter((folder) => selectedFolders.has(folder.path))
			.forEach((folder) => {
				onSelectFolder({
					path: folder.path,
					name: folder.name,
				});
			});
		onClose();
	}, [folderTreeItems, onClose, onSelectFolder, selectedFolders]);

	if (!isOpen || !anchorPosition) {
		return null;
	}

	const popupStyle: CSSProperties = {
		position: 'fixed',
		top: popupPosition.top,
		left: popupPosition.left,
		zIndex: 1000,
		width: 'min(380px, calc(100vw - 24px))',
		minWidth: '320px',
		maxWidth: '420px',
		maxHeight: '500px',
		overflow: 'hidden',
	};

	return createPortal(
		<div ref={popupRef} className="file-menu-popup ff-native-style" style={popupStyle}>
			<div className="ff-popup-content">
				{currentView === 'menu' && (
					<FileMenuPopupMenuView
						selectedIndex={selectedIndex}
						searchQuery={searchQuery}
						searchResults={searchResults}
						isSearching={isSearching}
						onSearchQueryChange={setSearchQuery}
						onSelectIndex={setSelectedIndex}
						onOpenFileSelector={() => setCurrentView('fileSelector')}
						onOpenFolderSelector={() => setCurrentView('folderSelector')}
						onSelectSearchResult={handleSelectSearchResult}
						menuSearchInputRef={menuSearchInputRef}
						listRef={listRef}
						activeItemRef={activeItemRef}
					/>
				)}

				{currentView === 'fileSelector' && (
					<FileMenuPopupFileSelectorView
						selectedIndex={selectedIndex}
						fileSearchQuery={fileSearchQuery}
						selectedFiles={selectedFiles}
						filteredFiles={filteredFiles}
						onBack={() => setCurrentView('menu')}
						onClearSelection={() => setSelectedFiles(new Set())}
						onConfirm={handleConfirmFiles}
						onSearchChange={setFileSearchQuery}
						onToggleFile={handleFileToggle}
						onSelectIndex={setSelectedIndex}
						fileSearchInputRef={fileSearchInputRef}
						listRef={listRef}
						activeItemRef={activeItemRef}
					/>
				)}

				{currentView === 'folderSelector' && (
					<FileMenuPopupFolderSelectorView
						selectedIndex={selectedIndex}
						folderSearchQuery={folderSearchQuery}
						selectedFolders={selectedFolders}
						folderTreeItems={folderTreeItems}
						onBack={() => setCurrentView('menu')}
						onClearSelection={() => setSelectedFolders(new Set())}
						onConfirm={handleConfirmFolders}
						onSearchChange={setFolderSearchQuery}
						onToggleFolder={handleFolderToggle}
						onToggleFolderExpand={toggleFolder}
						onSelectIndex={setSelectedIndex}
						folderSearchInputRef={folderSearchInputRef}
						listRef={listRef}
						activeItemRef={activeItemRef}
					/>
				)}
			</div>
		</div>,
		document.body,
	);
};