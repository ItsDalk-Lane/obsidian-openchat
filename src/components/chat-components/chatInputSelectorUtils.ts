export interface ChatInputSelectorItem<T = unknown> {
	id: string;
	name: string;
	description: string;
	kind: string;
	typeLabel: string;
	keywords?: string[];
	showWhenEmpty?: boolean;
	showWhenSearching?: boolean;
	sortPriority?: number;
	payload: T;
}

export interface ChatInputTriggerSource<T = unknown> {
	key: string;
	trigger: string;
	items: ChatInputSelectorItem<T>[];
	emptyText: string;
	noMatchText: string;
	hideWhenEmpty?: boolean;
	hideWhenNoMatch?: boolean;
}

export interface ChatInputTriggerMatch {
	sourceKey: string;
	trigger: string;
	startIndex: number;
	filterText: string;
}

export interface ChatInputMenuPosition {
	top: number;
	left: number;
}

export interface ChatInputAnchorPosition {
	top: number;
	left: number;
	lineHeight: number;
}

export interface ChatInputMenuLayoutOptions {
	menuWidth?: number;
	menuHeight?: number;
	offsetY?: number;
	viewportPadding?: number;
}

const isValidTriggerPrefix = (character: string): boolean =>
	character === '' || character === ' ' || character === '\n';

export const findTriggerMatch = (
	text: string,
	cursorIndex: number,
	source: Pick<ChatInputTriggerSource, 'key' | 'trigger'>,
): ChatInputTriggerMatch | null => {
	const textBeforeCursor = text.slice(0, cursorIndex);
	const startIndex = textBeforeCursor.lastIndexOf(source.trigger);

	if (startIndex === -1) {
		return null;
	}

	const prefix = startIndex > 0 ? textBeforeCursor[startIndex - 1] ?? '' : '';
	if (!isValidTriggerPrefix(prefix)) {
		return null;
	}

	const filterText = textBeforeCursor.slice(startIndex + source.trigger.length);
	if (filterText.includes(' ') || filterText.includes('\n')) {
		return null;
	}

	return {
		sourceKey: source.key,
		trigger: source.trigger,
		startIndex,
		filterText,
	};
};

export const findLatestTriggerMatch = (
	text: string,
	cursorIndex: number,
	sources: ReadonlyArray<Pick<ChatInputTriggerSource, 'key' | 'trigger'>>,
): ChatInputTriggerMatch | null => {
	let latestMatch: ChatInputTriggerMatch | null = null;

	for (const source of sources) {
		const match = findTriggerMatch(text, cursorIndex, source);
		if (!match) {
			continue;
		}
		if (!latestMatch || match.startIndex > latestMatch.startIndex) {
			latestMatch = match;
		}
	}

	return latestMatch;
};

export const filterChatInputSelectorItems = <T>(
	items: ReadonlyArray<ChatInputSelectorItem<T>>,
	filterText: string,
): ChatInputSelectorItem<T>[] => {
	const normalizedFilter = filterText.toLowerCase();
	const isSearching = normalizedFilter.length > 0;
	const visibleItems = items.filter((item) => {
		if (isSearching) {
			return item.showWhenSearching !== false;
		}

		return item.showWhenEmpty !== false;
	});

	if (!isSearching) {
		return [...visibleItems].sort((left, right) => {
			const priorityDiff = (left.sortPriority ?? Number.MAX_SAFE_INTEGER)
				- (right.sortPriority ?? Number.MAX_SAFE_INTEGER);
			if (priorityDiff !== 0) {
				return priorityDiff;
			}

			return 0;
		});
	}

	return visibleItems
		.filter((item) => {
			const haystacks = [item.name, item.description, ...(item.keywords ?? [])];
			return haystacks.some((entry) => entry.toLowerCase().includes(normalizedFilter));
		})
		.sort((left, right) => {
			const priorityDiff = (left.sortPriority ?? Number.MAX_SAFE_INTEGER)
				- (right.sortPriority ?? Number.MAX_SAFE_INTEGER);
			if (priorityDiff !== 0) {
				return priorityDiff;
			}

			const leftStartsWith = left.name.toLowerCase().startsWith(normalizedFilter);
			const rightStartsWith = right.name.toLowerCase().startsWith(normalizedFilter);

			if (leftStartsWith && !rightStartsWith) {
				return -1;
			}
			if (!leftStartsWith && rightStartsWith) {
				return 1;
			}

			return left.name.localeCompare(right.name);
		});
};

export const resolveSelectorEmptyStateText = (
	source: Pick<ChatInputTriggerSource, 'items' | 'emptyText' | 'noMatchText'>,
	filteredItemCount: number,
): string => (source.items.length === 0 || filteredItemCount === 0)
	? (source.items.length === 0 ? source.emptyText : source.noMatchText)
	: '';

