export interface ConflictItem {
	fileName: string;
	filePath: string;
	source?: string;
	detailPath?: string;
}

export type DetectedConflict =
	| {
		kind: 'commandId';
		name: string;
		items: ConflictItem[];
	}
	| {
		kind: 'variable';
		name: string;
		conflictType: string;
		items: ConflictItem[];
	};
