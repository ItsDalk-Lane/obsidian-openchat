import { z } from 'zod';
import {
	findPathsSchema,
	readOnlyToolAnnotations as findPathsAnnotations,
	structuredOutputSchema as findPathsOutputSchema,
} from '../filesystemToolSchemas';

export {
	findPathsAnnotations,
	findPathsOutputSchema,
	findPathsSchema,
};

export type FindPathsArgs = z.infer<typeof findPathsSchema>;
