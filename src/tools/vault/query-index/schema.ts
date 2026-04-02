import { z } from 'zod';
import {
	readOnlyToolAnnotations,
	responseFormatSchema,
	structuredOutputSchema,
} from '../filesystemToolSchemas';

export type QueryIndexDataSource = 'file' | 'property' | 'tag' | 'task';
export type QueryIndexScalar = string | number | boolean | null;

export const queryIndexScalarSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);

export const queryIndexSchema = z.object({
	data_source: z
		.enum(['file', 'property', 'tag', 'task'])
		.describe('索引数据源：file 文件元数据，property 属性统计，tag 标签统计，task 任务数据'),
	select: z
		.object({
			fields: z
				.array(z.string().min(1))
				.optional()
				.default([])
				.describe('要返回的字段名数组，字段名使用公开的 snake_case 形式'),
			aggregates: z
				.array(
					z
						.object({
							aggregate: z
								.enum(['count', 'sum', 'avg'])
								.describe('聚合函数：count 统计行数，sum/avg 统计数字字段'),
							field: z
								.string()
								.optional()
								.describe('sum/avg 必填；count 留空时统计行数'),
							alias: z
								.string()
								.optional()
								.describe('结果列别名；不填时自动生成 snake_case 别名'),
						})
						.strict()
				)
				.optional()
				.default([])
				.describe('可选的聚合计算数组'),
		})
		.strict()
		.describe('要返回的字段和聚合定义'),
	filters: z
		.object({
			match: z
				.enum(['all', 'any'])
				.default('all')
				.describe('多个条件如何组合：all 表示全部满足，any 表示满足任一条件'),
			conditions: z
				.array(
					z
						.object({
							field: z
								.string()
								.min(1)
								.describe('过滤字段名，使用公开的 snake_case 字段'),
							operator: z
								.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'matches'])
								.describe('过滤运算符'),
							value: z
								.union([
									queryIndexScalarSchema,
									z.array(queryIndexScalarSchema).min(1),
								])
								.describe('过滤值；operator=in 时应传数组'),
						})
						.strict()
				)
				.min(1)
				.describe('过滤条件数组'),
		})
		.optional()
		.describe('可选的过滤条件'),
	group_by: z
		.string()
		.optional()
		.describe('可选的分组字段，使用公开的 snake_case 字段'),
	order_by: z
		.object({
			field: z
				.string()
				.min(1)
				.describe('排序字段，使用 select 中已有的字段名或别名'),
			direction: z
				.enum(['asc', 'desc'])
				.default('asc')
				.describe('排序方向，默认 asc'),
		})
		.strict()
		.optional()
		.describe('可选的排序定义'),
	limit: z
		.number()
		.int()
		.positive()
		.max(500)
		.default(100)
		.describe('返回行数上限，默认 100'),
	offset: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe('结果偏移量，默认 0'),
	response_format: responseFormatSchema,
}).strict();

export const queryIndexOutputSchema = structuredOutputSchema;
export const queryIndexAnnotations = readOnlyToolAnnotations;

export type QueryIndexArgs = z.infer<typeof queryIndexSchema>;