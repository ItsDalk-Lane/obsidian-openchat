import { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ChatService } from 'src/core/chat/services/chat-service';
import { getPromptTemplatePath } from 'src/utils/AIPathManager';
import { localInstance } from 'src/i18n/locals';
import { DebugLogger } from 'src/utils/DebugLogger';
import './TemplateSelector.css';

interface TemplateSelectorProps {
	visible: boolean;
	service: ChatService;
	onSelect: (templatePath: string) => void;
	onClose: () => void;
	inputValue: string;
}

export const TemplateSelector = ({ visible, service, onSelect, onClose, inputValue }: TemplateSelectorProps) => {
	const [templates, setTemplates] = useState<Array<{ value: string; label: string; description: string }>>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [filterText, setFilterText] = useState('');
	const listRef = useRef<HTMLDivElement>(null);

	// 获取模板列表
	useEffect(() => {
		if (!visible) return;

		const fetchTemplates = async () => {
			try {
				const obsidianApi = service.getObsidianApiProvider();
				const promptTemplateFolder = getPromptTemplatePath(service.getAiDataFolder());
				const fileEntries: Array<{ path: string; name: string }> = [];
				const visit = (folderPath: string) => {
					for (const entry of obsidianApi.listFolderEntries(folderPath)) {
						if (entry.kind === 'folder') {
							visit(entry.path);
							continue;
						}
						if (entry.path.endsWith('.md')) {
							fileEntries.push(entry);
						}
					}
				};
				visit(promptTemplateFolder);

				const templateOptions = await Promise.all(fileEntries.map(async (f) => {
					const content = await obsidianApi.readVaultFile(f.path);
					const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
					return {
						value: f.path,
						label: f.path.startsWith(`${promptTemplateFolder}/`)
							? f.path.substring(promptTemplateFolder.length + 1)
							: f.name,
						description: preview
					};
				}));
				
				setTemplates(templateOptions);
				setSelectedIndex(0);
			} catch (error) {
				DebugLogger.error('[TemplateSelector] 获取模板列表失败', error);
				service.getObsidianApiProvider().notify(localInstance.chat_template_list_failed);
			}
		};

		fetchTemplates();
	}, [service, visible]);

	// 过滤模板
	const filteredTemplates = useMemo(() => {
		if (!filterText) return templates;
		
		const lowerFilterText = filterText.toLowerCase();
		return templates.filter(template => 
			template.label.toLowerCase().includes(lowerFilterText) ||
			template.description.toLowerCase().includes(lowerFilterText)
		);
	}, [templates, filterText]);

	// 处理键盘事件
	useEffect(() => {
		if (!visible) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					setSelectedIndex(prev => Math.min(prev + 1, filteredTemplates.length - 1));
					break;
				case 'ArrowUp':
					e.preventDefault();
					setSelectedIndex(prev => Math.max(prev - 1, 0));
					break;
				case 'Enter':
					e.preventDefault();
					if (filteredTemplates.length > 0 && selectedIndex >= 0) {
						onSelect(filteredTemplates[selectedIndex].value);
					}
					break;
				case 'Escape':
					e.preventDefault();
					onClose();
					break;
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [visible, filteredTemplates, selectedIndex, onSelect, onClose]);

	// 滚动到选中项
	useEffect(() => {
		if (listRef.current && selectedIndex >= 0 && selectedIndex < filteredTemplates.length) {
			const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
			if (selectedItem) {
				selectedItem.scrollIntoView({ block: 'nearest' });
			}
		}
	}, [selectedIndex, filteredTemplates]);

	if (!visible) return null;

	const selectorContent = (
		<div className="template-selector-overlay" onClick={onClose}>
			<div className="template-selector" onClick={(e) => e.stopPropagation()}>
				<div className="template-selector-header">
					<h3>{localInstance.chat_template_selector_title}</h3>
					<button className="template-selector-close" onClick={onClose} title={localInstance.close}>×</button>
				</div>
				<div className="template-selector-search">
					<input
						type="text"
						placeholder={localInstance.chat_template_selector_search_placeholder}
						value={filterText}
						onChange={(e) => {
							setFilterText(e.target.value);
							setSelectedIndex(0);
						}}
						autoFocus
					/>
				</div>
				<div className="template-selector-list" ref={listRef}>
					{filteredTemplates.length === 0 ? (
						<div className="template-selector-empty">{localInstance.chat_template_selector_empty}</div>
					) : (
						filteredTemplates.map((template, index) => (
							<div
								key={template.value}
								className={`template-selector-item ${index === selectedIndex ? 'selected' : ''}`}
								onClick={() => onSelect(template.value)}
								onMouseEnter={() => setSelectedIndex(index)}
							>
								<div className="template-selector-item-name">{template.label}</div>
								<div className="template-selector-item-description">{template.description}</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);

	// 使用 Portal 将模板选择器渲染到 document.body，避免被父容器截断
	return createPortal(selectorContent, document.body);
};
