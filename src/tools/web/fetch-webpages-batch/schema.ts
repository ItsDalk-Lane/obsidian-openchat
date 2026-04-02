import { z } from 'zod';
import {
	createFetchCommonFields,
	createFetchUrlsField,
	type FetchToolsOptions,
} from '../fetch-tool-support';

export const fetchWebpagesBatchSchema = z.object({
	urls: createFetchUrlsField(),
	...createFetchCommonFields(),
}).strict();

export type FetchWebpagesBatchArgs = z.infer<typeof fetchWebpagesBatchSchema>;

export type { FetchToolsOptions };