const TEXTAREA_MIRROR_PROPERTIES = [
	'boxSizing',
	'width',
	'height',
	'overflowX',
	'overflowY',
	'borderTopWidth',
	'borderRightWidth',
	'borderBottomWidth',
	'borderLeftWidth',
	'borderStyle',
	'paddingTop',
	'paddingRight',
	'paddingBottom',
	'paddingLeft',
	'fontStyle',
	'fontVariant',
	'fontWeight',
	'fontStretch',
	'fontSize',
	'lineHeight',
	'fontFamily',
	'textAlign',
	'textTransform',
	'textIndent',
	'textDecoration',
	'letterSpacing',
	'wordSpacing',
	'tabSize',
	'MozTabSize',
] as const;

const createTextareaMirror = (
	textarea: HTMLTextAreaElement,
): { mirror: HTMLDivElement; marker: HTMLSpanElement; lineHeight: number } => {
	const style = window.getComputedStyle(textarea);
	const mirror = document.createElement('div');
	for (const property of TEXTAREA_MIRROR_PROPERTIES) {
		mirror.style[property] = style[property];
	}
	mirror.style.position = 'absolute';
	mirror.style.visibility = 'hidden';
	mirror.style.pointerEvents = 'none';
	mirror.style.whiteSpace = 'pre-wrap';
	mirror.style.wordWrap = 'break-word';
	mirror.style.overflowWrap = 'break-word';
	mirror.style.top = '0';
	mirror.style.left = '-9999px';
	mirror.style.width = `${textarea.getBoundingClientRect().width}px`;

	const marker = document.createElement('span');
	marker.textContent = '.';
	marker.setAttribute('data-chat-input-marker', 'true');
	mirror.appendChild(marker);

	const lineHeight = Number.parseFloat(style.lineHeight)
		|| Number.parseFloat(style.fontSize)
		|| 20;

	return { mirror, marker, lineHeight };
};

export const calculateTextareaAnchorPosition = (
	textarea: HTMLTextAreaElement,
	text: string,
	anchorIndex: number,
): ChatInputAnchorPosition => {
	const textareaRect = textarea.getBoundingClientRect();
	const safeIndex = Math.max(0, Math.min(anchorIndex, text.length));
	const { mirror, marker, lineHeight } = createTextareaMirror(textarea);
	const beforeAnchor = text.slice(0, safeIndex);
	marker.textContent = text.slice(safeIndex, safeIndex + 1) || '.';
	mirror.insertBefore(document.createTextNode(beforeAnchor), marker);
	document.body.appendChild(mirror);

	const mirrorRect = mirror.getBoundingClientRect();
	const markerRect = marker.getBoundingClientRect();
	const top = textareaRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop;
	const left = textareaRect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;

	document.body.removeChild(mirror);

	return {
		top,
		left,
		lineHeight,
	};
};

export const resolveMenuPositionFromAnchor = (
	anchorPosition: ChatInputAnchorPosition,
	options?: ChatInputMenuLayoutOptions,
): ChatInputMenuPosition => {
	const menuWidth = options?.menuWidth ?? 320;
	const menuHeight = options?.menuHeight ?? 280;
	const offsetY = options?.offsetY ?? 8;
	const viewportPadding = options?.viewportPadding ?? 12;
	const preferredTop = anchorPosition.top + anchorPosition.lineHeight + offsetY;
	const canOpenBelow = preferredTop + menuHeight <= window.innerHeight - viewportPadding;
	const top = canOpenBelow
		? preferredTop
		: Math.max(viewportPadding, anchorPosition.top - menuHeight - offsetY);
	const left = Math.min(
		Math.max(viewportPadding, anchorPosition.left),
		window.innerWidth - menuWidth - viewportPadding,
	);

	return {
		top,
		left,
	};
};

export const calculateSelectorMenuPosition = (
	textarea: HTMLTextAreaElement,
	text: string,
	anchorIndex: number,
	options?: ChatInputMenuLayoutOptions,
): ChatInputMenuPosition => {
	return resolveMenuPositionFromAnchor(
		calculateTextareaAnchorPosition(textarea, text, anchorIndex),
		options,
	);
};

export const replaceTriggerText = (
	text: string,
	cursorIndex: number,
	match: Pick<ChatInputTriggerMatch, 'startIndex'>,
	replacement = '',
): { value: string; selectionStart: number } => {
	const before = text.slice(0, match.startIndex);
	const after = text.slice(cursorIndex);
	const value = `${before}${replacement}${after}`;
	const selectionStart = before.length + replacement.length;

	return {
		value,
		selectionStart,
	};
};