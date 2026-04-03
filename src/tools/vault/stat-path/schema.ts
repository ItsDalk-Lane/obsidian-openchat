import {
	getFileInfoSchema,
	readOnlyToolAnnotations,
	structuredOutputSchema,
} from '../filesystemToolSchemas';
import { z } from 'zod';

export const statPathSchema = getFileInfoSchema;
export const statPathOutputSchema = structuredOutputSchema;
export const statPathAnnotations = readOnlyToolAnnotations;

export type StatPathArgs = z.infer<typeof statPathSchema>;