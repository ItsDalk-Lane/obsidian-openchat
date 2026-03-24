import { App, MarkdownView, WorkspaceLeaf } from "obsidian";

export function focusLatestEditor(app: App) {
    let markdownview = app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownview) {
        let current = null as WorkspaceLeaf | null;
        let currentActiveTime = -Infinity;
        app.workspace.iterateAllLeaves(leaf => {
            if (leaf.view instanceof MarkdownView) {
                const leafActiveTime = Number((leaf as WorkspaceLeaf & { activeTime?: number }).activeTime ?? -Infinity);
                if (!current) {
                    current = leaf;
                    currentActiveTime = leafActiveTime;
                } else if (currentActiveTime <= leafActiveTime) {
                    current = leaf;
                    currentActiveTime = leafActiveTime;
                }
            }
        })
        if (current !== null) {
            markdownview = current.view as MarkdownView;
        }
    }

    if (markdownview) {
        markdownview.editor.focus();
    }
}
