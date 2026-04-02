import { z } from 'zod';
import {
	createFetchCommonFields,
	createFetchUrlField,
	createFetchUrlsField,
	type FetchToolsOptions,
} from '../fetch-tool-support';

export const fetchSchema = z.object({
	url: createFetchUrlField()
		.optional()
		.describe('单个抓取模式使用的目标网址。当同时提供 urls 时，该字段会被忽略。'),
	urls: createFetchUrlsField()
		.optional()
		.describe('批量抓取模式使用的网址数组。提供此参数时进入批量模式，url 字段会被忽略。'),
	...createFetchCommonFields(),
}).strict();

export type FetchArgs = z.infer<typeof fetchSchema>;

export type { FetchToolsOptions };
