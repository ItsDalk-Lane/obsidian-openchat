import { z } from 'zod';
import {
	editFileSchema,
	mutationToolAnnotations as editFileAnnotations,
	structuredOutputSchema as editFileOutputSchema,
} from '../filesystemToolSchemas';

export {
	editFileAnnotations,
	editFileOutputSchema,
	editFileSchema,
};

export type EditFileArgs = z.infer<typeof editFileSchema>;
