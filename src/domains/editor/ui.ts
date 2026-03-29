/**
 * @module editor/ui
 * @description 提供 editor 域的 CodeMirror 状态、渲染与控制器接入壳。
 *
 * @dependencies src/domains/editor/types, src/domains/editor/config, src/domains/editor/service, src/providers/providers.types, @codemirror/state, @codemirror/view
 * @side-effects 注册编辑器事件、派发状态更新、插入建议文本
 * @invariants 不直接导入 legacy provider 模块；运行时依赖通过构造参数注入。
 */

import { EditorState, Extension, Prec, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, keymap, type KeyBinding, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { EditorTabCompletionService } from './service';
import type {
	EditorTabCompletionEvents,
	EditorTabCompletionRuntime,
	PendingSuggestionRequest,
	TabCompletionStateValue,
} from './types';
import type { EventBus, NoticePort, SystemPromptPort } from 'src/providers/providers.types';

const defaultTabCompletionState: TabCompletionStateValue = { isShowing: false, suggestionText: '', suggestionPos: 0, isLoading: false, requestId: null };
const setSuggestionEffect = StateEffect.define<{ text: string; pos: number; requestId: string }>();
const clearSuggestionEffect = StateEffect.define<void>();
const setLoadingEffect = StateEffect.define<{ requestId: string | null; pos: number }>();
const confirmSuggestionEffect = StateEffect.define<void>();

/**
 * @precondition 运行时依赖由组合根完整注入
 * @postcondition 负责把 editor service 接入 CodeMirror 扩展生命周期
 * @throws 从不抛出
 */
export class EditorDomainController {
	private readonly service: EditorTabCompletionService;

	constructor(obsidianApi: NoticePort & SystemPromptPort, eventBus: EventBus<EditorTabCompletionEvents> | null, private runtime: EditorTabCompletionRuntime) {
		this.service = new EditorTabCompletionService(obsidianApi, eventBus, runtime);
	}

	/** @precondition runtime 为最新配置快照 @postcondition 控制器与内部 service 同步为新运行时 @throws 从不抛出 @example controller.updateRuntime(runtime) */
	updateRuntime(runtime: EditorTabCompletionRuntime): void {
		this.runtime = runtime;
		this.service.updateRuntime(runtime);
		if (!runtime.settings.enabled) {
			this.service.cancel();
		}
	}

	/** @precondition 无 @postcondition 返回当前触发键配置 @throws 从不抛出 @example controller.getTriggerKey() */
	getTriggerKey(): string {
		return this.runtime.settings.triggerKey;
	}

	/** @precondition 无 @postcondition 返回当前功能是否启用 @throws 从不抛出 @example controller.isEnabled() */
	isEnabled(): boolean {
		return this.runtime.settings.enabled;
	}

	/** @precondition view 为活动编辑器视图 @postcondition 命中条件时进入加载并解析建议 @throws 从不抛出 @example await controller.trigger(view) */
	async trigger(view: EditorView): Promise<void> {
		const pending = this.service.startSuggestionRequest({ state: view.state, editable: view.state.facet(EditorView.editable) });
		if (!pending) {
			return;
		}
		view.dispatch({ effects: setLoadingEffect.of({ requestId: pending.requestId, pos: pending.context.cursorPos }) });
		await this.resolvePendingSuggestion(view, pending);
	}

	/** @precondition text 与 pos 来自当前 ghost text 状态 @postcondition 建议文本写回编辑器并记录连续使用历史 @throws 从不抛出 @example controller.confirm(view, text, pos) */
	confirm(view: EditorView, text: string, pos: number): void {
		this.service.confirmSuggestion();
		view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length }, effects: confirmSuggestionEffect.of(undefined) });
	}

	/** @precondition 无 @postcondition 当前待处理建议被取消 @throws 从不抛出 @example controller.cancel() */
	cancel(): void {
		this.service.cancel();
	}

	/** @precondition 无 @postcondition 控制器与内部 service 一并释放 @throws 从不抛出 @example controller.dispose() */
	dispose(): void {
		this.service.dispose();
	}

	private async resolvePendingSuggestion(view: EditorView, pending: PendingSuggestionRequest): Promise<void> {
		const suggestion = await this.service.resolveSuggestion(pending);
		if (!suggestion.trim()) {
			view.dispatch({ effects: clearSuggestionEffect.of(undefined) });
			return;
		}
		view.dispatch({ effects: setSuggestionEffect.of({ text: suggestion, pos: pending.context.cursorPos, requestId: pending.requestId }) });
	}
}

