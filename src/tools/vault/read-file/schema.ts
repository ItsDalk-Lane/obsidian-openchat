import {
	DEFAULT_READ_SEGMENT_LINES,
	MAX_READ_SEGMENT_LINES,
	readOnlyToolAnnotations,
	readTextFileSchema,
	structuredOutputSchema,
	type ReadTextFileArgs,
} from '../filesystemToolSchemas'

const readFileAnnotations = readOnlyToolAnnotations
const readFileOutputSchema = structuredOutputSchema

export {
	DEFAULT_READ_SEGMENT_LINES,
	MAX_READ_SEGMENT_LINES,
	readFileAnnotations,
	readFileOutputSchema,
	readTextFileSchema,
}
export type { ReadTextFileArgs as ReadFileArgs }
