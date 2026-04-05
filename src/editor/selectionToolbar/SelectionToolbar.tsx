import React from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, ChevronDown, Edit, Copy, Scissors } from 'lucide-react';
import type { ChatSettings, QuickAction } from 'src/domains/chat/types';
import type { SelectionInfo } from './SelectionToolbarExtension';
import { localInstance } from 'src/i18n/locals';
import { useSelectionToolbar } from './useSelectionToolbar';
import './SelectionToolbar.css';

interface SelectionToolbarProps {
	visible: boolean;
	selectionInfo: SelectionInfo | null;
	settings: ChatSettings;
	onOpenChat: (selection: string) => void;
	onModify: () => void;
	onCopy: () => void;
	onCut: () => void;
	onExecuteQuickAction: (quickAction: QuickAction, selection: string) => void;
	onClose: () => void;
}

export const SelectionToolbar = ({
	visible,
	selectionInfo,
	settings,
	onOpenChat,
	onModify,
	onCopy,
	onCut,
	onExecuteQuickAction,
	onClose,
}: SelectionToolbarProps) => {
	const {
		refs,
		floatingStyles,
		getFloatingProps,
		toolbarRootRef,
		toolbarItems,
		dropdownItems,
		getMenuChildren,
		openMenu,
		setOpenMenu,
		openGroupId,
		isMoreDropdownOpen,
		groupSubmenuPath,
		setGroupSubmenuPath,
		moreMenuShouldOpenUp,
		dropdownRef,
		moreButtonRef,
		dropdownMenuRef,
		groupButtonRefs,
		groupMenuRefs,
		groupSubmenuAnchorRefs,
		groupSubmenuMenuRefs,
		handleChatClick,
		handleQuickActionClick,
		toggleDropdown,
		handleDropdownQuickActionClick,
		handleMoreButtonMouseEnter,
		handleDropdownMenuMouseEnter,
		handleDropdownMouseLeave,
		clearCloseTimer,
		computeMenuShouldOpenUp,
		getEstimatedMenuHeight,
		clampToViewport,
		MENU_MAX_WIDTH,
		MENU_MIN_WIDTH,
		MENU_VIEWPORT_PADDING,
		truncateName,
	} = useSelectionToolbar({ visible, selectionInfo, settings, onOpenChat, onExecuteQuickAction, onClose });

	// 如果不可见，不渲染
	if (!visible || !selectionInfo) {
		return null;
	}

	const toolbarContent = (
		<div
			ref={(node) => {
				refs.setFloating(node);
					(toolbarRootRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
			}}
			className="selection-toolbar"
			style={{ ...floatingStyles, gap: '1px' }}
			{...getFloatingProps()}
		>
			{/* 左侧固定按钮：修改、对话、复制、剪切 */}
			<button
				className="selection-toolbar-btn"
				onClick={() => onModify()}
				title={localInstance.modify}
			>
				<Edit size={14} />
			</button>

			<button
				className="selection-toolbar-btn"
				onClick={() => handleChatClick()}
				title={localInstance.chat}
			>
				<MessageSquare size={14} />
			</button>

			<button
				className="selection-toolbar-btn"
				onClick={() => onCopy()}
				title={localInstance.copy}
			>
				<Copy size={14} />
			</button>

			<button
				className="selection-toolbar-btn"
				onClick={() => onCut()}
				title={localInstance.cut_to_clipboard}
			>
				<Scissors size={14} />
			</button>

			{/* 操作按钮 */}
			{toolbarItems.map((item) => {
				if (!item.isActionGroup) {
					return (
						<button
							key={item.id}
							className="selection-toolbar-btn"
							onClick={() => handleQuickActionClick(item)}
							title={item.name}
						>
							<span>{truncateName(item.name)}</span>
						</button>
					);
				}

				const group = item;
				const groupChildren = getMenuChildren(group.id);
				const groupMenuShouldOpenUp = openGroupId === group.id
					? computeMenuShouldOpenUp(getEstimatedMenuHeight(Math.max(1, groupChildren.length)))
					: false;
				return (
					<div
						key={group.id}
					className="selection-toolbar-dropdown"
					>
						<button
							ref={(el) => {
								if (el) {
									groupButtonRefs.current.set(group.id, el);
								} else {
									groupButtonRefs.current.delete(group.id);
								}
							}}
							className="selection-toolbar-btn selection-toolbar-btn-group"
							onClick={(e) => {
								e.stopPropagation();
								clearCloseTimer();
								setOpenMenu(prev =>
									(prev?.type === 'group' && prev.groupId === group.id)
										? null
										: { type: 'group', groupId: group.id }
								);
							}}
							onMouseEnter={() => {
								clearCloseTimer();
								setGroupSubmenuPath([]);
								setOpenMenu({ type: 'group', groupId: group.id });
							}}
							title={group.name}
						>
							<span>{truncateName(group.name)}⇣</span>
						</button>

						{openGroupId === group.id && (
							<div
								className={`selection-toolbar-dropdown-menu ${groupMenuShouldOpenUp ? 'selection-toolbar-dropdown-menu-up' : ''}`}
								ref={(el) => {
									if (el) {
										groupMenuRefs.current.set(group.id, el);
									} else {
										groupMenuRefs.current.delete(group.id);
									}
								}}
								onMouseEnter={handleDropdownMenuMouseEnter}
							>
								{(() => {
									const children = openGroupId ? getMenuChildren(openGroupId) : [];
									if (children.length === 0) {
										return (
											<div className="selection-toolbar-dropdown-empty">
												{localInstance.selection_toolbar_no_more_actions}
											</div>
										);
									}
									return children.map((child) => {
										if (child.isActionGroup) {
											return (
												<div
													key={child.id}
													className="selection-toolbar-dropdown-item selection-toolbar-dropdown-item-group selection-toolbar-dropdown-item-submenu"
													ref={(el) => {
														if (el) {
															groupSubmenuAnchorRefs.current.set(child.id, el);
														} else {
															groupSubmenuAnchorRefs.current.delete(child.id);
														}
													}}
													onMouseEnter={() => {
													clearCloseTimer();
													setGroupSubmenuPath([child.id]);
												}}
												>
													<span>{child.name}</span>
													<span className="selection-toolbar-dropdown-item-submenu-arrow">
														<ChevronDown size={12} />
													</span>
												</div>
											);
										}
										return (
											<div
												key={child.id}
												className="selection-toolbar-dropdown-item"
												onMouseEnter={() => setGroupSubmenuPath([])}
												onClick={(e) => handleDropdownQuickActionClick(child, e)}
											>
												{child.name}
											</div>
										);
									});
								})()}
							</div>
						)}
					</div>
				);
			})}

			{/* 操作组子菜单（级联浮层，独立出现） */}
			{openMenu && groupSubmenuPath.length > 0 && (
				<>
					{groupSubmenuPath.map((submenuGroupId, levelIndex) => {
						const anchorEl = groupSubmenuAnchorRefs.current.get(submenuGroupId);
						if (!anchorEl) {
							return null;
						}
						const rect = anchorEl.getBoundingClientRect();
						const submenuChildren = getMenuChildren(submenuGroupId);
						const estimatedWidth = MENU_MAX_WIDTH;
						const estimatedHeight = getEstimatedMenuHeight(Math.max(1, submenuChildren.length));
						const gap = 2;
						const spaceRight = window.innerWidth - rect.right;
						const spaceLeft = rect.left;
						const shouldOpenLeft = spaceRight < MENU_MIN_WIDTH && spaceLeft > spaceRight;
						const preferredLeft = shouldOpenLeft ? rect.left - estimatedWidth - gap : rect.right + gap;
						const left = clampToViewport(
							preferredLeft,
							MENU_VIEWPORT_PADDING,
							window.innerWidth - estimatedWidth - MENU_VIEWPORT_PADDING
						);
						const top = clampToViewport(
							rect.top,
							MENU_VIEWPORT_PADDING,
							window.innerHeight - estimatedHeight - MENU_VIEWPORT_PADDING
						);
						const panel = (
							<div
								className="selection-toolbar-dropdown-menu selection-toolbar-dropdown-menu-submenu"
								style={{ left, top }}
								ref={(el) => {
									if (el) {
										groupSubmenuMenuRefs.current.set(submenuGroupId, el);
									} else {
										groupSubmenuMenuRefs.current.delete(submenuGroupId);
									}
								}}
								onMouseEnter={() => {
									clearCloseTimer();
								}}
							>
								{submenuChildren.length > 0 ? (
									submenuChildren.map((child) => {
										if (child.isActionGroup) {
											return (
												<div
													key={child.id}
													className="selection-toolbar-dropdown-item selection-toolbar-dropdown-item-group selection-toolbar-dropdown-item-submenu"
													ref={(el) => {
														if (el) {
															groupSubmenuAnchorRefs.current.set(child.id, el);
														} else {
															groupSubmenuAnchorRefs.current.delete(child.id);
														}
													}}
													onMouseEnter={() => {
														clearCloseTimer();
														setGroupSubmenuPath((prev) => {
															const next = prev.slice(0, levelIndex + 1);
															next[levelIndex + 1] = child.id;
															return next;
														});
													}}
												>
													<span>{child.name}</span>
													<span className="selection-toolbar-dropdown-item-submenu-arrow">
														<ChevronDown size={12} />
													</span>
												</div>
											);
										}
										return (
											<div
												key={child.id}
												className="selection-toolbar-dropdown-item"
												onMouseEnter={() => {
													setGroupSubmenuPath((prev) => prev.slice(0, levelIndex + 1));
												}}
												onClick={(e) => handleDropdownQuickActionClick(child, e)}
											>
												{child.name}
											</div>
										);
									})
								) : (
									<div className="selection-toolbar-dropdown-empty">
										{localInstance.selection_toolbar_no_more_actions}
									</div>
								)}
							</div>
						);

						return createPortal(panel, document.body);
					})}
				</>
			)}

			{/* 下拉菜单按钮 */}
			{(dropdownItems.length > 0 || toolbarItems.length === 0) && (
				<div
					className="selection-toolbar-dropdown"
					ref={dropdownRef}
					onMouseLeave={handleDropdownMouseLeave}
				>
					<button
						ref={moreButtonRef}
						className="selection-toolbar-btn selection-toolbar-btn-more"
						onClick={toggleDropdown}
						onMouseEnter={handleMoreButtonMouseEnter}
						title={localInstance.selection_toolbar_more}
					>
						<ChevronDown size={14} />
					</button>

					{isMoreDropdownOpen && (
						<div
							className={`selection-toolbar-dropdown-menu ${moreMenuShouldOpenUp ? 'selection-toolbar-dropdown-menu-up' : ''}`}
							ref={dropdownMenuRef}
							onMouseEnter={handleDropdownMenuMouseEnter}
						>
							{dropdownItems.length > 0 ? (
								dropdownItems.map((item) => {
									if (item.isActionGroup) {
										return (
											<div
												key={item.id}
												className="selection-toolbar-dropdown-item selection-toolbar-dropdown-item-group selection-toolbar-dropdown-item-submenu"
												ref={(el) => {
													if (el) {
														groupSubmenuAnchorRefs.current.set(item.id, el);
													} else {
														groupSubmenuAnchorRefs.current.delete(item.id);
													}
												}}
												onMouseEnter={() => {
													clearCloseTimer();
													setGroupSubmenuPath([item.id]);
												}}
											>
												<span>{item.name}</span>
												<span className="selection-toolbar-dropdown-item-submenu-arrow">
													<ChevronDown size={12} />
												</span>
											</div>
										);
									}
									return (
										<div
											key={item.id}
											className="selection-toolbar-dropdown-item"
											onMouseEnter={() => setGroupSubmenuPath([])}
											onClick={(e) => handleDropdownQuickActionClick(item, e)}
									>
										{item.name}
									</div>
									);
								})
							) : (
								<div className="selection-toolbar-dropdown-empty">
									{localInstance.selection_toolbar_no_more_actions}
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);

	// 使用 Portal 渲染到 document.body
	return createPortal(toolbarContent, document.body);
};

