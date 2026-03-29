/**
 * @module chat/types-view-coordinator
 * @description ChatViewCoordinator 所需的最小 Port 接口定义。
 *
 * @dependencies obsidian (type-only), src/domains/chat/types
 * @side-effects 无
 * @invariants 仅承载接口定义，不引用 src/core/ 或 src/components/。
 */

import type { TFile, WorkspaceLeaf, Command } from 'obsidian';
import type { ChatSettings } from './types';

/** ChatService 方法子集：仅包含 ChatViewCoordinator 实际调用的方法 */
export interface ChatViewCoordinatorServicePort {
	setNextTriggerSource(source: string): void;
	addActiveFile(file: TFile): void;
	createNewSession(): void;
	saveActiveSession(): Promise<void>;
}

/** 宿主能力子集：仅包含 ChatViewCoordinator 直接使用的能力 */
export interface ChatViewCoordinatorHost {
	notify(message: string, timeout?: number): void;
	getChatSettings(): Readonly<ChatSettings>;
	registerView(viewType: string, viewCreator: (leaf: WorkspaceLeaf) => unknown): void;
	addCommand(command: Command): void;
	addRibbonIcon(
		icon: string,
		title: string,
		callback: (event: MouseEvent) => void,
	): HTMLElement;
	getActiveMarkdownFile(): TFile | null;
	findLeafByViewType(viewType: string): WorkspaceLeaf | null;
	revealLeaf(leaf: WorkspaceLeaf): void;
	getLeaf(target: 'tab' | 'window'): WorkspaceLeaf;
	getSidebarLeaf(side: 'left' | 'right'): WorkspaceLeaf | null;
	setLeafViewState(
		leaf: WorkspaceLeaf,
		viewType: string,
		active: boolean,
	): Promise<void>;
	isWorkspaceReady(): boolean;
	detachLeavesOfType(viewType: string): void;
}

/** 聊天模态框控制句柄 */
export interface ChatModalHandle {
	open(): void;
}

/** 持久化模态框控制句柄 */
export interface ChatPersistentModalHandle {
	open(): void;
	focus(): void;
	close(): void;
}

/** 视图与模态框工厂：由组合根注入，隔离对 src/components/ 的依赖 */
export interface ChatViewFactory {
	createSidebarView(leaf: WorkspaceLeaf): unknown;
	createTabView(leaf: WorkspaceLeaf): unknown;
	createModal(options: {
		width: number;
		height: number;
		activeFile?: TFile | null;
	}): ChatModalHandle;
	createPersistentModal(options: {
		width: number;
		height: number;
		activeFile?: TFile | null;
		onClose?: () => void;
	}): ChatPersistentModalHandle;
}
