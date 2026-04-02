import { z } from 'zod';
import { mutationToolAnnotations } from '../filesystemToolSchemas';

const propertyKeySchema = z.string().min(1);

const propertySetOperationSchema = z.object({
	action: z.literal('set'),
	key: propertyKeySchema,
	value: z.unknown(),
}).strict();

const propertyDeleteOperationSchema = z.object({
	action: z.literal('delete'),
	key: propertyKeySchema,
}).strict();

const propertyAppendOperationSchema = z.object({
	action: z.literal('append'),
	key: propertyKeySchema,
	value: z.unknown(),
}).strict();

const propertyRemoveOperationSchema = z.object({
	action: z.literal('remove'),
	key: propertyKeySchema,
	value: z.unknown(),
}).strict();

export const propertyEditOperationSchema = z.union([
	propertySetOperationSchema,
	propertyDeleteOperationSchema,
	propertyAppendOperationSchema,
	propertyRemoveOperationSchema,
]);

export const propertyEditSchema = z.object({
	file_path: z.string().min(1).describe('目标 Markdown 文件路径。'),
	operations: z
		.array(propertyEditOperationSchema)
		.min(1)
		.describe('frontmatter 结构化操作数组。'),
}).strict();

export const propertyEditResultSchema = z.object({
	file_path: z.string(),
	updated_keys: z.array(z.string()),
	diff_preview: z.string().optional(),
}).strict();

export type PropertyEditOperation = z.infer<typeof propertyEditOperationSchema>;
export type PropertyEditArgs = z.infer<typeof propertyEditSchema>;
export type PropertyEditResult = z.infer<typeof propertyEditResultSchema>;

export const propertyEditAnnotations = mutationToolAnnotations;
