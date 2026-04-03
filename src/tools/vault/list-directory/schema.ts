import {
	listDirectorySchema,
	readOnlyToolAnnotations,
	structuredOutputSchema,
	type ListDirectoryArgs,
} from '../filesystemToolSchemas';

export const listDirectoryOutputSchema = structuredOutputSchema;
export const listDirectoryAnnotations = readOnlyToolAnnotations;
export { listDirectorySchema };
export type { ListDirectoryArgs };