/** @precondition controller 已完成运行时注入 @postcondition 返回 editor 域需要注册的一组 CodeMirror 扩展 @throws 从不抛出 @example createEditorDomainExtension(controller) */
export function createEditorDomainExtension(controller: EditorDomainController): Extension[] {
	const keyBindings: KeyBinding[] = [{
		key: 'Enter',
		run: (view) => {
			const state = getEditorTabCompletionState(view.state);
			if (!state.isShowing || !state.suggestionText) return false;
			controller.confirm(view, state.suggestionText, state.suggestionPos);
			return true;
		},
	}, {
		key: 'Escape',
		run: (view) => {
			const state = getEditorTabCompletionState(view.state);
			if (!state.isShowing && !state.isLoading) return false;
			controller.cancel();
			view.dispatch({ effects: clearSuggestionEffect.of(undefined) });
			return true;
		},
	}];
	const triggerHandler = EditorView.domEventHandlers({
		keydown: (event, view) => {
			if (!controller.isEnabled() || !isTriggerKey(event, controller.getTriggerKey())) return false;
			const state = getEditorTabCompletionState(view.state);
			if (state.isShowing && state.suggestionText) {
				controller.confirm(view, state.suggestionText, state.suggestionPos);
				event.preventDefault();
				return true;
			}
			if (state.isLoading) {
				event.preventDefault();
				return true;
			}
			void controller.trigger(view);
			event.preventDefault();
			event.stopPropagation();
			return true;
		},
	});
	const cancelOnAnchorEdit = EditorView.updateListener.of((update) => {
		if (!update.docChanged) return;
		const state = getEditorTabCompletionState(update.startState);
		if (!state.isShowing && !state.isLoading) return;
		let touchedAnchor = false;
		for (const transaction of update.transactions) {
			if (!transaction.docChanged) continue;
			transaction.changes.iterChanges((fromA, toA) => {
				if (fromA <= state.suggestionPos && state.suggestionPos <= toA) touchedAnchor = true;
			});
		}
		if (touchedAnchor) {
			controller.cancel();
			update.view.dispatch({ effects: clearSuggestionEffect.of(undefined) });
		}
	});
	return [tabCompletionStateField, ghostTextStyle, ghostTextPlugin, Prec.highest(triggerHandler), Prec.high(keymap.of(keyBindings)), Prec.highest(cancelOnAnchorEdit)];
}

const tabCompletionStateField = StateField.define<TabCompletionStateValue>({
	create: () => ({ ...defaultTabCompletionState }),
	update: (state, transaction) => {
		for (const effect of transaction.effects) {
			if (effect.is(setSuggestionEffect)) return { isShowing: true, suggestionText: effect.value.text, suggestionPos: effect.value.pos, isLoading: false, requestId: effect.value.requestId };
			if (effect.is(clearSuggestionEffect) || effect.is(confirmSuggestionEffect)) return { ...defaultTabCompletionState };
			if (effect.is(setLoadingEffect)) return { ...state, isLoading: true, requestId: effect.value.requestId, suggestionPos: effect.value.pos };
		}
		if (transaction.docChanged && (state.isShowing || state.isLoading)) {
			return { ...state, suggestionPos: transaction.changes.mapPos(state.suggestionPos) };
		}
		return state;
	},
});

