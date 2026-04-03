import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import React, { useMemo } from "react";
import "./Dialog.css";
import { Strings } from "src/utils/Strings";
import { localInstance } from "src/i18n/locals";

function isInsideRadixFloatingLayer(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) {
		return false;
	}

	return target.closest("[data-radix-popper-content-wrapper]") != null;
}

/**
 * 找到最适合的 Portal 挂载容器。
 * 如果当前处于 Obsidian 模态框（如设置面板）内，
 * 则挂载到该 .modal-container，保证与设置面板在同一 stacking context。
 * 否则回退到 document body。
 */
function findPortalContainer(): HTMLElement {
	const doc = window.activeDocument ?? document
	const containers = doc.querySelectorAll('.modal-container')
	if (containers.length > 0) {
		return containers[containers.length - 1] as HTMLElement
	}
	return doc.body
}

export default function Dialog(props: {
	/** 兼容：原有字符串标题 */
	title?: string;
	/** 可选：自定义标题节点（优先于 title） */
	titleNode?: React.ReactNode;
	/** 可选：标题行右侧内容（如按钮） */
	titleRight?: React.ReactNode;
	description?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	dialogClassName?: string;
	modal?: boolean;
	closeOnInteractOutside?: boolean;
	children?: (close: () => void) => JSX.Element;
}) {
	const { title, titleNode, titleRight, open, onOpenChange, description } = props;
	const showTitle = titleNode != null || Strings.isNotBlank(title);
	const closeOnInteractOutside = props.closeOnInteractOutside !== false;
	const portalContainer = useMemo(() => findPortalContainer(), [])
	return (
		<DialogPrimitive.Root
			open={open}
			onOpenChange={onOpenChange}
			modal={props.modal === true}
		>
			<DialogPrimitive.Portal container={portalContainer}>
				<div className="form--DialogRoot">
					<div className="form--DialogOverlay" />
					<DialogPrimitive.Content
						className={`form--DialogContent ${
							props.dialogClassName || ""
						}`}
						onPointerDownOutside={(event) => {
							if (isInsideRadixFloatingLayer(event.target)) {
								return;
							}
							if (!closeOnInteractOutside) {
								event.preventDefault();
							}
						}}
						onFocusOutside={(event) => {
							if (isInsideRadixFloatingLayer(event.target)) {
								return;
							}
							if (!closeOnInteractOutside) {
								event.preventDefault();
							}
						}}
					>
						{showTitle ? (
							<div className="form--DialogHeader">
								<DialogPrimitive.Title className="form--DialogTitle">
									{titleNode ?? title}
								</DialogPrimitive.Title>
								{titleRight ? (
									<div className="form--DialogTitleRight">
										{titleRight}
									</div>
								) : null}
							</div>
						) : (
							<VisuallyHidden asChild>
								<DialogPrimitive.Title>
									Dialog
								</DialogPrimitive.Title>
							</VisuallyHidden>
						)}
						{description ? (
							<DialogPrimitive.Description className="form--DialogDescription">
								{description}
							</DialogPrimitive.Description>
						) : (
							<VisuallyHidden asChild>
								<DialogPrimitive.Description>
									Description
								</DialogPrimitive.Description>
							</VisuallyHidden>
						)}
						{props.children && (
							<div className="form--DialogPanelChildren">
								{props.children(() => onOpenChange(false))}
							</div>
						)}
						<DialogPrimitive.Close asChild>
							<button
								className="form--DialogCloseButton"
								aria-label={localInstance.close}
								onClick={() => onOpenChange(false)}
							>
								<X size={18} />
							</button>
						</DialogPrimitive.Close>
					</DialogPrimitive.Content>
				</div>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
