import { Zap } from 'lucide-react';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { ChatService } from 'src/core/chat/services/chat-service';
import { localInstance } from 'src/i18n/locals';
import {
	resolveMenuPositionFromAnchor,
	type ChatInputAnchorPosition,
} from './chatInputSelectorUtils';
import {
	filterPromptTemplateEntries,
	type PromptTemplateEntry,
} from './promptTemplateUtils';

interface PromptTemplateMenuProps {
	visible: boolean;
	service: ChatService;
	anchorPosition: ChatInputAnchorPosition | null;
	templates: ReadonlyArray<PromptTemplateEntry>;
	onClose: () => void;
	onApplied?: () => void;
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

export const PromptTemplateMenu = ({
	visible,
	service,
	anchorPosition,
	templates,
	onClose,
	onApplied,
}: PromptTemplateMenuProps) => {
	const [filterText, setFilterText] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);
	const selectedItemRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const filteredTemplates = useMemo(
		() => filterPromptTemplateEntries(templates, filterText),
		[filterText, templates],
	);

	const menuPosition = useMemo(
		() => anchorPosition
			? resolveMenuPositionFromAnchor(anchorPosition, {
				menuWidth: 360,
				menuHeight: 360,
			})
			: { top: 0, left: 0 },
		[anchorPosition],
	);

	useEffect(() => {
		if (!visible) {
			return;
		}

		setFilterText('');
		setSelectedIndex(0);
		const rafId = window.requestAnimationFrame(() => {
			inputRef.current?.focus();
		});

		return () => {
			window.cancelAnimationFrame(rafId);
		};
	}, [visible]);

	useEffect(() => {
		if (!selectedItemRef.current || !listRef.current) {
			return;
		}

		selectedItemRef.current.scrollIntoView({ block: 'nearest' });
	}, [selectedIndex]);

	useEffect(() => {
		if (!visible) {
			return;
		}

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (listRef.current?.contains(target) || inputRef.current?.contains(target)) {
				return;
			}

			onClose();
		};

		const timer = window.setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
		}, 100);

		return () => {
			window.clearTimeout(timer);
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [onClose, visible]);

	useEffect(() => {
		setSelectedIndex(0);
	}, [filterText]);

	const handleSelect = useCallback(
		async (entry: PromptTemplateEntry) => {
			await service.selectPromptTemplate(entry.path);
			onClose();
			onApplied?.();
		},
		[onApplied, onClose, service],
	);

	const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				setSelectedIndex((previous) => (
					previous < filteredTemplates.length - 1 ? previous + 1 : 0
				));
				return;
			case 'ArrowUp':
				event.preventDefault();
				setSelectedIndex((previous) => (
					previous > 0 ? previous - 1 : filteredTemplates.length - 1
				));
				return;
			case 'Enter':
			case 'Tab': {
				const selectedTemplate = filteredTemplates[selectedIndex];
				if (!selectedTemplate) {
					return;
				}

				event.preventDefault();
				void handleSelect(selectedTemplate);
				return;
			}
			case 'Escape':
				event.preventDefault();
				onClose();
				return;
			default:
				return;
		}
	}, [filteredTemplates, handleSelect, onClose, selectedIndex]);

	if (!visible || !anchorPosition) {
		return null;
	}

	return createPortal(
		<div
			className="slash-command-menu prompt-template-menu"
			style={{
				position: 'fixed',
				top: menuPosition.top,
				left: menuPosition.left,
			}}
		>
			<div className="prompt-template-menu__search">
				<input
					ref={inputRef}
					className="prompt-template-menu__search-input"
					type="text"
					value={filterText}
					onChange={(event) => setFilterText(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={localInstance.chat_template_selector_search_placeholder}
				/>
			</div>
			<div
				ref={listRef}
				className="prompt-template-menu__list"
				role="listbox"
			>
				{filteredTemplates.length === 0 ? (
					<div className="slash-command-empty">
						{localInstance.chat_template_selector_empty}
					</div>
				) : (
					filteredTemplates.map((template, index) => {
						const isSelected = index === selectedIndex;
						return (
							<div
								key={template.path}
								ref={isSelected ? selectedItemRef : undefined}
								className={`slash-command-item ${isSelected ? 'slash-command-item--selected' : ''}`}
								onClick={() => {
									void handleSelect(template);
								}}
								onMouseEnter={() => setSelectedIndex(index)}
								role="option"
								aria-selected={isSelected}
							>
								<div className="slash-command-item__icon">
									<Zap className="tw-size-4" />
								</div>
								<div className="slash-command-item__content">
									<div className="slash-command-item__header">
										<span className="slash-command-item__name">
											{highlightMatch(template.label, filterText)}
										</span>
										<span className="slash-command-item__type slash-command-item__type--prompt-template">
											{localInstance.chat_input_selector_type_template}
										</span>
									</div>
									<div className="slash-command-item__description">
										{highlightMatch(template.preview, filterText)}
									</div>
								</div>
							</div>
						);
					})
				)}
			</div>
		</div>,
		document.body,
	);
};