function getEditorTabCompletionState(state: EditorState): TabCompletionStateValue {
	return state.field(tabCompletionStateField, false) ?? defaultTabCompletionState;
}

const ghostTextPlugin = ViewPlugin.fromClass(class {
	decorations: DecorationSet;
	constructor(view: EditorView) { this.decorations = buildDecorations(view); }
	update(update: ViewUpdate): void {
		if (update.docChanged || update.selectionSet || update.viewportChanged || getEditorTabCompletionState(update.startState).requestId !== getEditorTabCompletionState(update.state).requestId || getEditorTabCompletionState(update.startState).suggestionText !== getEditorTabCompletionState(update.state).suggestionText || getEditorTabCompletionState(update.startState).isLoading !== getEditorTabCompletionState(update.state).isLoading) {
			this.decorations = buildDecorations(update.view);
		}
	}
}, { decorations: (instance) => instance.decorations });

const ghostTextStyle = EditorView.baseTheme({
	'.ai-runtime-ghost-text': { color: 'var(--text-muted)', opacity: '0.6', fontStyle: 'italic', pointerEvents: 'none', userSelect: 'none', whiteSpace: 'pre-wrap' },
	'.ai-runtime-ghost-text-loading': { color: 'var(--text-muted)', opacity: '0.5', fontStyle: 'italic', animation: 'ai-runtime-loading-pulse 1.5s ease-in-out infinite' },
	'@keyframes ai-runtime-loading-pulse': { '0%, 100%': { opacity: '0.3' }, '50%': { opacity: '0.7' } },
});

function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const state = getEditorTabCompletionState(view.state);
	if (state.isLoading) {
		builder.add(state.suggestionPos, state.suggestionPos, Decoration.widget({ widget: new InlineTextWidget('...', 'ai-runtime-ghost-text-loading', '正在生成建议'), side: 1 }));
	} else if (state.isShowing && state.suggestionText) {
		builder.add(state.suggestionPos, state.suggestionPos, Decoration.widget({ widget: new InlineTextWidget(state.suggestionText, 'ai-runtime-ghost-text'), side: 1 }));
	}
	return builder.finish();
}

class InlineTextWidget extends WidgetType {
	constructor(private readonly text: string, private readonly className: string, private readonly label?: string) { super(); }
	eq(other: InlineTextWidget): boolean { return this.text === other.text && this.className === other.className; }
	toDOM(): HTMLElement {
		const container = document.createElement('span');
		container.className = this.className;
		if (this.label) container.setAttribute('aria-label', this.label);
		for (const [index, line] of this.text.split('\n').entries()) {
			if (index > 0) container.appendChild(document.createElement('br'));
			container.appendChild(document.createTextNode(line));
		}
		return container;
	}
	ignoreEvent(): boolean { return false; }
}

function isTriggerKey(event: KeyboardEvent, triggerKey: string): boolean {
	const key = triggerKey.toLowerCase();
	if (key === 'alt') return event.key === 'Alt' && !event.ctrlKey && !event.metaKey && !event.shiftKey;
	if (key === 'ctrl') return event.key === 'Control' && !event.altKey && !event.metaKey && !event.shiftKey;
	if (key === 'shift') return event.key === 'Shift' && !event.ctrlKey && !event.altKey && !event.metaKey;
	if (key === 'meta') return event.key === 'Meta' && !event.ctrlKey && !event.altKey && !event.shiftKey;
	if (key === 'tab') return event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
	if (!key.includes('-')) return false;
	const [modifier, mainKey] = key.split('-');
	const modifierMatch = modifier === 'mod' ? event.ctrlKey || event.metaKey : modifier === 'ctrl' ? event.ctrlKey : modifier === 'alt' ? event.altKey : modifier === 'shift' ? event.shiftKey : event.metaKey;
	return modifierMatch && (event.key.toLowerCase() === mainKey || event.code.toLowerCase() === mainKey || event.code.toLowerCase() === `key${mainKey}`);
}
