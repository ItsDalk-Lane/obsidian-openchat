import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { File, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { App, TFile, TFolder } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import {
	getFileSecondaryText,
	getFolderSecondaryText,
	searchInFile,
	getFilteredFiles,
	getFolderTree,
} from './fileMenuUtils';
import './FileMenuPopup.css';

interface FileMenuPopupProps {
	isOpen: boolean;
	onClose: () => void;
	onSelectFile: (file: TFile) => void;
	onSelectFolder: (folder: TFolder) => void;
	app: App;
	buttonRef: React.RefObject<HTMLSpanElement>;
}

type ViewType = 'menu' | 'fileSelector' | 'folderSelector';

export const FileMenuPopup = ({ isOpen, onClose, onSelectFile, onSelectFolder, app, buttonRef }: FileMenuPopupProps) => {
	const popupRef = useRef<HTMLDivElement>(null);
	const menuSearchInputRef = useRef<HTMLInputElement>(null);
	const [currentView, setCurrentView] = useState<ViewType>('menu');


	// 主菜单搜索状态
	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState<Array<{
		type: 'file' | 'folder';
		file?: TFile;
		folder?: TFolder;
		matches: string[]
	}>>();
	const [isSearching, setIsSearching] = useState(false);

	// 文件选择器状态
	const [fileSearchQuery, setFileSearchQuery] = useState('');
	const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

	// 文件夹选择器状态
	const [folderSearchQuery, setFolderSearchQuery] = useState('');
	const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']));

	// 点击外部关闭弹出菜单 - 恢复原始简单逻辑
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (popupRef.current && !popupRef.current.contains(event.target as Node) &&
				buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isOpen, onClose, buttonRef]);

	// 重置视图状态的useEffect
	useEffect(() => {
		if (isOpen) {
			setCurrentView('menu');
			setSearchQuery('');
			setSearchResults([]);
			setFileSearchQuery('');
			setSelectedFiles(new Set());
			setFolderSearchQuery('');
			setSelectedFolders(new Set());
		}
	}, [isOpen]);

	// 兜底：确保主菜单搜索框在 Obsidian 环境下稳定获得焦点
	useEffect(() => {
		if (!isOpen || currentView !== 'menu') return;
		const rafId = window.requestAnimationFrame(() => {
			menuSearchInputRef.current?.focus();
		});
		return () => window.cancelAnimationFrame(rafId);
	}, [isOpen, currentView]);

	// 搜索文件和文件夹功能
	useEffect(() => {
		if (currentView !== 'menu' || searchQuery.trim() === '') {
			setSearchResults([]);
			return;
		}

		const performSearch = async () => {
			setIsSearching(true);
			try {
				const query = searchQuery.toLowerCase();
				const results: Array<{ type: 'file' | 'folder'; file?: TFile; folder?: TFolder; matches: string[] }> = [];

				// 搜索文件夹
				const allFolders = app.vault.getAllLoadedFiles().filter(item =>
					item instanceof TFolder
				) as TFolder[];

				for (const folder of allFolders) {
					if (folder.name.toLowerCase().includes(query)) {
						results.push({
							type: 'folder',
							folder,
							matches: [localInstance.chat_file_match_folder_prefix.replace('{name}', folder.name)]
						});
					}
				}

				// 搜索文件
				const files = app.vault.getFiles();
				for (const file of files) {
					// 只搜索文件，跳过文件夹
					if (file.extension === undefined) {
						continue;
					}

					const cache = app.metadataCache.getFileCache(file);
					if (cache) {
						const matches = searchInFile(file, cache, query);
						if (matches.length > 0) {
							results.push({
								type: 'file',
								file,
								matches
							});
						}
					}
				}

				// 文件夹在前，文件在后
				setSearchResults(results.slice(0, 10));
			} catch (error) {
				DebugLogger.error('[FileMenuPopup] 搜索时出错', error);
			} finally {
				setIsSearching(false);
			}
		};

		const timeoutId = setTimeout(performSearch, 300);
		return () => clearTimeout(timeoutId);
	}, [searchQuery, app, currentView]);

	const toggleFolder = (folderPath: string) => {
		const newExpanded = new Set(expandedFolders);
		if (newExpanded.has(folderPath)) {
			newExpanded.delete(folderPath);
		} else {
			newExpanded.add(folderPath);
		}
		setExpandedFolders(newExpanded);
	};

	const handleFileToggle = (file: TFile) => {
		const newSelected = new Set(selectedFiles);
		if (newSelected.has(file.path)) {
			newSelected.delete(file.path);
		} else {
			newSelected.add(file.path);
		}
		setSelectedFiles(newSelected);
	};

	const handleFolderToggle = (folder: TFolder) => {
		const newSelected = new Set(selectedFolders);
		if (newSelected.has(folder.path)) {
			newSelected.delete(folder.path);
		} else {
			newSelected.add(folder.path);
		}
		setSelectedFolders(newSelected);
	};

	const handleFileSelect = () => {
		const files = getFilteredFiles(app, fileSearchQuery).filter(file => selectedFiles.has(file.path));
		files.forEach(file => onSelectFile(file)); // 支持多文件选择
		onClose();
	};

	const handleFolderSelect = () => {
		const allFolders = app.vault.getAllLoadedFiles().filter(item => item instanceof TFolder) as TFolder[];
		const folders = allFolders.filter(folder => selectedFolders.has(folder.path));
		folders.forEach(folder => onSelectFolder(folder)); // 支持多文件夹选择
		onClose();
	};

	const goBackToMenu = () => {
		setCurrentView('menu');
	};

	if (!isOpen) return null;

	// 计算弹出菜单位置
	const buttonRect = buttonRef.current?.getBoundingClientRect();

	// 使用 right 定位，这样当宽度扩展时菜单会向左扩展（保持右边缘位置）
	let rightPos;
	if (buttonRect) {
		// 计算距离屏幕右边距的距离
		rightPos = window.innerWidth - buttonRect.right;
	} else {
		rightPos = 16;
	}

	const popupStyle: React.CSSProperties = {
		position: 'fixed',
		bottom: buttonRect ? `${window.innerHeight - buttonRect.top + 8}px` : 'auto',
		right: `${rightPos}px`,
		zIndex: 1000,
		width: 'auto',
		minWidth: '320px',
		maxWidth: '500px',
		maxHeight: '500px',
		overflow: 'hidden'
	};

	return createPortal(
		<div ref={popupRef} className="file-menu-popup ff-native-style" style={popupStyle}>
			<div className="ff-popup-content">
				{currentView === 'menu' && (
					<>
						{/* 菜单选项 */}
						<div className="ff-menu-options">
							<div
								onClick={() => setCurrentView('fileSelector')}
								className="ff-menu-item"
							>
								<File className="ff-icon" />
								<span>选择文件</span>
							</div>
							<div
								onClick={() => setCurrentView('folderSelector')}
								className="ff-menu-item"
							>
								<Folder className="ff-icon" />
								<span>选择文件夹</span>
							</div>
						</div>

						{/* 分隔线 */}
						<div className="ff-divider"></div>

						{/* 搜索框 */}
						<div className="ff-search-container">
							<input
								ref={menuSearchInputRef}
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								onMouseDown={(e) => {
									// 某些 Obsidian/Workspace 全局监听会在 mousedown 阶段阻止默认聚焦，这里显式聚焦做兜底
									e.stopPropagation();
									menuSearchInputRef.current?.focus();
								}}
								onClick={(e) => {
									e.stopPropagation();
									menuSearchInputRef.current?.focus();
								}}
								placeholder={localInstance.chat_file_menu_search_placeholder}
								className="ff-search-input"
								autoFocus
							/>
						</div>

						{/* 搜索结果 */}
						{searchQuery && (
							<div className="ff-search-results">
								{isSearching ? (
									<div className="ff-empty-message">{localInstance.chat_file_menu_searching}</div>
								) : searchResults && searchResults.length > 0 ? (
									<div className="ff-results-list">
										{searchResults.map((result) => (
											<div
												key={result.type === 'folder' ? result.folder?.path : result.file?.path}
												onClick={() => {
													if (result.type === 'folder' && result.folder) {
														onSelectFolder(result.folder);
													} else if (result.file) {
														onSelectFile(result.file);
													}
													onClose();
												}}
												className="ff-result-item"
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
															<div className="ff-result-name">{result.file?.basename}</div>
															<div className="ff-result-path">
																{(() => {
																	if (!result.file) return '';
																	if (!result.matches || result.matches.length === 0) return getFileSecondaryText(result.file);

																	// 顶部已展示 basename，避免第二行再显示“文件名: xxx”造成重复
																	const filteredMatches = result.matches.filter((m) => !m.startsWith('文件名:'));
																	return (filteredMatches.length > 0 ? filteredMatches : [getFileSecondaryText(result.file)]).join(' · ');
																})()}
															</div>
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
				)}

				{currentView === 'fileSelector' && (
					<>
						{/* 返回按钮和标题 */}
						<div className="ff-header">
							<div className="ff-header-left">
								<button onClick={goBackToMenu} className="ff-back-btn">← {localInstance.chat_file_menu_back}</button>
								<span className="ff-title">{localInstance.select_file}</span>
							</div>
							{selectedFiles.size > 0 && (
								<div className="ff-header-actions">
									<button onClick={() => setSelectedFiles(new Set())} className="ff-btn-secondary">{localInstance.chat_file_menu_cancel}</button>
									<button onClick={handleFileSelect} className="ff-btn-primary">{localInstance.chat_file_menu_confirm} ({selectedFiles.size})</button>
								</div>
							)}
						</div>

						{/* 搜索框 */}
						<div className="ff-search-container">
							<input
								type="text"
								value={fileSearchQuery}
								onChange={(e) => setFileSearchQuery(e.target.value)}
								placeholder={localInstance.chat_file_menu_search_files_placeholder}
								className="ff-search-input"
								autoFocus
							/>
						</div>

						{/* 文件列表 */}
						<div className="ff-list-container">
							{getFilteredFiles(app, fileSearchQuery).length === 0 ? (
								<div className="ff-empty-message">
									{fileSearchQuery ? localInstance.chat_file_menu_no_files_match : localInstance.chat_file_menu_no_files}
								</div>
							) : (
								<div className="ff-list">
									{getFilteredFiles(app, fileSearchQuery).map(file => (
										<div
											key={file.path}
											onClick={() => handleFileToggle(file)}
											className={`ff-file-item ${selectedFiles.has(file.path) ? 'ff-selected' : ''}`}
										>
											<File className="ff-icon" />
											<div className="ff-file-info">
												<div className="ff-file-name">{file.name}</div>
												<div className="ff-file-path">{getFileSecondaryText(file)}</div>
											</div>
											{selectedFiles.has(file.path) && <div className="ff-check-mark">✓</div>}
										</div>
									))}
								</div>
							)}
						</div>

						{/* 底部提示 */}
						{selectedFiles.size === 0 && (
							<div className="ff-footer">{localInstance.chat_file_menu_choose_files}</div>
						)}
					</>
				)}

				{currentView === 'folderSelector' && (
					<>
						{/* 返回按钮和标题 */}
						<div className="ff-header">
							<div className="ff-header-left">
								<button onClick={goBackToMenu} className="ff-back-btn">← {localInstance.chat_file_menu_back}</button>
								<span className="ff-title">{localInstance.chat_file_menu_select_folder}</span>
							</div>
							{selectedFolders.size > 0 && (
								<div className="ff-header-actions">
									<button onClick={() => setSelectedFolders(new Set())} className="ff-btn-secondary">{localInstance.chat_file_menu_cancel}</button>
									<button onClick={handleFolderSelect} className="ff-btn-primary">{localInstance.chat_file_menu_confirm} ({selectedFolders.size})</button>
								</div>
							)}
						</div>

						{/* 搜索框 */}
						<div className="ff-search-container">
							<input
								type="text"
								value={folderSearchQuery}
								onChange={(e) => setFolderSearchQuery(e.target.value)}
								placeholder={localInstance.chat_file_menu_search_folders_placeholder}
								className="ff-search-input"
								autoFocus
							/>
						</div>

						{/* 文件夹列表 */}
						<div className="ff-list-container">
							{getFolderTree(app, folderSearchQuery, expandedFolders).length === 0 ? (
								<div className="ff-empty-message">
									{folderSearchQuery ? localInstance.chat_file_menu_no_folders_match : localInstance.chat_file_menu_no_folders}
								</div>
							) : (
								<div className="ff-list">
									{getFolderTree(app, folderSearchQuery, expandedFolders).map(({ folder, level, isExpanded }) => (
										<div key={folder.path}>
											<div 
												className={`ff-folder-item ${selectedFolders.has(folder.path) ? 'ff-selected' : ''}`}
												style={{ paddingLeft: `${8 + level * 16}px` }}
											>
												{/* 展开/折叠按钮区域 */}
												<div className="ff-folder-toggle">
													{folder.children.some(child => child instanceof TFolder) ? (
														<button
															onClick={(e) => {
																e.stopPropagation();
																toggleFolder(folder.path);
															}}
															className="ff-toggle-btn"
														>
															{isExpanded ? (
																<ChevronDown className="ff-icon-xs" />
															) : (
																<ChevronRight className="ff-icon-xs" />
															)}
														</button>
													) : (
														<div className="ff-toggle-spacer" />
													)}
												</div>

												{/* 文件夹内容区域 */}
												<div className="ff-folder-content" onClick={() => handleFolderToggle(folder)}>
													<Folder className="ff-icon" />
													<div className="ff-folder-info">
														<div className="ff-folder-name">{folder.name === '' ? '根目录' : folder.name}</div>
														<div className="ff-folder-path">{getFolderSecondaryText(folder)}</div>
													</div>
												</div>

												{/* 选中状态指示器 */}
												<div className="ff-check-container">
													{selectedFolders.has(folder.path) && <div className="ff-check-mark">✓</div>}
												</div>
											</div>
										</div>
									))}
								</div>
							)}
						</div>

						{/* 底部提示 */}
						{selectedFolders.size === 0 && (
							<div className="ff-footer">{localInstance.chat_file_menu_choose_folders}</div>
						)}
					</>
				)}
			</div>
		</div>,
		document.body
	);
};
