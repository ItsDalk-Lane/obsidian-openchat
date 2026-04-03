import {
	DEFAULT_READ_SEGMENT_LINES,
	readMultipleFilesSchema,
	readOnlyToolAnnotations,
	structuredOutputSchema,
	type ReadMultipleFilesArgs,
} from '../filesystemToolSchemas';

export const readFilesSchema = readMultipleFilesSchema;
export const readFilesOutputSchema = structuredOutputSchema;
export const readFilesAnnotations = readOnlyToolAnnotations;
export { DEFAULT_READ_SEGMENT_LINES };
export type { ReadMultipleFilesArgs };