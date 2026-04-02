import { z } from 'zod';
import {
	mutationToolAnnotations as writeFileAnnotations,
	structuredOutputSchema as writeFileOutputSchema,
	writeFileSchema,
} from '../filesystemToolSchemas';

export {
	writeFileAnnotations,
	writeFileOutputSchema,
	writeFileSchema,
};

export type WriteFileArgs = z.infer<typeof writeFileSchema>;
