import {
	directoryPathSchema,
	mutationToolAnnotations,
	structuredOutputSchema,
} from '../filesystemToolSchemas';
import { z } from 'zod';

export const createDirectorySchema = directoryPathSchema;
export const createDirectoryOutputSchema = structuredOutputSchema;
export const createDirectoryAnnotations = mutationToolAnnotations;

export type CreateDirectoryArgs = z.infer<typeof createDirectorySchema>;