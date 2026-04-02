import { z } from 'zod';

export const listVaultOverviewSchema = z.object({
	file_extensions: z
		.array(z.string().min(1))
		.optional()
		.default([])
		.describe('文件扩展名过滤数组，例如 ["md", "ts"]，元素不要带点号'),
	vault_limit: z
		.number()
		.int()
		.positive()
		.max(5_000)
		.default(1_000)
		.describe('最多返回多少条文件路径，默认 1000，最大 5000'),
}).strict();

export type ListVaultOverviewArgs = z.infer<typeof listVaultOverviewSchema>;
