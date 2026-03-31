import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type RefObject,
} from 'react';
import {
	calculateTextareaAnchorPosition,
	calculateSelectorMenuPosition,
	filterChatInputSelectorItems,
	findLatestTriggerMatch,
	resolveSelectorEmptyStateText,
	type ChatInputAnchorPosition,
	type ChatInputMenuPosition,
	type ChatInputSelectorItem,
	type ChatInputTriggerMatch,
	type ChatInputTriggerSource,
} from './chatInputSelectorUtils';

export interface UseChatInputTriggerMenuReturn<T = unknown> {
	activeMatch: ChatInputTriggerMatch | null;
	activeSourceKey: string | null;
	filterText: string;
	selectedIndex: number;
	setSelectedIndex: (value: number | ((previous: number) => number)) => void;
	anchorPosition: ChatInputAnchorPosition | null;
	menuPosition: ChatInputMenuPosition;
	visible: boolean;
	filteredItems: ChatInputSelectorItem<T>[];
	emptyStateText: string;
	closeMenu: () => void;
}

const buildDismissKey = (
	match: ChatInputTriggerMatch | null,
): string | null => (match
	? `${match.sourceKey}:${match.startIndex}:${match.filterText}`
	: null);

export function useChatInputTriggerMenu<T = unknown>(
	value: string,
	cursorIndex: number,
	isGenerating: boolean,
	textareaRef: RefObject<HTMLTextAreaElement>,
	sources: ReadonlyArray<ChatInputTriggerSource<T>>,
): UseChatInputTriggerMenuReturn<T> {
	const [activeMatch, setActiveMatch] = useState<ChatInputTriggerMatch | null>(null);
	const [activeSourceKey, setActiveSourceKey] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [anchorPosition, setAnchorPosition] = useState<ChatInputAnchorPosition | null>(null);
	const [menuPosition, setMenuPosition] = useState<ChatInputMenuPosition>({ top: 0, left: 0 });
	const [visible, setVisible] = useState(false);
	const [dismissedKey, setDismissedKey] = useState<string | null>(null);

	const activeSource = useMemo(
		() => sources.find((source) => source.key === activeSourceKey) ?? null,
		[sources, activeSourceKey],
	);

	const filteredItems = useMemo(
		() => activeSource && activeMatch
			? filterChatInputSelectorItems(activeSource.items, activeMatch.filterText)
			: [],
		[activeSource, activeMatch],
	);

	const emptyStateText = useMemo(
		() => activeSource
			? resolveSelectorEmptyStateText(activeSource, filteredItems.length)
			: '',
		[activeSource, filteredItems.length],
	);

	useEffect(() => {
		if (isGenerating) {
			setVisible(false);
			setActiveMatch(null);
			setActiveSourceKey(null);
			setAnchorPosition(null);
			return;
		}

		const textarea = textareaRef.current;
		if (!textarea) {
			return;
		}

		const nextMatch = findLatestTriggerMatch(value, cursorIndex, sources);
		if (!nextMatch) {
			setVisible(false);
			setActiveMatch(null);
			setActiveSourceKey(null);
			setAnchorPosition(null);
			setDismissedKey(null);
			return;
		}

		const nextSource = sources.find((source) => source.key === nextMatch.sourceKey);
		if (!nextSource) {
			setVisible(false);
			setActiveMatch(null);
			setActiveSourceKey(null);
			setAnchorPosition(null);
			return;
		}

		const nextDismissKey = buildDismissKey(nextMatch);
		if (nextDismissKey && nextDismissKey === dismissedKey) {
			setVisible(false);
			setActiveMatch(nextMatch);
			setActiveSourceKey(nextSource.key);
			return;
		}

		const nextFilteredItems = filterChatInputSelectorItems(
			nextSource.items,
			nextMatch.filterText,
		);
		const shouldHide =
			(nextSource.hideWhenEmpty && nextSource.items.length === 0)
			|| (nextSource.hideWhenNoMatch && nextFilteredItems.length === 0);

		if (shouldHide) {
			setVisible(false);
			setActiveMatch(null);
			setActiveSourceKey(null);
			setAnchorPosition(null);
			return;
		}

		const nextAnchorPosition = calculateTextareaAnchorPosition(
			textarea,
			value,
			nextMatch.startIndex,
		);
		setAnchorPosition(nextAnchorPosition);
		setMenuPosition(calculateSelectorMenuPosition(textarea, value, nextMatch.startIndex));
		setActiveMatch(nextMatch);
		setActiveSourceKey(nextSource.key);
		const didMatchChange = !activeMatch
			|| activeMatch.sourceKey !== nextMatch.sourceKey
			|| activeMatch.startIndex !== nextMatch.startIndex
			|| activeMatch.filterText !== nextMatch.filterText;
		if (didMatchChange) {
			setSelectedIndex(0);
		}
		setVisible(true);
	}, [activeMatch, cursorIndex, dismissedKey, isGenerating, sources, textareaRef, value]);

	useEffect(() => {
		if (!visible || !activeMatch) {
			return;
		}

		const textarea = textareaRef.current;
		if (!textarea) {
			return;
		}

		const recalculatePosition = () => {
			const nextAnchorPosition = calculateTextareaAnchorPosition(
				textarea,
				value,
				activeMatch.startIndex,
			);
			setAnchorPosition(nextAnchorPosition);
			setMenuPosition(calculateSelectorMenuPosition(textarea, value, activeMatch.startIndex));
		};

		textarea.addEventListener('scroll', recalculatePosition);
		window.addEventListener('resize', recalculatePosition);

		return () => {
			textarea.removeEventListener('scroll', recalculatePosition);
			window.removeEventListener('resize', recalculatePosition);
		};
	}, [activeMatch, textareaRef, value, visible]);

	const closeMenu = useCallback(() => {
		setDismissedKey(buildDismissKey(activeMatch));
		setVisible(false);
	}, [activeMatch]);

	return {
		activeMatch,
		activeSourceKey,
		filterText: activeMatch?.filterText ?? '',
		selectedIndex,
		setSelectedIndex,
		anchorPosition,
		menuPosition,
		visible,
		filteredItems,
		emptyStateText,
		closeMenu,
	};
}