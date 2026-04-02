import { z } from 'zod';
import {
	deleteFileSchema,
	mutationToolAnnotations as deletePathAnnotations,
	structuredOutputSchema as deletePathOutputSchema,
} from '../filesystemToolSchemas';

export {
	deletePathAnnotations,
	deletePathOutputSchema,
	deleteFileSchema,
};

export type DeletePathArgs = z.infer<typeof deleteFileSchema>;
