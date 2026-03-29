import type { ProviderSettings, Vendor } from 'src/types/provider';
import type { MultiModelMode } from 'src/core/chat/types/multiModel';
import { availableVendors } from 'src/domains/settings/config-ai-runtime-vendors';
import { getCapabilityDisplayText } from 'src/LLMProviders/utils';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getProviderModelDisplayName } from 'src/utils/aiProviderMetadata';
import { localInstance } from 'src/i18n/locals';

interface ModelSelectorProps {
	providers: ProviderSettings[];
	value: string;
	onChange: (tag: string) => void;
	selectedModels?: string[];
	onModelToggle?: (tag: string) => void;
	multiModelMode?: MultiModelMode;
	onModeChange?: (mode: MultiModelMode) => void;
}

interface VendorGroup {
	vendorName: string;
	vendor: Vendor;
	providers: ProviderSettings[];
}

export const ModelSelector = ({
	providers, value, onChange,
	selectedModels = [], onModelToggle,
	multiModelMode = 'single', onModeChange,
}: ModelSelectorProps) => {
	const VIEWPORT_PADDING = 8;
	const PROVIDER_LIST_MIN_WIDTH = 200;
	const PROVIDER_LIST_MAX_WIDTH = 250;
	const PROVIDER_LIST_MAX_HEIGHT = 400;
	const PROVIDER_ITEM_ESTIMATED_HEIGHT = 40;
	const TOGGLE_ROW_HEIGHT = 40;
	const SUBMENU_MIN_WIDTH = 250;
	const SUBMENU_MAX_WIDTH = 350;
	const SUBMENU_MAX_HEIGHT = 400;
	const SUBMENU_TITLE_HEIGHT = 45;
	const SUBMENU_ITEM_ESTIMATED_HEIGHT = 38;

	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const providerListRef = useRef<HTMLDivElement>(null);
	const submenuRef = useRef<HTMLDivElement>(null);
	const vendorItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const [dropdownDirection, setDropdownDirection] = useState<'up' | 'down'>('down');
	const [, forcePositionUpdate] = useState(0);
	const [hoveredVendor, setHoveredVendor] = useState<string | null>(null);
	const clearHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isMultiMode = multiModelMode === 'compare';
	// 将 providers 按 vendor 分组
	const vendorGroups = useMemo(() => {
		const grouped = new Map<string, VendorGroup>();
		providers.forEach(p => {
			const vendor = availableVendors.find(v => v.name === p.vendor);
			if (vendor && !grouped.has(vendor.name)) {
				grouped.set(vendor.name, { vendorName: vendor.name, vendor, providers: [] });
			}
			if (vendor) grouped.get(vendor.name)?.providers.push(p);
		});
		return Array.from(grouped.values());
	}, [providers]);

	const clearHoveredVendor = useCallback(() => {
		if (clearHoverTimerRef.current) clearTimeout(clearHoverTimerRef.current);
		clearHoverTimerRef.current = setTimeout(() => setHoveredVendor(null), 100);
	}, []);
	const setHoveredVendorWithCancel = useCallback((vendorName: string | null) => {
		if (clearHoverTimerRef.current) {
			clearTimeout(clearHoverTimerRef.current);
			clearHoverTimerRef.current = null;
		}
		setHoveredVendor(vendorName);
	}, []);

	// 处理模式切换（单选 ↔ 多选）
	const handleToggleMode = useCallback(() => {
		const newMode: MultiModelMode = isMultiMode ? 'single' : 'compare';
		if (newMode === 'compare') {
			if (value && onModelToggle) onModelToggle(value);
		} else {
			if (selectedModels.length > 0) onChange(selectedModels[0]);
		}
		onModeChange?.(newMode);
	}, [isMultiMode, value, selectedModels, onChange, onModelToggle, onModeChange]);

	// 处理模型选择（根据模式不同行为）
	const handleModelSelect = useCallback((tag: string) => {
		if (isMultiMode) {
			onModelToggle?.(tag);
		} else {
			onChange(tag);
			setIsOpen(false);
			setHoveredVendor(null);
		}
	}, [isMultiMode, onChange, onModelToggle]);

	const clampToViewport = useCallback(
		(val: number, min: number, max: number) => {
			if (max < min) return min;
			return Math.min(Math.max(val, min), max);
		}, []);

	const getProviderListEstimatedHeight = useCallback(() => {
		const toggleHeight = onModeChange ? TOGGLE_ROW_HEIGHT : 0;
		const estimated = toggleHeight + vendorGroups.length * PROVIDER_ITEM_ESTIMATED_HEIGHT + 8;
		return Math.min(PROVIDER_LIST_MAX_HEIGHT, Math.max(PROVIDER_ITEM_ESTIMATED_HEIGHT, estimated));
	}, [vendorGroups, onModeChange]);

	const updateDropdownDirection = useCallback(() => {
		if (!dropdownRef.current) return;
		const rect = dropdownRef.current.getBoundingClientRect();
		const listHeight = getProviderListEstimatedHeight();
		const spaceBelow = window.innerHeight - rect.bottom;
		const spaceAbove = rect.top;
		const shouldOpenUp = spaceBelow < listHeight && spaceAbove > spaceBelow;
		setDropdownDirection(shouldOpenUp ? 'up' : 'down');
	}, [getProviderListEstimatedHeight]);

	const getButtonPosition = useCallback(() => {
		if (!dropdownRef.current) return { left: 0, top: 0 };
		const rect = dropdownRef.current.getBoundingClientRect();
		const renderedListHeight = providerListRef.current?.getBoundingClientRect().height;
		const listHeight = renderedListHeight ?? getProviderListEstimatedHeight();
		const left = clampToViewport(
			rect.left, VIEWPORT_PADDING,
			window.innerWidth - PROVIDER_LIST_MAX_WIDTH - VIEWPORT_PADDING
		);
		if (dropdownDirection === 'up') {
			const top = clampToViewport(
				rect.top - 2 - listHeight, VIEWPORT_PADDING,
				window.innerHeight - listHeight - VIEWPORT_PADDING
			);
			return { left, top };
		}
		const top = clampToViewport(
			rect.bottom + 2, VIEWPORT_PADDING,
			window.innerHeight - listHeight - VIEWPORT_PADDING
		);
		return { left, top };
	}, [dropdownDirection, getProviderListEstimatedHeight, clampToViewport]);

	const getSubmenuPosition = useCallback(() => {
		if (!hoveredVendor) return { left: 0, top: 0 };
		const vendorEl = vendorItemRefs.current.get(hoveredVendor);
		if (!vendorEl) return { left: 0, top: 0 };
		const rect = vendorEl.getBoundingClientRect();
		const group = vendorGroups.find(item => item.vendorName === hoveredVendor);
		const providerCount = group?.providers.length ?? 0;
		const estimatedSubmenuHeight = Math.min(
			SUBMENU_MAX_HEIGHT,
			SUBMENU_TITLE_HEIGHT + providerCount * SUBMENU_ITEM_ESTIMATED_HEIGHT + 8
		);
		const renderedSubmenuHeight = submenuRef.current?.getBoundingClientRect().height;
		const submenuHeight = renderedSubmenuHeight ?? estimatedSubmenuHeight;
		const spaceRight = window.innerWidth - rect.right;
		const spaceLeft = rect.left;
		const shouldOpenLeft = spaceRight < SUBMENU_MIN_WIDTH && spaceLeft > spaceRight;
		const preferredLeft = shouldOpenLeft
			? rect.left - SUBMENU_MAX_WIDTH - 4 : rect.right + 4;
		const left = clampToViewport(
			preferredLeft, VIEWPORT_PADDING,
			window.innerWidth - SUBMENU_MAX_WIDTH - VIEWPORT_PADDING
		);
		const top = clampToViewport(
			rect.top, VIEWPORT_PADDING,
			window.innerHeight - submenuHeight - VIEWPORT_PADDING
		);
		return { left, top };
	}, [hoveredVendor, vendorGroups, clampToViewport]);

	useEffect(() => {
		if (!isOpen) return;
		updateDropdownDirection();
		const handleResize = () => updateDropdownDirection();
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [isOpen, updateDropdownDirection]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			const isInDropdown = dropdownRef.current?.contains(target);
			const isInProviderList = providerListRef.current?.contains(target);
			const isInSubmenu = submenuRef.current?.contains(target);
			if (!isInDropdown && !isInProviderList && !isInSubmenu) {
				setIsOpen(false);
				setHoveredVendor(null);
			}
		};
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	}, [isOpen]);

	useEffect(() => {
		const handleScroll = () => { setIsOpen(false); setHoveredVendor(null); };
		if (isOpen) {
			document.addEventListener('scroll', handleScroll);
			window.addEventListener('scroll', handleScroll);
			return () => {
				document.removeEventListener('scroll', handleScroll);
				window.removeEventListener('scroll', handleScroll);
			};
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) vendorItemRefs.current.clear();
		return () => {
			if (clearHoverTimerRef.current) clearTimeout(clearHoverTimerRef.current);
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const frameId = window.requestAnimationFrame(() => {
			forcePositionUpdate(prev => prev + 1);
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [isOpen, hoveredVendor, vendorGroups.length]);

	if (!providers.length) {
		return <div className="tw-text-sm tw-text-error">尚未配置AI模型</div>;
	}
	const currentProvider = providers.find(p => p.tag === value);
	const vendor = currentProvider
		? availableVendors.find(v => v.name === currentProvider.vendor)
		: null;
	const capabilityIcons = currentProvider && vendor
		? getCapabilityDisplayText(vendor, currentProvider.options) : '';

	// 根据模式决定按钮显示文本
	const displayText = isMultiMode
		? (selectedModels.length > 0
			? localInstance.selected_models.replace('{count}', String(selectedModels.length))
			: localInstance.no_models_selected)
		: (currentProvider ? getProviderModelDisplayName(currentProvider, providers) : 'Select model');
	return (
		<div className="relative" ref={dropdownRef} style={{position: 'relative'}}>
			<button
				type="button"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setIsOpen(!isOpen);
				}}
				style={{
					display: 'flex', alignItems: 'center', gap: '0.5rem',
					padding: '6px 10px', borderRadius: 'var(--radius-s)',
					backgroundColor: 'transparent', border: 'none', outline: 'none',
					boxShadow: 'none', cursor: 'pointer',
					fontSize: 'var(--font-ui-small)',
				}}
			>
				<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
					{displayText}
				</span>
				{!isMultiMode && capabilityIcons && (
					<span style={{ fontSize: 'var(--font-ui-smaller)', opacity: 0.8 }}>
						{capabilityIcons}
					</span>
				)}
			</button>

			{isOpen && createPortal(
				<>
					{/* 主下拉列表：提供商列表 */}
					<div
						ref={providerListRef}
						style={{
							position: 'fixed', ...getButtonPosition(),
							minWidth: PROVIDER_LIST_MIN_WIDTH,
							maxWidth: PROVIDER_LIST_MAX_WIDTH,
							zIndex: 1305, pointerEvents: 'auto',
						}}
						onMouseLeave={clearHoveredVendor}
					>
						<div style={{
							outline: 'none', borderRadius: 'var(--radius-m)',
							border: '1px solid var(--background-modifier-border)',
							background: 'var(--background-primary)',
							color: 'var(--text-normal)', boxShadow: 'var(--shadow-s)',
						}}>
							{/* 多模型模式切换行（固定不随列表滚动） */}
							{onModeChange && (
								<>
									<div style={{
										display: 'flex', alignItems: 'center',
										justifyContent: 'space-between',
										padding: '8px 12px',
									}}>
										<span style={{
											fontSize: 'var(--font-ui-small)',
											color: 'var(--text-muted)',
										}}>
											{localInstance.enable_multi_model}
										</span>
										<div
											role="switch"
											aria-checked={isMultiMode}
											onClick={(e) => {
												e.stopPropagation();
												handleToggleMode();
											}}
											style={{
												position: 'relative', width: '36px',
												height: '20px', borderRadius: '10px',
												backgroundColor: isMultiMode
													? 'var(--interactive-accent)'
													: 'var(--background-modifier-border)',
												cursor: 'pointer',
												transition: 'background-color 0.2s ease',
												flexShrink: 0,
											}}
										>
											<div style={{
												position: 'absolute', top: '2px',
												left: isMultiMode ? '18px' : '2px',
												width: '16px', height: '16px',
												borderRadius: '50%',
												backgroundColor: 'var(--text-on-accent)',
												transition: 'left 0.2s ease',
											}} />
										</div>
									</div>
									<div style={{
										height: '1px',
										background: 'var(--background-modifier-border)',
										margin: '0 4px',
									}} />
								</>
							)}

							{/* 可滚动的供应商列表 */}
							<div style={{
								padding: '0.25rem',
								maxHeight: `${PROVIDER_LIST_MAX_HEIGHT}px`,
								overflowY: 'auto',
							}}>
								{vendorGroups.map((group) => (
									<div
										key={group.vendorName}
										role="menuitem"
										ref={(el) => {
											if (el) vendorItemRefs.current.set(group.vendorName, el);
											else vendorItemRefs.current.delete(group.vendorName);
										}}
										style={{
											display: 'flex', alignItems: 'center',
											gap: '0.5rem', padding: '10px 12px',
											fontSize: 'var(--font-ui-small)', fontWeight: 500,
											cursor: 'pointer', userSelect: 'none',
											borderRadius: 'var(--radius-s)',
											transition: 'background-color 0.15s ease',
											backgroundColor: hoveredVendor === group.vendorName
												? 'var(--background-modifier-hover)' : 'transparent',
										}}
										onMouseEnter={() => setHoveredVendorWithCancel(group.vendorName)}
									>
										<span>{group.vendorName}</span>
										<span style={{
											marginLeft: 'auto',
											fontSize: 'var(--font-ui-smaller)',
											color: 'var(--text-muted)', opacity: 0.7,
										}}>
											({group.providers.length})
										</span>
									</div>
								))}
							</div>
						</div>
					</div>

					{/* 侧边弹窗：当前悬停提供商的模型列表 */}
					{hoveredVendor && createPortal(
						<div
							ref={submenuRef}
							style={{
								position: 'fixed', ...getSubmenuPosition(),
								minWidth: SUBMENU_MIN_WIDTH,
								maxWidth: SUBMENU_MAX_WIDTH,
								maxHeight: SUBMENU_MAX_HEIGHT, overflowY: 'auto',
								zIndex: 1306, pointerEvents: 'auto',
							}}
							onMouseEnter={() => {
								if (clearHoverTimerRef.current) {
									clearTimeout(clearHoverTimerRef.current);
									clearHoverTimerRef.current = null;
								}
							}}
							onMouseLeave={clearHoveredVendor}
						>
							<div style={{
								outline: 'none', borderRadius: 'var(--radius-m)',
								border: '1px solid var(--background-modifier-border)',
								background: 'var(--background-primary)',
								padding: '0.25rem', color: 'var(--text-normal)',
								boxShadow: 'var(--shadow-s)',
							}}>
								{/* 弹窗标题：提供商名称 */}
								<div style={{
									padding: '8px 12px',
									fontSize: 'var(--font-ui-smaller)',
									fontWeight: 600, color: 'var(--text-muted)',
									borderBottom: '1px solid var(--background-modifier-border)',
									marginBottom: '4px',
								}}>
									{hoveredVendor}
								</div>

								{/* 模型列表 */}
								{vendorGroups
									.find(g => g.vendorName === hoveredVendor)
									?.providers.map((provider) => {
										const v = availableVendors.find(
											v => v.name === provider.vendor);
										const caps = v
											? getCapabilityDisplayText(v, provider.options) : '';
										const isSelected = isMultiMode
											? selectedModels.includes(provider.tag)
											: provider.tag === value;

										return (
											<div
												key={provider.tag}
												role="menuitem"
												tabIndex={-1}
												onClick={() => handleModelSelect(provider.tag)}
												style={{
													position: 'relative', display: 'flex',
													cursor: 'pointer', userSelect: 'none',
													alignItems: 'center', gap: '0.5rem',
													borderRadius: 'var(--radius-s)',
													padding: '8px 12px',
													fontSize: 'var(--font-ui-small)',
													outline: 'none', marginBottom: '2px',
													transition: 'color 0.15s ease, background-color 0.15s ease',
													backgroundColor: isSelected
														? 'var(--background-modifier-hover)' : 'transparent',
												}}
												onMouseEnter={(e) => {
													e.currentTarget.style.backgroundColor =
														'var(--background-modifier-hover)';
												}}
												onMouseLeave={(e) => {
													if (!isSelected) {
														e.currentTarget.style.backgroundColor = 'transparent';
													}
												}}
											>
												{/* 多选模式复选框 */}
												{isMultiMode && (
													<div style={{
														width: '16px', height: '16px', borderRadius: '3px',
														border: isSelected ? 'none' : '1px solid var(--text-muted)',
														backgroundColor: isSelected ? 'var(--interactive-accent)' : 'transparent',
														display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
													}}>
														{isSelected && (
															<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="var(--text-on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
														)}
													</div>
												)}
												<div style={{
													display: 'flex', minWidth: 0,
													alignItems: 'center', gap: '0.25rem', flex: 1,
												}}>
													<span style={{
														overflow: 'hidden', textOverflow: 'ellipsis',
														whiteSpace: 'nowrap',
														fontSize: 'var(--font-ui-small)',
													}}>
														{getProviderModelDisplayName(provider, providers)}
													</span>
												</div>
												{caps && (
													<span style={{
														fontSize: 'var(--font-ui-smaller)', opacity: 0.7,
													}}>
														{caps}
													</span>
												)}
											</div>
										);
									})}
							</div>
						</div>,
						document.body
					)}
				</>,
				document.body
			)}
		</div>
	);
};
