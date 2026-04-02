import { z } from 'zod';
import {
	createFetchCommonFields,
	createFetchUrlField,
	type FetchToolsOptions,
} from '../fetch-tool-support';

export const fetchWebpageSchema = z.object({
	url: createFetchUrlField(),
	...createFetchCommonFields(),
}).strict();

export type FetchWebpageArgs = z.infer<typeof fetchWebpageSchema>;

export type { FetchToolsOptions };
