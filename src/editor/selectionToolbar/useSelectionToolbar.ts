import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
	useFloating,
	flip,
	shift,
	offset,
	autoUpdate,
	useDismiss,
	useInteractions,
	type ReferenceType
} from '@floating-ui/react';
import type { QuickAction, ChatSettings } from 'src/types/chat';
import type { SelectionInfo } from './SelectionToolbarExtension';

interface UseSelectionToolbarParams {
	visible: boolean;
	selectionInfo: SelectionInfo | null;
	settings: ChatSettings;
	onOpenChat: (selection: string) => void;
	onExecuteQuickAction: (quickAction: QuickAction, selection: string) => void;
	onClose: () => void;
}

const MENU_VIEWPORT_PADDING = 8;
const MENU_MIN_WIDTH = 120;
const MENU_MAX_WIDTH = 200;
const MENU_MAX_HEIGHT = 240;
const MENU_ITEM_ESTIMATED_HEIGHT = 34;

/**
 * 从 SelectionToolbar 提取的核心逻辑 hook
 */
export function useSelectionToolbar({
	visible,
	selectionInfo,
	settings,
	onOpenChat,
	onExecuteQuickAction,
	onClose,
}: UseSelectionToolbarParams) {
	const [openMenu, setOpenMenu] = useState<
		| { type: 'more' }
		| { type: 'group'; groupId: string }
		| null
	>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const toolbarRootRef = useRef<HTMLDivElement | null>(null);
	const moreButtonRef = useRef<HTMLButtonElement>(null);
	const dropdownMenuRef = useRef<HTMLDivElement>(null);
	const groupButtonRefs = useRef(new Map<string, HTMLButtonElement>());
	const groupMenuRefs = useRef(new Map<string, HTMLDivElement>());
	const groupSubmenuAnchorRefs = useRef(new Map<string, HTMLDivElement>());
	const groupSubmenuMenuRefs = useRef(new Map<string, HTMLDivElement>());
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [groupSubmenuPath, setGroupSubmenuPath] = useState<string[]>([]);

	// 截断按钮名称，最多显示4个字符
	const truncateName = (name: string): string => {
		return name.length > 4 ? name.slice(0, 4) : name;
	};

	// 每次工具栏重新显示时，重置下拉菜单为折叠状态并清除定时器
	useEffect(() => {
		if (visible) {
			setOpenMenu(null);
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current);
				closeTimerRef.current = null;
			}
		}
	}, [visible, selectionInfo]);

	const { toolbarItems, dropdownItems, quickActionsById } = useMemo(() => {
		const allQuickActions = (settings.quickActions || []).map(s => ({
			...s,
			isActionGroup: s.isActionGroup ?? false,
			children: s.children ?? []
		}));
		const byId = new Map(allQuickActions.map(s => [s.id, s] as const));
		const referenced = new Set<string>();
		for (const s of allQuickActions) {
			if (s.isActionGroup) {
				for (const childId of (s.children ?? [])) {
					referenced.add(childId);
				}
			}
		}
		const topLevel = allQuickActions
			.filter(s => !referenced.has(s.id))
			.sort((a, b) => a.order - b.order);
		const topLevelVisible = topLevel.filter(s => {
			if (!(s.showInToolbar ?? true)) {
				return false;
			}
			if (s.isActionGroup) {
				return (s.children ?? []).length > 0;
			}
			return true;
		});

		const maxButtons = settings.maxQuickActionButtons || 4;
		return {
			quickActionsById: byId,
			toolbarItems: topLevelVisible.slice(0, maxButtons),
			dropdownItems: topLevelVisible.slice(maxButtons)
		};
	}, [settings.quickActions, settings.maxQuickActionButtons]);

	const isMoreDropdownOpen = openMenu?.type === 'more';
	const openGroupId = openMenu?.type === 'group' ? openMenu.groupId : null;

	const groupHasVisibleQuickAction = useMemo(() => {
		const cache = new Map<string, boolean>();
		const compute = (groupId: string): boolean => {
			if (cache.has(groupId)) {
				return cache.get(groupId) ?? false;
			}
			const group = quickActionsById.get(groupId);
			if (!group || !group.isActionGroup) {
				cache.set(groupId, false);
				return false;
			}
			const stack: string[] = [groupId];
			const visited = new Set<string>();
			while (stack.length > 0) {
				const id = stack.pop();
				if (!id) {
					continue;
				}
				if (visited.has(id)) {
					continue;
				}
				visited.add(id);
				const g = quickActionsById.get(id);
				if (!g || !g.isActionGroup) {
					continue;
				}
				for (const childId of (g.children ?? [])) {
					const child = quickActionsById.get(childId);
					if (!child) {
						continue;
					}
					if (child.isActionGroup) {
						stack.push(child.id);
					} else if (child.showInToolbar) {
						cache.set(groupId, true);
						return true;
					}
				}
			}
			cache.set(groupId, false);
			return false;
		};
		return compute;
	}, [quickActionsById]);

	const getMenuChildren = useCallback((groupId: string) => {
		const group = quickActionsById.get(groupId);
		if (!group || !group.isActionGroup) {
			return [] as QuickAction[];
		}
		const result: QuickAction[] = [];
		for (const childId of (group.children ?? [])) {
			const child = quickActionsById.get(childId);
			if (!child) {
				continue;
			}
			if (child.isActionGroup) {
				if (groupHasVisibleQuickAction(child.id)) {
					result.push(child);
				}
				continue;
			}
			if (child.showInToolbar) {
				result.push(child);
			}
		}
		return result;
	}, [quickActionsById, groupHasVisibleQuickAction]);

	useEffect(() => {
		setGroupSubmenuPath([]);
	}, [openMenu?.type, openGroupId]);

	// 虚拟参考元素（基于选区坐标）
	const virtualReference = useMemo(() => {
		if (!selectionInfo) {
			return {
				getBoundingClientRect: () => ({
					x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0
				}),
				getClientRects: () => []
			};
		}

		const { coords } = selectionInfo;
		return {
			getBoundingClientRect: () => ({
				x: coords.left,
				y: coords.top,
				top: coords.top,
				left: coords.left,
				bottom: coords.bottom,
				right: coords.right,
				width: coords.right - coords.left,
				height: coords.bottom - coords.top
			}),
			getClientRects: () => [
				{
					x: coords.left,
					y: coords.top,
					top: coords.top,
					left: coords.left,
					bottom: coords.bottom,
					right: coords.right,
					width: coords.right - coords.left,
					height: coords.bottom - coords.top
				}
			]
		};
	}, [selectionInfo]);

	// 使用 floating-ui 进行定位
	const { refs, floatingStyles, context } = useFloating({
		open: visible,
		onOpenChange: (open) => {
			if (!open) {
				onClose();
			}
		},
		placement: 'top',
		middleware: [
			offset(8),
			flip({
				fallbackPlacements: ['bottom', 'top-start', 'top-end', 'bottom-start', 'bottom-end']
			}),
			shift({ padding: 8 })
		],
		whileElementsMounted: autoUpdate
	});

	// 设置虚拟参考元素
	useEffect(() => {
		refs.setReference(virtualReference as ReferenceType);
	}, [refs, virtualReference]);

	// 处理点击外部关闭
	const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown' });
	const { getFloatingProps } = useInteractions([dismiss]);

	// 处理点击 AI Chat 按钮
	const handleChatClick = useCallback(() => {
		if (selectionInfo) {
			onOpenChat(selectionInfo.text);
		}
	}, [selectionInfo, onOpenChat]);

	// 处理点击操作按钮
	const handleQuickActionClick = useCallback((quickAction: QuickAction) => {
		if (selectionInfo) {
			onExecuteQuickAction(quickAction, selectionInfo.text);
		}
	}, [selectionInfo, onExecuteQuickAction]);

	// 处理下拉菜单切换
	const toggleDropdown = useCallback((e: ReactMouseEvent) => {
		e.stopPropagation();
		setOpenMenu(prev => (prev?.type === 'more' ? null : { type: 'more' }));
	}, []);

	// 处理下拉菜单项点击
	const handleDropdownQuickActionClick = useCallback((quickAction: QuickAction, e: ReactMouseEvent) => {
		e.stopPropagation();
		setOpenMenu(null);
		if (selectionInfo) {
			onExecuteQuickAction(quickAction, selectionInfo.text);
		}
	}, [selectionInfo, onExecuteQuickAction]);

	// 清除关闭定时器
	const clearCloseTimer = useCallback(() => {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);

	const scheduleClose = useCallback(() => {
		if (closeTimerRef.current) {
			return;
		}
		closeTimerRef.current = setTimeout(() => {
			setOpenMenu(null);
			setGroupSubmenuPath([]);
		}, 100);
	}, []);

	const computeMenuShouldOpenUp = useCallback((estimatedMenuHeight: number) => {
		const rect = toolbarRootRef.current?.getBoundingClientRect();
		if (!rect) {
			return false;
		}
		const spaceBelow = window.innerHeight - rect.bottom;
		const spaceAbove = rect.top;
		if (spaceBelow >= estimatedMenuHeight + MENU_VIEWPORT_PADDING) {
			return false;
		}
		return spaceAbove >= estimatedMenuHeight + MENU_VIEWPORT_PADDING;
	}, []);

	const getEstimatedMenuHeight = useCallback((itemCount: number) => {
		const estimatedHeight = itemCount * MENU_ITEM_ESTIMATED_HEIGHT + 8;
		const safeHeight = Math.max(MENU_ITEM_ESTIMATED_HEIGHT, estimatedHeight);
		return Math.min(MENU_MAX_HEIGHT, safeHeight);
	}, []);

	const clampToViewport = useCallback((value: number, min: number, max: number) => {
		if (max < min) {
			return min;
		}
		return Math.min(Math.max(value, min), max);
	}, []);

	const moreMenuShouldOpenUp = isMoreDropdownOpen
		? computeMenuShouldOpenUp(getEstimatedMenuHeight(Math.max(1, dropdownItems.length)))
		: false;

	const handleMoreButtonMouseEnter = useCallback(() => {
		clearCloseTimer();
		setOpenMenu({ type: 'more' });
	}, [clearCloseTimer]);

	const handleDropdownMenuMouseEnter = useCallback(() => {
		clearCloseTimer();
	}, [clearCloseTimer]);

	const handleDropdownMouseLeave = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
		const relatedTarget = e.relatedTarget as Node;
		const isMovingToButton = moreButtonRef.current?.contains(relatedTarget);
		const isMovingToMenu = dropdownMenuRef.current?.contains(relatedTarget);
		if (!isMovingToButton && !isMovingToMenu) {
			scheduleClose();
		}
	}, [scheduleClose]);

	// 悬停关闭
	useEffect(() => {
		if (!openMenu) {
			return;
		}
		const onPointerMove = (e: PointerEvent) => {
			const target = e.target as Node | null;
			if (!target) {
				return;
			}
			const isInEl = (el: HTMLElement | null | undefined) => !!el && el.contains(target);

			if (openMenu.type === 'more') {
				if (isInEl(moreButtonRef.current) || isInEl(dropdownMenuRef.current)) {
					clearCloseTimer();
					return;
				}
				for (const submenuGroupId of groupSubmenuPath) {
					const submenuEl = groupSubmenuMenuRefs.current.get(submenuGroupId) ?? null;
					if (isInEl(submenuEl)) {
						clearCloseTimer();
						return;
					}
				}
				scheduleClose();
				return;
			}

			const groupId = openMenu.groupId;
			const btn = groupButtonRefs.current.get(groupId) ?? null;
			const menu = groupMenuRefs.current.get(groupId) ?? null;
			if (isInEl(btn) || isInEl(menu)) {
				clearCloseTimer();
				return;
			}
			for (const submenuGroupId of groupSubmenuPath) {
				const submenuEl = groupSubmenuMenuRefs.current.get(submenuGroupId) ?? null;
				if (isInEl(submenuEl)) {
					clearCloseTimer();
					return;
				}
			}
			scheduleClose();
		};

		window.addEventListener('pointermove', onPointerMove, true);
		return () => window.removeEventListener('pointermove', onPointerMove, true);
	}, [openMenu, groupSubmenuPath, clearCloseTimer, scheduleClose]);

	// 点击外部关闭下拉菜单
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (toolbarRootRef.current && !toolbarRootRef.current.contains(e.target as Node)) {
				setOpenMenu(null);
			}
		};

		if (openMenu) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	}, [openMenu]);

	return {
		// floating
		refs,
		floatingStyles,
		getFloatingProps,
		toolbarRootRef,
		// items
		toolbarItems,
		dropdownItems,
		getMenuChildren,
		// menu state
		openMenu,
		setOpenMenu,
		openGroupId,
		isMoreDropdownOpen,
		groupSubmenuPath,
		setGroupSubmenuPath,
		moreMenuShouldOpenUp,
		// refs
		dropdownRef,
		moreButtonRef,
		dropdownMenuRef,
		groupButtonRefs,
		groupMenuRefs,
		groupSubmenuAnchorRefs,
		groupSubmenuMenuRefs,
		// handlers
		handleChatClick,
		handleQuickActionClick,
		toggleDropdown,
		handleDropdownQuickActionClick,
		handleMoreButtonMouseEnter,
		handleDropdownMenuMouseEnter,
		handleDropdownMouseLeave,
		clearCloseTimer,
		// computed
		computeMenuShouldOpenUp,
		getEstimatedMenuHeight,
		clampToViewport,
		// constants
		MENU_MAX_WIDTH,
		MENU_MIN_WIDTH,
		MENU_VIEWPORT_PADDING,
		// utils
		truncateName,
	};
}
