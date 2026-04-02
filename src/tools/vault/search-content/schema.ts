import { z } from 'zod';
import { DEFAULT_SEARCH_MAX_RESULTS } from '../../runtime/constants';
import {
	readOnlyToolAnnotations,
	responseFormatSchema,
	structuredOutputSchema,
} from '../filesystemToolSchemas';

export const searchContentSchema = z.object({
	pattern: z
		.string()
		.min(1)
		.describe(
			'要搜索的内容。match_mode=literal 时按普通文本匹配；match_mode=regex 时按正则表达式匹配'
		),
	match_mode: z
		.enum(['literal', 'regex'])
		.default('literal')
		.describe('匹配模式：literal 表示普通文本匹配，regex 表示正则匹配'),
	scope_path: z
		.string()
		.optional()
		.default('/')
		.describe('限制搜索范围的目录路径；默认为整个 Vault'),
	file_types: z
		.array(z.string().min(1))
		.optional()
		.default([])
		.describe('可选的扩展名过滤数组，例如 ["md", "ts"]；元素不要带点号'),
	max_results: z
		.number()
		.int()
		.positive()
		.optional()
		.default(DEFAULT_SEARCH_MAX_RESULTS)
		.describe('返回的最大匹配数量，默认 50'),
	case_sensitive: z
		.boolean()
		.optional()
		.default(false)
		.describe('是否区分大小写，默认 false'),
	context_lines: z
		.number()
		.int()
		.min(0)
		.optional()
		.default(0)
		.describe('返回匹配行前后的上下文行数，默认 0'),
	response_format: responseFormatSchema,
}).strict();

export const searchContentOutputSchema = structuredOutputSchema;
export const searchContentAnnotations = readOnlyToolAnnotations;

export type SearchContentArgs = z.infer<typeof searchContentSchema>;