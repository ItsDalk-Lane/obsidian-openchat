import type { SelectedTextContext } from 'src/domains/chat/types';
import type { SelectionInfo } from 'src/editor/selectionToolbar/SelectionToolbarExtension';

export const buildInitialSelectionContext = (
	selectionInfo: SelectionInfo | null,
	activeFilePath?: string,
	triggerSource?: 'selection' | 'symbol',
	fullText?: string,
): SelectedTextContext | undefined => {
	if (!selectionInfo) {
		return undefined;
	}

	return {
		filePath: activeFilePath,
		triggerSource: selectionInfo.triggerSource,
		...(triggerSource === 'symbol' && fullText
			? {}
			: {
				range: {
					from: selectionInfo.from,
					to: selectionInfo.to,
					...(typeof selectionInfo.lineStart === 'number'
						? { startLine: selectionInfo.lineStart }
						: {}),
					...(typeof selectionInfo.lineEnd === 'number'
						? { endLine: selectionInfo.lineEnd }
						: {}),
				},
			}),
	};
};