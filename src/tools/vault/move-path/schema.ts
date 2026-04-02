import { z } from 'zod';
import {
	moveFileSchema,
	mutationToolAnnotations as movePathAnnotations,
	structuredOutputSchema as movePathOutputSchema,
} from '../filesystemToolSchemas';

export {
	movePathAnnotations,
	movePathOutputSchema,
	moveFileSchema,
};

export type MovePathArgs = z.infer<typeof moveFileSchema>;
