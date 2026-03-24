import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App, TAbstractFile, TFile, TFolder } from 'obsidian';
import { localInstance } from 'src/i18n/locals';
import { z } from 'zod';
import {
	BUILTIN_FILESYSTEM_SERVER_ID,
	BUILTIN_FILESYSTEM_SERVER_NAME,
	DEFAULT_SEARCH_MAX_RESULTS,
	DEFAULT_TEXT_FILE_MAX_CHARS,
} from '../runtime/constants';
import { registerBuiltinTool } from '../runtime/register-tool';
import {
	normalizeStructuredToolResult,
	serializeMcpToolResult,
	toCanonicalJsonText,
} from '../runtime/tool-result';
import { BuiltinToolRegistry, type BuiltinToolInfo } from '../runtime/tool-registry';
import { registerNavTools } from './nav-tools';
import { executeVaultQuery } from './vault-query';
import {
	assertVaultPath,
	assertVaultPathOrRoot,
	ensureFolderExists,
	ensureParentFolderExists,
	getAbstractFileOrThrow,
	getFileOrThrow,
	getFileStat,
	getFolderOrThrow,
	normalizeVaultPath,
	resolveRegex,
} from './helpers';

const { createTwoFilesPatch } = require('diff') as {
	createTwoFilesPatch: (
		oldFileName: string,
		newFileName: string,
		oldStr: string,
		newStr: string,
		oldHeader?: string,
		newHeader?: string
	) => string;
};
const { minimatch } = require('minimatch') as {
	minimatch: (
		input: string,
		pattern: string,
		options?: { dot?: boolean; nocase?: boolean }
	) => boolean;
};

export interface FilesystemBuiltinRuntime {
	serverId: string;
	serverName: string;
	client: Client;
	callTool: (name: string, args: Record<string, unknown>) => Promise<string>;
	listTools: () => Promise<BuiltinToolInfo[]>;
	close: () => Promise<void>;
}

interface FilesystemEntry {
	name: string;
	type: 'file' | 'directory';
	children?: FilesystemEntry[];
}

interface EditOperation {
	oldText: string;
	newText: string;
}

interface ContentSearchContextEntry {
	line: number;
	text: string;
}

interface ContentSearchMatch {
	path: string;
	line: number;
	text: string;
	before: ContentSearchContextEntry[];
	after: ContentSearchContextEntry[];
}

interface PathSearchMatch {
	path: string;
	name: string;
	type: 'file' | 'directory';
	matched_on: 'name' | 'path';
}

type BuiltinResponseFormat = 'json' | 'text';
type ReadMode = 'full' | 'segment' | 'head' | 'tail';
type BatchReadMode = 'segment' | 'head';
type QueryIndexDataSource = 'file' | 'property' | 'tag' | 'task';
type QueryIndexScalar = string | number | boolean | null;

interface QueryIndexAggregate {
	aggregate: 'count' | 'sum' | 'avg';
	field?: string;
	alias?: string;
}

interface QueryIndexFilterCondition {
	field: string;
	operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'matches';
	value: QueryIndexScalar | QueryIndexScalar[];
}

const formatToolError = (error: unknown): string =>
	`[工具执行错误] ${error instanceof Error ? error.message : String(error)}`;

const responseFormatSchema = z
	.enum(['json', 'text'])
	.default('json')
	.describe("返回格式：json 为稳定对象，text 为紧凑文本");

const structuredOutputSchema = z.object({}).passthrough();
const readOnlyToolAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const;
const mutationToolAnnotations = {
	readOnlyHint: false,
	destructiveHint: true,
	idempotentHint: false,
	openWorldHint: false,
} as const;
const navigationToolAnnotations = {
	readOnlyHint: false,
	destructiveHint: false,
	idempotentHint: false,
	openWorldHint: false,
} as const;

const DEFAULT_READ_SEGMENT_LINES = 200;
const MAX_READ_SEGMENT_LINES = 1_000;
const QUERY_INDEX_PUBLIC_FIELDS: Record<QueryIndexDataSource, Record<string, string>> = {
	file: {
		path: 'path',
		name: 'name',
		basename: 'basename',
		extension: 'extension',
		size: 'size',
		created: 'created',
		modified: 'modified',
		parent: 'parent',
	},
	property: {
		name: 'name',
		type: 'type',
		usage_count: 'usageCount',
	},
	tag: {
		tag: 'tag',
		count: 'count',
		file_count: 'fileCount',
		first_seen: 'firstSeen',
	},
	task: {
		file_path: 'filePath',
		line: 'line',
		text: 'text',
		completed: 'completed',
		status: 'status',
		parent_line: 'parentLine',
		priority: 'priority',
	},
};
const QUERY_INDEX_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

const READ_FILE_DESCRIPTION = `读取一个已知路径的文本文件，支持整篇读取、分段读取、读取开头和读取结尾。

## 何时使用

- 已经知道准确文件路径，并且需要读取正文内容时
- 需要分页阅读长文本文件时
- 需要先查看开头或结尾片段再决定下一步时

## 何时不使用

- **不要用于发现未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于浏览目录结构**：目录浏览请使用 \`list_directory\`
- **不要用于正文搜索定位**：按内容搜索请使用 \`search_content\`

## 可用字段

- **file_path**（必需）：要读取的文本文件路径，相对于 Vault 根目录
- **read_mode**（可选，默认 \`segment\`）：\`full\`、\`segment\`、\`head\`、\`tail\`
- **start_line**（可选）：仅 \`segment\` 模式可用，从第几行开始读取，第一行为 1
- **line_count**（可选）：\`segment\`、\`head\`、\`tail\` 模式返回的行数
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- \`start_line\` 只能在 \`segment\` 模式下使用
- 长文默认优先使用 \`segment\`，不要一开始就使用 \`full\`
- 当返回 \`has_more=true\` 时，可用 \`next_start_line\` 继续读取后续片段

## 返回值

返回 \`file_path\`、\`read_mode\`、\`content\`、\`total_lines\`、\`returned_start_line\`、\`returned_end_line\`、\`has_more\`、\`next_start_line\`、\`truncated\`，以及可能出现的 \`warning\` 和 \`suggested_next_call\`。

## 失败恢复

- 如果 \`full\` 模式提示文件过长，改用 \`segment\`
- 如果路径不存在，先用 \`find_paths\` 定位准确路径
- 如果还有剩余内容，按 \`suggested_next_call\` 或 \`next_start_line\` 继续读取

## 示例

\`\`\`json
{
  "file_path": "notes/todo.md",
  "read_mode": "segment",
  "start_line": 1,
  "line_count": 120
}
\`\`\``;

const READ_MEDIA_DESCRIPTION = `读取一个已知路径的图片或音频文件，并返回可供模型消费的二进制内容与 MIME 信息。

## 何时使用

- 已经知道准确媒体文件路径，需要把图片或音频内容提供给模型时
- 需要读取 Vault 中的非文本媒体资源时

## 何时不使用

- **不要用于读取文本内容**：文本文件请使用 \`read_file\`
- **不要用于查找未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于浏览目录**：目录浏览请使用 \`list_directory\`

## 返回值

返回媒体二进制内容、媒体类型和 MIME 类型，具体结构由运行时统一封装。

## 失败恢复

- 如果路径不存在，先用 \`find_paths\` 定位路径
- 如果文件类型不受支持，改用更合适的工具处理对应文件`;

const READ_FILES_DESCRIPTION = `批量预览多个已知文本文件的部分内容，适合快速筛选候选文件。

## 何时使用

- 已经拿到一组准确文件路径，只需要快速预览每个文件的一部分内容时
- 想比较多个文件的开头或某一段内容时

## 何时不使用

- **不要用于完整阅读长文**：单篇长文请改用 \`read_file\`
- **不要用于发现路径**：查找路径请先使用 \`find_paths\`

## 可用字段

- **file_paths**（必需）：文件路径数组，最多 20 个
- **read_mode**（可选，默认 \`segment\`）：\`segment\` 或 \`head\`
- **start_line**（可选）：仅 \`segment\` 模式可用
- **line_count**（可选）：每个文件返回的行数
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- \`start_line\` 只能在 \`segment\` 模式下使用
- 如果某个文件需要继续深入阅读，应单独对该文件调用 \`read_file\`

## 返回值

返回 \`files\` 数组。每个元素包含 \`file_path\`、\`content\`、\`returned_start_line\`、\`returned_end_line\`、\`has_more\`、\`next_start_line\`、\`truncated\` 和 \`error\`。

## 失败恢复

- 如果某个文件返回 \`error\`，检查该路径是否存在
- 如果预览不够，针对目标文件单独调用 \`read_file\`

## 示例

\`\`\`json
{
  "file_paths": ["notes/a.md", "notes/b.md"],
  "read_mode": "head",
  "line_count": 40
}
\`\`\``;

const WRITE_FILE_DESCRIPTION = `创建一个文本文件，或用新的完整内容覆盖已有文本文件。

## 何时使用

- 需要整文件写入内容时
- 需要创建新文本文件时
- 需要完全替换旧文件内容时

## 何时不使用

- **不要用于局部修改现有文件**：局部替换请使用 \`edit_file\`
- **不要用于查找路径**：只知道名称时先用 \`find_paths\`

## 可用字段

- **file_path**（必需）：目标文件路径，相对于 Vault 根目录
- **content**（必需）：要写入的完整文本内容

## 返回值

返回 \`file_path\`、\`action\` 和 \`bytes_written\`，分别表示目标路径、是创建还是更新，以及写入字节数。

## 失败恢复

- 如果父目录不存在，先调用 \`create_directory\` 或改正路径
- 如果目标是目录而不是文件，改用正确的文件路径

## 示例

\`\`\`json
{
  "file_path": "drafts/report.md",
  "content": "# Report\\n\\nInitial draft"
}
\`\`\``;

const EDIT_FILE_DESCRIPTION = `按文本片段编辑一个已知路径的文本文件，并支持 dry run 预览 diff。

## 何时使用

- 已经知道准确文件路径，只需要局部修改时
- 想先预览 diff 再决定是否写入时

## 何时不使用

- **不要用于整文件重写**：整文件写入请使用 \`write_file\`
- **不要用于发现路径或浏览目录**：请改用 \`find_paths\` 或 \`list_directory\`

## 可用字段

- **file_path**（必需）：目标文本文件路径
- **edits**（必需）：编辑操作数组，每项包含 \`oldText\` 和 \`newText\`
- **dry_run**（可选，默认 false）：是否只返回 diff 预览而不写入

## 返回值

返回 \`file_path\`、\`dry_run\`、\`applied_edits\`、\`updated\` 和 \`diff\`。

## 失败恢复

- 如果提示找不到待替换文本，先用 \`read_file\` 读取目标片段再重试
- 如果只想查看改动效果，先把 \`dry_run\` 设为 \`true\`

## 示例

\`\`\`json
{
  "file_path": "notes/todo.md",
  "edits": [
    {
      "oldText": "- [ ] old item",
      "newText": "- [x] old item"
    }
  ],
  "dry_run": true
}
\`\`\``;

const CREATE_DIRECTORY_DESCRIPTION = `创建一个已知路径的目录，必要时递归创建缺失的父目录。

## 何时使用

- 需要为后续写文件或移动文件提前准备目录时
- 需要整理 Vault 目录结构时

## 何时不使用

- **不要用于浏览目录内容**：请使用 \`list_directory\`
- **不要用于查找未知目录路径**：请先使用 \`find_paths\`

## 返回值

返回 \`directory_path\`、\`created\` 和 \`existed\`。

## 失败恢复

- 如果目录路径不合法，修正 \`directory_path\`
- 如果只是想查看目录内容，不要重试当前工具，应改用 \`list_directory\``;

const LIST_DIRECTORY_DESCRIPTION = `浏览一个已知目录下的内容，或获取整个 Vault 的轻量文件总览，支持 flat、tree 和 vault 三种视图。

## 何时使用

- 已经知道准确目录路径，想查看其中的文件和子目录时
- 需要按名称、大小、正则或树形结构浏览目录时
- 需要快速获取整个 Vault 的文件路径总览，用于 AI 意图规划阶段时

## 何时不使用

- **不要用于发现未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于正文搜索**：按内容搜索请使用 \`search_content\`

## 可用字段

- **directory_path**（可选，默认 \`/\`）：目录路径，相对于 Vault 根目录；\`flat\` 和 \`tree\` 模式使用，根目录可传 \`/\`；\`vault\` 模式只能省略或传 \`/\`
- **view**（可选，默认 \`flat\`）：\`flat\` 返回单层列表，\`tree\` 返回递归目录树，\`vault\` 返回整个 Vault 的文件路径列表
- **include_sizes**（可选，默认 false）：仅 \`flat\` 模式可用，是否返回大小信息
- **sort_by**（可选，默认 \`name\`）：仅 \`flat\` 模式可用，可按名称或大小排序
- **regex**（可选）：仅 \`flat\` 模式可用，用于按名称过滤
- **exclude_patterns**（可选）：仅 \`tree\` 模式可用，用于排除 glob 模式
- **limit**（可选，默认 100）：仅 \`flat\` 模式分页大小，最大 500
- **offset**（可选，默认 0）：仅 \`flat\` 模式偏移量
- **max_depth**（可选，默认 5）：仅 \`tree\` 模式递归深度上限
- **max_nodes**（可选，默认 200）：仅 \`tree\` 模式最多返回的节点数
- **file_extensions**（可选）：仅 \`vault\` 模式可用，文件扩展名过滤数组，例如 \`["md", "ts"]\`，元素不要带点号
- **vault_limit**（可选，默认 1000）：仅 \`vault\` 模式可用，最多返回多少条文件路径，最大 5000；默认值适合 AI 场景的全库概览
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- \`flat\` 模式下可使用 \`include_sizes\`、\`sort_by\`、\`regex\`、\`limit\`、\`offset\`，不要传 \`tree\` 或 \`vault\` 专属参数
- \`tree\` 模式下可使用 \`exclude_patterns\`、\`max_depth\`、\`max_nodes\`，不要传 \`flat\` 或 \`vault\` 专属参数
- \`vault\` 模式下只能从 Vault 根目录遍历；可使用 \`file_extensions\` 和 \`vault_limit\`，不要传 \`flat\` 或 \`tree\` 专属参数
- 结果被截断时，应调整 \`limit\`、\`offset\`、\`max_depth\` 或 \`max_nodes\`

## 返回值

- \`flat\` 模式返回 \`items\` 和 \`meta\`
- \`tree\` 模式返回 \`tree\` 和 \`meta\`
- \`vault\` 模式返回 \`paths\` 和 \`meta\`
- 当 \`include_sizes=true\` 时，还会返回 \`summary\`

## 失败恢复

- 如果目录不存在，先用 \`find_paths\` 定位目录
- 如果只是想查单个文件的路径，不要继续重试此工具，应改用 \`find_paths\`

## 示例

\`\`\`json
{
  "directory_path": "notes",
  "view": "flat",
  "include_sizes": true,
  "sort_by": "name",
  "limit": 50,
  "offset": 0
}
\`\`\`

\`\`\`json
{
  "view": "vault",
  "file_extensions": ["md", "canvas"],
  "vault_limit": 1000
}
\`\`\``;

const MOVE_PATH_DESCRIPTION = `移动或重命名一个已知的文件或目录路径。

## 何时使用

- 已经知道源路径和目标路径，需要重命名时
- 需要把文件或目录移动到新位置时

## 何时不使用

- **不要用于查找未知路径**：请先使用 \`find_paths\`
- **不要用于复制文件**：该工具只负责移动或重命名

## 返回值

返回 \`source_path\`、\`destination_path\` 和 \`moved\`。

## 失败恢复

- 如果源路径不存在，先检查路径或用 \`find_paths\` 定位
- 如果目标路径已存在，换一个目标路径后再重试`;

const FIND_PATHS_DESCRIPTION = `在不知道准确路径时，按名称、名称片段或路径片段查找文件和目录。

## 何时使用

- 用户只给了文件名、目录名或模糊路径片段时
- 在调用 \`read_file\`、\`open_file\`、\`list_directory\` 之前，需要先定位准确路径时

## 何时不使用

- **不要用于读取内容**：读文件请使用 \`read_file\`
- **不要用于浏览已知目录**：浏览目录请使用 \`list_directory\`
- **不要用于正文搜索**：按内容搜索请使用 \`search_content\`

## 可用字段

- **query**（必需）：要查找的文件名、目录名或路径片段
- **scope_path**（可选，默认 \`/\`）：限制查找范围的目录路径
- **target_type**（可选，默认 \`any\`）：限定查找文件、目录或两者
- **match_mode**（可选，默认 \`contains\`）：匹配方式，可选 \`contains\`、\`exact\`、\`prefix\`、\`suffix\`、\`glob\`
- **max_results**（可选，默认 100）：最多返回多少条结果
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 返回值

返回 \`matches\` 数组，每项包含 \`path\`、\`name\`、\`type\`、\`matched_on\`，以及分页元信息 \`meta\`。

## 失败恢复

- 如果结果太多，缩小 \`scope_path\`、提高匹配精度或降低 \`max_results\`
- 找到路径后，应切换到更具体的工具，不要反复重试 \`find_paths\`

## 示例

\`\`\`json
{
  "query": "meeting",
  "scope_path": "notes",
  "target_type": "file",
  "match_mode": "contains",
  "max_results": 20
}
\`\`\``;

const DELETE_PATH_DESCRIPTION = `永久删除一个已知文件或目录路径；删除目录时会递归删除其内容。

## 何时使用

- 用户明确要求删除文件或目录，并且路径已经确认无误时

## 何时不使用

- **不要用于查找路径**：只知道名称时先用 \`find_paths\`
- **不要用于清空文件内容**：清空内容请使用 \`write_file\`
- **不要在路径不确定时执行**：删除是破坏性操作

## 返回值

返回 \`target_path\`、\`existed\` 和 \`deleted\`。

## 失败恢复

- 如果路径不存在，先确认路径是否正确
- 如果目标是根目录，停止操作并修正路径
- 如果只是想重组内容，不要使用删除，改用移动或编辑工具`;

const SEARCH_CONTENT_DESCRIPTION = `递归搜索文件正文内容，支持普通文本匹配和正则匹配。

## 何时使用

- 已经明确要在文件正文里找关键词、短语、模式或代码片段时
- 需要带上下文行地查看匹配位置时

## 何时不使用

- **不要用于按文件名查路径**：请使用 \`find_paths\`
- **不要用于读取某个已知文件的完整内容**：请使用 \`read_file\`

## 可用字段

- **pattern**（必需）：要搜索的文本或正则表达式
- **match_mode**（可选，默认 \`literal\`）：\`literal\` 或 \`regex\`
- **scope_path**（可选，默认 \`/\`）：限制搜索范围的目录
- **file_types**（可选）：扩展名过滤列表，例如 \`["md", "ts"]\`
- **max_results**（可选，默认 50）：返回的最大匹配数量
- **case_sensitive**（可选，默认 false）：是否区分大小写
- **context_lines**（可选，默认 0）：返回命中前后的上下文行数
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 返回值

返回 \`matches\` 和 \`meta\`。其中 \`meta\` 包含 \`scanned_files\`、\`skipped_files\`、\`returned\`、\`has_more\` 等信息。

## 失败恢复

- 如果结果太多，缩小 \`scope_path\`、降低 \`max_results\` 或增加 \`file_types\` 过滤
- 如果只是想读某个已知文件，不要继续重试此工具，应改用 \`read_file\`

## 示例

\`\`\`json
{
  "pattern": "TODO",
  "match_mode": "literal",
  "scope_path": "notes",
  "file_types": ["md"],
  "context_lines": 2
}
\`\`\``;

const QUERY_INDEX_DESCRIPTION = `按结构化参数查询 Vault 的文件元数据、属性统计、标签统计或任务数据。

## 何时使用

- 需要做文件统计、标签统计、属性统计或任务筛选时
- 需要使用结构化字段、过滤、聚合、排序和分组能力时

## 何时不使用

- **不要用于发现未知路径**：查路径请使用 \`find_paths\`
- **不要用于浏览目录结构**：浏览目录请使用 \`list_directory\`
- **不要用于全文搜索**：正文搜索请使用 \`search_content\`

## 可用字段

- **data_source**（必需）：数据源，可选 \`file\`、\`property\`、\`tag\`、\`task\`
- **select**（必需）：返回字段和聚合定义
- **filters**（可选）：过滤条件组合
- **group_by**（可选）：分组字段
- **order_by**（可选）：排序定义
- **limit**（可选，默认 100）：返回行数上限
- **offset**（可选，默认 0）：结果偏移量
- **response_format**（可选，默认 \`json\`）：返回 \`json\` 或 \`text\`

## 参数规则

- 字段名必须使用公开的 snake_case 字段
- \`sum\` 和 \`avg\` 聚合通常需要提供 \`field\`
- \`order_by.field\` 应引用 \`select\` 中已有字段或聚合别名

## 返回值

返回 \`columns\`、\`rows\` 和 \`meta\`。其中 \`meta\` 包含 \`data_source\`、\`total_before_limit\`、\`limit\`、\`offset\` 和 \`truncated\`。

## 失败恢复

- 如果字段名无效，改用公开的 snake_case 字段
- 如果只是要找文件地址，不要继续重试当前工具，应改用 \`find_paths\`

## 示例

\`\`\`json
{
  "data_source": "task",
  "select": {
    "fields": ["file_path", "status"]
  },
  "filters": {
    "match": "all",
    "conditions": [
      {
        "field": "completed",
        "operator": "eq",
        "value": false
      }
    ]
  },
  "limit": 20
}
\`\`\``;

const STAT_PATH_DESCRIPTION = `读取一个已知文件或目录路径的元数据信息。

## 何时使用

- 已经知道准确路径，想查看大小、修改时间、类型等元信息时
- 需要在读内容前先确认目标是文件还是目录时

## 何时不使用

- **不要用于发现未知路径**：只知道名称时先用 \`find_paths\`
- **不要用于读取正文内容**：请使用 \`read_file\`

## 返回值

返回 \`target_path\`、\`type\`、\`size\`、\`created\`、\`modified\` 等元数据字段。

## 失败恢复

- 如果路径不存在，先用 \`find_paths\` 定位准确路径
- 如果只是想读取正文，不要继续重试此工具，应改用 \`read_file\``;

const readTextFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('已知文本文件路径；相对于 Vault 根目录'),
	read_mode: z
		.enum(['full', 'segment', 'head', 'tail'])
		.default('segment')
		.describe("读取模式：segment 分段读取，full 尝试一次读完整篇，head 只读开头，tail 只读结尾"),
	start_line: z
		.number()
		.int()
		.positive()
		.optional()
		.describe('仅 segment 模式可用；从第几行开始读取，第一行为 1，默认 1'),
	line_count: z
		.number()
		.int()
		.positive()
		.max(MAX_READ_SEGMENT_LINES)
		.default(DEFAULT_READ_SEGMENT_LINES)
		.describe(`segment/head/tail 模式读取的行数，默认 ${DEFAULT_READ_SEGMENT_LINES}，最大 ${MAX_READ_SEGMENT_LINES}`),
	response_format: responseFormatSchema,
}).strict();

const readMediaFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('已知媒体文件路径；相对于 Vault 根目录，仅支持图片或音频'),
}).strict();

const readMultipleFilesSchema = z.object({
	file_paths: z
		.array(z.string().min(1))
		.min(1)
		.max(20)
		.describe('已知文件路径数组，最多 20 个'),
	read_mode: z
		.enum(['segment', 'head'])
		.default('segment')
		.describe("批量读取模式：segment 读取每个文件的指定片段，head 读取每个文件的开头片段"),
	start_line: z
		.number()
		.int()
		.positive()
		.optional()
		.describe('仅 segment 模式可用；每个文件从第几行开始读取，第一行为 1，默认 1'),
	line_count: z
		.number()
		.int()
		.positive()
		.max(MAX_READ_SEGMENT_LINES)
		.default(Math.min(80, DEFAULT_READ_SEGMENT_LINES))
		.describe('每个文件返回的行数，用于批量预览，最大 1000'),
	response_format: responseFormatSchema,
}).strict();

const writeFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('目标文本文件路径；相对于 Vault 根目录'),
	content: z.string().describe('要写入文件的完整文本内容，会覆盖原文件'),
}).strict();

const editFileSchema = z.object({
	file_path: z
		.string()
		.min(1)
		.describe('已知文本文件路径；相对于 Vault 根目录'),
	edits: z
		.array(
			z.object({
				oldText: z.string().describe('待替换的原文本，必须能在文件中找到'),
				newText: z.string().describe('替换后的新文本'),
			}).strict()
		)
		.min(1)
		.describe('编辑操作列表，按顺序执行'),
	dry_run: z
		.boolean()
		.default(false)
		.describe('是否只返回 diff 预览而不真正写入，默认 false'),
}).strict();

const directoryPathSchema = z.object({
	directory_path: z
		.string()
		.min(1)
		.describe('目录路径；相对于 Vault 根目录，根目录可传 /'),
}).strict();

const listDirectorySchema = z.object({
	directory_path: z
		.string()
		.min(1)
		.optional()
		.default('/')
		.describe('目录路径；相对于 Vault 根目录，根目录可传 /。flat/tree 模式按该目录浏览，vault 模式只能省略或传 /'),
	view: z
		.enum(['flat', 'tree', 'vault'])
		.default('flat')
		.describe("浏览模式：flat 为单层目录浏览，tree 为递归目录树，vault 为整个 Vault 的轻量文件路径视图"),
	include_sizes: z
		.boolean()
		.default(false)
		.describe('仅 flat 模式可用；返回文件大小与目录汇总'),
	sort_by: z
		.enum(['name', 'size'])
		.default('name')
		.describe("仅 flat 模式可用；返回结果按名称或大小排序"),
	regex: z
		.string()
		.optional()
		.describe('仅 flat 模式可用；按名称过滤目录项的 JavaScript 正则表达式'),
	exclude_patterns: z
		.array(z.string())
		.optional()
		.default([])
		.describe('仅 tree 模式可用；排除的 glob 模式列表'),
	limit: z
		.number()
		.int()
		.positive()
		.max(500)
		.default(100)
		.describe('仅 flat 模式可用；分页返回时每页最多返回多少个目录项，默认 100。'),
	offset: z
		.number()
		.int()
		.min(0)
		.default(0)
		.describe('仅 flat 模式可用；分页偏移量，默认从第 0 个结果开始。'),
	max_depth: z
		.number()
		.int()
		.positive()
		.max(20)
		.default(5)
		.describe('仅 tree 模式可用；递归展开目录树的最大深度，默认 5。'),
	max_nodes: z
		.number()
		.int()
		.positive()
		.max(2_000)
		.default(200)
		.describe('仅 tree 模式可用；目录树最多返回的节点数量，默认 200。'),
	file_extensions: z
		.array(z.string().min(1))
		.optional()
		.default([])
		.describe('仅 vault 模式可用；文件扩展名过滤数组，例如 ["md", "ts"]，元素不要带点号'),
	vault_limit: z
		.number()
		.int()
		.positive()
		.max(5_000)
		.default(1_000)
		.describe('仅 vault 模式可用；最多返回多少条文件路径，默认 1000，最大 5000'),
	response_format: responseFormatSchema,
}).strict();

const moveFileSchema = z.object({
	source_path: z.string().min(1).describe('源文件或文件夹路径；相对于 Vault 根目录'),
	destination_path: z.string().min(1).describe('目标文件或文件夹路径；相对于 Vault 根目录'),
}).strict();

const findPathsSchema = z.object({
	query: z
		.string()
		.min(1)
		.describe('要查找的文件名、目录名或路径片段；当只知道名称不知道路径时使用'),
	scope_path: z
		.string()
		.optional()
		.default('/')
		.describe('限制查找范围的目录路径；默认为整个 Vault'),
	target_type: z
		.enum(['any', 'file', 'directory'])
		.default('any')
		.describe('限定查找文件、目录或两者'),
	match_mode: z
		.enum(['contains', 'exact', 'prefix', 'suffix', 'glob'])
		.default('contains')
		.describe("名称匹配方式：默认 contains，支持 exact/prefix/suffix/glob"),
	max_results: z
		.number()
		.int()
		.positive()
		.max(500)
		.default(100)
		.describe('返回结果的最大数量，默认 100'),
	response_format: responseFormatSchema,
}).strict();

const getFileInfoSchema = z.object({
	target_path: z
		.string()
		.min(1)
		.describe('已知文件或目录路径；相对于 Vault 根目录，根目录可传 /'),
	response_format: responseFormatSchema,
}).strict();

const deleteFileSchema = z.object({
	target_path: z
		.string()
		.min(1)
		.describe('要删除的文件或文件夹路径；相对于 Vault 根目录'),
	force: z
		.boolean()
		.optional()
		.default(true)
		.describe('删除文件夹时是否强制递归删除隐藏内容，默认 true'),
}).strict();

const searchContentSchema = z.object({
	pattern: z
		.string()
		.min(1)
		.describe('要搜索的内容。match_mode=literal 时按普通文本匹配；match_mode=regex 时按正则表达式匹配'),
	match_mode: z
		.enum(['literal', 'regex'])
		.default('literal')
		.describe("匹配模式：literal 表示普通文本匹配，regex 表示正则匹配"),
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

const queryIndexScalarSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);

const queryIndexSchema = z.object({
	data_source: z
		.enum(['file', 'property', 'tag', 'task'])
		.describe('索引数据源：file 文件元数据，property 属性统计，tag 标签统计，task 任务数据'),
	select: z.object({
		fields: z
			.array(z.string().min(1))
			.optional()
			.default([])
			.describe('要返回的字段名数组，字段名使用公开的 snake_case 形式'),
		aggregates: z
			.array(
				z.object({
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
				}).strict()
			)
			.optional()
			.default([])
			.describe('可选的聚合计算数组'),
	}).strict().describe('要返回的字段和聚合定义'),
	filters: z
		.object({
			match: z
				.enum(['all', 'any'])
				.default('all')
				.describe('多个条件如何组合：all 表示全部满足，any 表示满足任一条件'),
			conditions: z
				.array(
					z.object({
						field: z
							.string()
							.min(1)
							.describe('过滤字段名，使用公开的 snake_case 字段'),
						operator: z
							.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'matches'])
							.describe('过滤运算符'),
						value: z
							.union([queryIndexScalarSchema, z.array(queryIndexScalarSchema).min(1)])
							.describe('过滤值；operator=in 时应传数组'),
					}).strict()
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
		}).strict()
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

type ReadTextFileArgs = z.infer<typeof readTextFileSchema>;
type ReadMultipleFilesArgs = z.infer<typeof readMultipleFilesSchema>;
type ListDirectoryArgs = z.infer<typeof listDirectorySchema>;
type QueryIndexArgs = z.infer<typeof queryIndexSchema>;

const parseReadTextFileArgs = (args: ReadTextFileArgs): ReadTextFileArgs => {
	if (args.start_line !== undefined && args.read_mode !== 'segment') {
		throw new Error(`${args.read_mode} 模式不支持参数 start_line`);
	}
	return args;
};

const parseReadMultipleFilesArgs = (
	args: ReadMultipleFilesArgs
): ReadMultipleFilesArgs => {
	if (args.start_line !== undefined && args.read_mode !== 'segment') {
		throw new Error(`${args.read_mode} 模式不支持参数 start_line`);
	}
	return args;
};

const parseListDirectoryArgs = (args: ListDirectoryArgs): ListDirectoryArgs => {
	if (args.view === 'vault') {
		if (args.include_sizes !== false) {
			throw new Error('vault 模式不支持参数 include_sizes');
		}
		if (args.sort_by !== 'name') {
			throw new Error('vault 模式不支持参数 sort_by');
		}
		if (args.regex !== undefined) {
			throw new Error('vault 模式不支持参数 regex');
		}
		if ((args.exclude_patterns?.length ?? 0) > 0) {
			throw new Error('vault 模式不支持参数 exclude_patterns');
		}
		if (args.limit !== 100) {
			throw new Error('vault 模式不支持参数 limit');
		}
		if (args.offset !== 0) {
			throw new Error('vault 模式不支持参数 offset');
		}
		if (args.max_depth !== 5) {
			throw new Error('vault 模式不支持参数 max_depth');
		}
		if (args.max_nodes !== 200) {
			throw new Error('vault 模式不支持参数 max_nodes');
		}
		const normalizedPath = normalizeDirectoryPath(args.directory_path ?? '/', 'directory_path');
		if (normalizedPath !== '') {
			throw new Error('vault 模式只支持从 Vault 根目录遍历；请省略 directory_path 或传 /');
		}
		return args;
	}

	if (args.view === 'tree') {
		if (args.regex !== undefined) {
			throw new Error('tree 模式不支持参数 regex');
		}
		if (args.include_sizes !== false) {
			throw new Error('tree 模式不支持参数 include_sizes');
		}
		if (args.sort_by !== 'name') {
			throw new Error('tree 模式不支持参数 sort_by');
		}
		if (args.limit !== 100) {
			throw new Error('tree 模式不支持参数 limit');
		}
		if (args.offset !== 0) {
			throw new Error('tree 模式不支持参数 offset');
		}
		if ((args.file_extensions?.length ?? 0) > 0) {
			throw new Error('tree 模式不支持参数 file_extensions');
		}
		if (args.vault_limit !== 1_000) {
			throw new Error('tree 模式不支持参数 vault_limit');
		}
		return args;
	}

	if ((args.exclude_patterns?.length ?? 0) > 0) {
		throw new Error('flat 模式不支持参数 exclude_patterns');
	}
	if (args.max_depth !== 5) {
		throw new Error('flat 模式不支持参数 max_depth');
	}
	if (args.max_nodes !== 200) {
		throw new Error('flat 模式不支持参数 max_nodes');
	}
	if ((args.file_extensions?.length ?? 0) > 0) {
		throw new Error('flat 模式不支持参数 file_extensions');
	}
	if (args.vault_limit !== 1_000) {
		throw new Error('flat 模式不支持参数 vault_limit');
	}
	return args;
};

const parseQueryIndexArgs = (args: QueryIndexArgs): QueryIndexArgs => {
	if (
		(args.select.fields?.length ?? 0) === 0
		&& (args.select.aggregates?.length ?? 0) === 0
	) {
		throw new Error('select.fields 或 select.aggregates 至少需要提供一个');
	}

	for (const aggregate of args.select.aggregates ?? []) {
		if ((aggregate.aggregate === 'sum' || aggregate.aggregate === 'avg') && !aggregate.field) {
			throw new Error(`${aggregate.aggregate} 聚合必须提供 field`);
		}
	}

	for (const condition of args.filters?.conditions ?? []) {
		if (condition.operator === 'in' && !Array.isArray(condition.value)) {
			throw new Error('operator=in 时 value 必须是数组');
		}
		if (condition.operator !== 'in' && Array.isArray(condition.value)) {
			throw new Error(`operator=${condition.operator} 时 value 不能是数组`);
		}
	}

	return args;
};

const mimeTypes: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	bmp: 'image/bmp',
	svg: 'image/svg+xml',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	ogg: 'audio/ogg',
	flac: 'audio/flac',
	m4a: 'audio/mp4',
};

const normalizeDirectoryPath = (input: string, fieldName = 'path'): string => {
	const normalized = normalizeVaultPath(input);
	assertVaultPathOrRoot(normalized, fieldName);
	return normalized;
};

const normalizeFilePath = (input: string, fieldName = 'path'): string => {
	const normalized = normalizeVaultPath(input);
	assertVaultPath(normalized, fieldName);
	return normalized;
};

const toRelativeChildPath = (basePath: string, childPath: string): string => {
	if (!basePath) return childPath;
	return childPath.startsWith(`${basePath}/`)
		? childPath.slice(basePath.length + 1)
		: childPath;
};

const formatSize = (bytes: number): string => {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return '0 B';
	}
	const unitIndex = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1
	);
	if (unitIndex <= 0) {
		return `${bytes} B`;
	}
	return `${(bytes / Math.pow(1024, unitIndex)).toFixed(2)} ${units[unitIndex]}`;
};

const normalizeLineEndings = (text: string): string => text.replace(/\r\n/g, '\n');

const MAX_CONTENT_SEARCH_FILE_SIZE_BYTES = 2 * 1024 * 1024;

const binaryFileExtensions = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'svg',
	'ico',
	'mp3',
	'wav',
	'ogg',
	'flac',
	'm4a',
	'mp4',
	'mov',
	'avi',
	'pdf',
	'zip',
	'gz',
	'tar',
	'7z',
	'rar',
	'exe',
	'dll',
	'so',
	'bin',
	'woff',
	'woff2',
	'ttf',
	'eot',
]);

const formatLocal = (template: string, ...values: Array<string | number>): string => {
	return values.reduce<string>((text, value, index) => {
		return text.replace(new RegExp(`\\{${index}\\}`, 'g'), String(value));
	}, template);
};

const normalizeFileTypeFilters = (fileTypes?: string[]): string[] | null => {
	const rawValues = fileTypes ?? [];
	if (rawValues.length === 0) {
		return null;
	}
	const normalized = rawValues.map((part) =>
		String(part ?? '').trim().replace(/^\./, '').toLowerCase()
	);
	if (normalized.some((part) => !part)) {
		throw new Error(localInstance.mcp_fs_search_content_invalid_file_type);
	}
	return Array.from(new Set(normalized));
};

const createContentSearchRegex = (
	pattern: string,
	matchMode: 'literal' | 'regex',
	caseSensitive: boolean
): RegExp => {
	const normalizedPattern =
		matchMode === 'literal'
			? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			: pattern;
	try {
		return new RegExp(normalizedPattern, caseSensitive ? '' : 'i');
	} catch (error) {
		throw new Error(
			`非法正则表达式: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
};

const isPathUnderDirectory = (rootPath: string, targetPath: string): boolean => {
	if (!rootPath) {
		return true;
	}
	return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);
};

const createContextEntries = (
	lines: string[],
	startLine: number,
	endLine: number
): ContentSearchContextEntry[] => {
	const entries: ContentSearchContextEntry[] = [];
	for (let index = startLine; index <= endLine; index += 1) {
		if (index < 0 || index >= lines.length) {
			continue;
		}
		entries.push({
			line: index + 1,
			text: lines[index],
		});
	}
	return entries;
};

const applyEditsToText = (
	originalText: string,
	edits: EditOperation[],
	filePath: string,
	dryRun: boolean
): { diff: string; modifiedText: string } => {
	const normalizedOriginal = normalizeLineEndings(originalText);
	let modifiedText = normalizedOriginal;

	for (const edit of edits) {
		const normalizedOld = normalizeLineEndings(edit.oldText);
		const normalizedNew = normalizeLineEndings(edit.newText);

		if (modifiedText.includes(normalizedOld)) {
			modifiedText = modifiedText.replace(normalizedOld, normalizedNew);
			continue;
		}

		const oldLines = normalizedOld.split('\n');
		const contentLines = modifiedText.split('\n');
		let matched = false;

		for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
			const potentialMatch = contentLines.slice(i, i + oldLines.length);
			const isMatch = oldLines.every((oldLine, index) => {
				return oldLine.trim() === potentialMatch[index]?.trim();
			});

			if (!isMatch) continue;

			const originalIndent = contentLines[i]?.match(/^\s*/)?.[0] ?? '';
			const replacementLines = normalizedNew.split('\n').map((line, index) => {
				if (index === 0) {
					return originalIndent + line.trimStart();
				}
				const oldIndent = oldLines[index]?.match(/^\s*/)?.[0] ?? '';
				const newIndent = line.match(/^\s*/)?.[0] ?? '';
				if (oldIndent && newIndent) {
					const relativeIndent = Math.max(0, newIndent.length - oldIndent.length);
					return `${originalIndent}${' '.repeat(relativeIndent)}${line.trimStart()}`;
				}
				return line;
			});

			contentLines.splice(i, oldLines.length, ...replacementLines);
			modifiedText = contentLines.join('\n');
			matched = true;
			break;
		}

		if (!matched) {
			throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
		}
	}

	const diff = createTwoFilesPatch(
		filePath,
		filePath,
		normalizedOriginal,
		modifiedText,
		'original',
		'modified'
	);
	return {
		diff,
		modifiedText: dryRun ? normalizedOriginal : modifiedText,
	};
};

const splitTextLines = (text: string): string[] => {
	const normalized = normalizeLineEndings(text);
	if (!normalized) {
		return [];
	}
	return normalized.split('\n');
};

const createReadFilePayload = (
	filePath: string,
	content: string,
	readMode: ReadMode,
	lineCount: number,
	startLine = 1
): Record<string, unknown> => {
	const lines = splitTextLines(content);
	const totalLines = lines.length;

	if (readMode === 'full') {
		if (content.length > DEFAULT_TEXT_FILE_MAX_CHARS) {
			return {
				file_path: filePath,
				read_mode: readMode,
				content: '',
				total_lines: totalLines,
				returned_start_line: null,
				returned_end_line: null,
				has_more: true,
				next_start_line: 1,
				truncated: true,
				warning: `full 模式最多返回 ${DEFAULT_TEXT_FILE_MAX_CHARS} 个字符；当前文件过长，请改用 segment 模式分段读取`,
				suggested_next_call: {
					tool_name: 'read_file',
					args: {
						file_path: filePath,
						read_mode: 'segment',
						start_line: 1,
						line_count: Math.min(lineCount, DEFAULT_READ_SEGMENT_LINES),
					},
				},
			};
		}

		return {
			file_path: filePath,
			read_mode: readMode,
			content: normalizeLineEndings(content),
			total_lines: totalLines,
			returned_start_line: totalLines > 0 ? 1 : null,
			returned_end_line: totalLines > 0 ? totalLines : null,
			has_more: false,
			next_start_line: null,
			truncated: false,
			warning: null,
			suggested_next_call: null,
		};
	}

	const safeLineCount = Math.max(1, lineCount);
	let startIndex = 0;
	let endIndex = 0;

	if (readMode === 'segment') {
		startIndex = Math.max(0, startLine - 1);
		endIndex = Math.min(totalLines, startIndex + safeLineCount);
	} else if (readMode === 'head') {
		startIndex = 0;
		endIndex = Math.min(totalLines, safeLineCount);
	} else {
		startIndex = Math.max(0, totalLines - safeLineCount);
		endIndex = totalLines;
	}

	const selectedLines = lines.slice(startIndex, endIndex);
	const returnedStartLine = selectedLines.length > 0 ? startIndex + 1 : null;
	const returnedEndLine = selectedLines.length > 0 ? endIndex : null;
	const hasMore =
		readMode === 'tail'
			? startIndex > 0
			: endIndex < totalLines;
	const nextStartLine =
		readMode === 'tail' || !hasMore || returnedEndLine === null
			? null
			: returnedEndLine + 1;
	const suggestedNextCall =
		nextStartLine === null
			? null
			: {
				tool_name: 'read_file',
				args: {
					file_path: filePath,
					read_mode: 'segment',
					start_line: nextStartLine,
					line_count: safeLineCount,
				},
			};

	return {
		file_path: filePath,
		read_mode: readMode,
		content: selectedLines.join('\n'),
		total_lines: totalLines,
		returned_start_line: returnedStartLine,
		returned_end_line: returnedEndLine,
		has_more: hasMore,
		next_start_line: nextStartLine,
		truncated: hasMore,
		warning:
			readMode === 'tail' && hasMore
				? 'tail 模式只返回末尾片段；如果需要继续向前阅读，请改用 segment 模式'
				: null,
		suggested_next_call: suggestedNextCall,
	};
};

const asStructuredOrText = <T extends Record<string, unknown>>(
	responseFormat: BuiltinResponseFormat,
	value: T,
	textFactory?: (structured: T) => string
): T | string => {
	if (responseFormat === 'json') {
		return value;
	}
	return textFactory ? textFactory(value) : toCanonicalJsonText(value);
};

const toBase64 = (buffer: ArrayBuffer): string =>
	Buffer.from(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer).toString(
		'base64'
	);

const getMimeType = (path: string): string => {
	const extension = path.split('.').pop()?.toLowerCase() ?? '';
	return mimeTypes[extension] ?? 'application/octet-stream';
};

const assertQueryIndexIdentifier = (value: string, label: string): void => {
	if (!QUERY_INDEX_IDENTIFIER_REGEX.test(value)) {
		throw new Error(`${label} 必须是字母、数字和下划线组成的标识符，且不能以数字开头`);
	}
};

const listQueryIndexFields = (dataSource: QueryIndexDataSource): string =>
	Object.keys(QUERY_INDEX_PUBLIC_FIELDS[dataSource]).sort().join(', ');

const toQueryIndexInternalField = (
	dataSource: QueryIndexDataSource,
	publicField: string,
	label: string
): string => {
	const normalized = publicField.trim();
	const mapped = QUERY_INDEX_PUBLIC_FIELDS[dataSource][normalized];
	if (!mapped) {
		throw new Error(
			`${label} "${publicField}" 无效。${dataSource} 可用字段: ${listQueryIndexFields(dataSource)}`
		);
	}
	return mapped;
};

const toQueryIndexLiteral = (
	value: QueryIndexScalar | QueryIndexScalar[]
): string => {
	if (Array.isArray(value)) {
		return `[${value.map((item) => toQueryIndexLiteral(item)).join(', ')}]`;
	}
	if (typeof value === 'string') {
		return JSON.stringify(value);
	}
	if (value === null) {
		return 'null';
	}
	return String(value);
};

const buildQueryIndexExpression = (input: z.infer<typeof queryIndexSchema>): string => {
	const publicFields = input.select.fields ?? [];
	const aggregates = input.select.aggregates ?? [];
	const selectParts: string[] = [];

	for (const field of publicFields) {
		const internalField = toQueryIndexInternalField(input.data_source, field, 'select.fields');
		selectParts.push(`${internalField} as ${field}`);
	}

	for (const aggregate of aggregates) {
		const alias =
			aggregate.alias
			|| (aggregate.aggregate === 'count'
				? 'count'
				: `${aggregate.aggregate}_${aggregate.field}`);
		assertQueryIndexIdentifier(alias, 'aggregate alias');
		if (aggregate.aggregate === 'count') {
			selectParts.push(`count() as ${alias}`);
			continue;
		}
		const field = toQueryIndexInternalField(
			input.data_source,
			aggregate.field ?? '',
			'select.aggregates.field'
		);
		selectParts.push(`${aggregate.aggregate}(${field}) as ${alias}`);
	}

	const expressionParts = [
		`select(${selectParts.join(', ')})`,
		`from(${input.data_source})`,
	];

	if (input.filters && input.filters.conditions.length > 0) {
		const operator = input.filters.match === 'any' ? ' || ' : ' && ';
		const conditionText = input.filters.conditions
			.map((condition) => {
				const internalField = toQueryIndexInternalField(
					input.data_source,
					condition.field,
					'filters.conditions.field'
				);
				const mappedOperator = {
					eq: '==',
					ne: '!=',
					gt: '>',
					gte: '>=',
					lt: '<',
					lte: '<=',
					contains: 'contains',
					in: 'in',
					matches: 'matches',
				}[condition.operator];
				return `${internalField} ${mappedOperator} ${toQueryIndexLiteral(condition.value)}`;
			})
			.join(operator);
		expressionParts.push(`where(${conditionText})`);
	}

	if (input.group_by) {
		expressionParts.push(
			`groupBy(${toQueryIndexInternalField(input.data_source, input.group_by, 'group_by')})`
		);
	}

	if (input.order_by) {
		assertQueryIndexIdentifier(input.order_by.field, 'order_by.field');
		expressionParts.push(
			`orderBy(${input.order_by.field} ${input.order_by.direction})`
		);
	}

	if (input.limit !== undefined) {
		expressionParts.push(`limit(${input.limit})`);
	}
	if (input.offset !== undefined) {
		expressionParts.push(`offset(${input.offset})`);
	}

	return expressionParts.join('.');
};

const toQueryIndexResponse = (
	result: Awaited<ReturnType<typeof executeVaultQuery>>
): Record<string, unknown> => ({
	columns: result.columns,
	rows: result.rows,
	meta: {
		data_source: result.meta.dataSource,
		total_before_limit: result.meta.totalBeforeLimit,
		returned: result.meta.returned,
		limit: result.meta.limit,
		offset: result.meta.offset,
		truncated: result.meta.truncated,
	},
});

const isExcludedByPatterns = (
	relativePath: string,
	patterns: string[]
): boolean => {
	return patterns.some((pattern) => {
		if (minimatch(relativePath, pattern, { dot: true })) {
			return true;
		}
		return (
			minimatch(relativePath, `**/${pattern}`, { dot: true })
			|| minimatch(relativePath, `**/${pattern}/**`, { dot: true })
		);
	});
};

const collectDescendants = (folder: TFolder): TAbstractFile[] => {
	const collected: TAbstractFile[] = [];
	for (const child of folder.children) {
		collected.push(child);
		if (child instanceof TFolder) {
			collected.push(...collectDescendants(child));
		}
	}
	return collected;
};

const collectVaultFilePaths = (app: App, fileExtensions: string[] | null): string[] =>
	app.vault
		.getFiles()
		.filter((file) => {
			if (!fileExtensions || fileExtensions.length === 0) {
				return true;
			}
			return fileExtensions.includes(file.extension.toLowerCase());
		})
		.map((file) => file.path)
		.sort((a, b) => a.localeCompare(b));

const buildDirectoryTree = (
	folder: TFolder,
	rootPath: string,
	excludePatterns: string[],
	maxDepth: number,
	maxNodes: number,
	state: { nodes: number; truncated: boolean },
	currentDepth = 1
): FilesystemEntry[] => {
	const result: FilesystemEntry[] = [];

	for (const child of folder.children) {
		if (state.nodes >= maxNodes) {
			state.truncated = true;
			break;
		}
		const relativePath = toRelativeChildPath(rootPath, child.path);
		if (isExcludedByPatterns(relativePath, excludePatterns)) {
			continue;
		}
		state.nodes += 1;

		if (child instanceof TFolder) {
			if (currentDepth >= maxDepth) {
				state.truncated = true;
				result.push({
					name: child.name,
					type: 'directory',
				});
				continue;
			}
			result.push({
				name: child.name,
				type: 'directory',
				children: buildDirectoryTree(
					child,
					rootPath,
					excludePatterns,
					maxDepth,
					maxNodes,
					state,
					currentDepth + 1
				),
			});
			continue;
		}

		result.push({
			name: child.name,
			type: 'file',
		});
	}

	return result;
};

const normalizeSearchText = (value: string): string => value.trim().toLowerCase();

const matchSearchCandidate = (
	query: string,
	matchMode: 'contains' | 'exact' | 'prefix' | 'suffix' | 'glob',
	candidate: string
): boolean => {
	const normalizedCandidate = candidate.toLowerCase();
	if (matchMode === 'glob') {
		return minimatch(normalizedCandidate, query.toLowerCase(), {
			dot: true,
			nocase: true,
		});
	}

	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return false;

	switch (matchMode) {
		case 'exact':
			return normalizedCandidate === normalizedQuery;
		case 'prefix':
			return normalizedCandidate.startsWith(normalizedQuery);
		case 'suffix':
			return normalizedCandidate.endsWith(normalizedQuery);
		case 'contains':
		default:
			return normalizedCandidate.includes(normalizedQuery);
	}
};

const getPathSearchMatchMeta = (
	query: string,
	matchMode: 'contains' | 'exact' | 'prefix' | 'suffix' | 'glob',
	name: string,
	relativePath: string
): { matched_on: 'name' | 'path'; score: number } | null => {
	const normalizedName = name.toLowerCase();
	const normalizedRelativePath = relativePath.toLowerCase();
	const normalizedQuery = normalizeSearchText(query);

	if (matchMode === 'contains') {
		if (normalizedName === normalizedQuery) {
			return { matched_on: 'name', score: 0 };
		}
		if (normalizedName.startsWith(normalizedQuery)) {
			return { matched_on: 'name', score: 1 };
		}
		if (normalizedName.includes(normalizedQuery)) {
			return { matched_on: 'name', score: 2 };
		}
		if (normalizedRelativePath === normalizedQuery) {
			return { matched_on: 'path', score: 3 };
		}
		if (normalizedRelativePath.startsWith(normalizedQuery)) {
			return { matched_on: 'path', score: 4 };
		}
		if (normalizedRelativePath.includes(normalizedQuery)) {
			return { matched_on: 'path', score: 5 };
		}
		return null;
	}

	if (matchSearchCandidate(query, matchMode, name)) {
		return { matched_on: 'name', score: 0 };
	}
	if (matchSearchCandidate(query, matchMode, relativePath)) {
		return { matched_on: 'path', score: 1 };
	}
	return null;
};

const shouldSkipContentSearchFile = (
	file: TFile,
	allowedExtensions: string[] | null
): string | null => {
	const extension = file.extension?.toLowerCase() ?? '';
	if (allowedExtensions && allowedExtensions.length > 0) {
		if (!allowedExtensions.includes(extension)) {
			return 'filtered';
		}
	}
	if (binaryFileExtensions.has(extension)) {
		return localInstance.mcp_fs_search_content_skipped_binary;
	}
	if ((file.stat?.size ?? 0) > MAX_CONTENT_SEARCH_FILE_SIZE_BYTES) {
		return localInstance.mcp_fs_search_content_skipped_large;
	}
	return null;
};

export async function createFilesystemBuiltinRuntime(
	app: App
): Promise<FilesystemBuiltinRuntime> {
	const registry = new BuiltinToolRegistry();
	registerFilesystemTools(app, registry);
	let closed = false;

	const context = {
		app,
		callTool: async (): Promise<unknown> => {
			throw new Error('filesystem runtime 不支持跨工具调用');
		},
	};

	const close = async (): Promise<void> => {
		closed = true;
		registry.clear();
	};

	return {
		serverId: BUILTIN_FILESYSTEM_SERVER_ID,
		serverName: BUILTIN_FILESYSTEM_SERVER_NAME,
		client: {} as Client,
		callTool: async (name: string, args: Record<string, unknown>) => {
			if (closed) {
				throw new Error('Filesystem builtin runtime 已关闭');
			}
			try {
				const result = await registry.call(name, args, context);
				return serializeMcpToolResult(normalizeStructuredToolResult(result));
			} catch (error) {
				return formatToolError(error);
			}
		},
		listTools: async () => {
			if (closed) {
				throw new Error('Filesystem builtin runtime 已关闭');
			}
			return registry.listTools(BUILTIN_FILESYSTEM_SERVER_ID);
		},
		close,
	};
}

const createReadMediaHandler = (app: App) => async (args: unknown) => {
	try {
		const { file_path } = readMediaFileSchema.parse(args);
		const normalizedPath = normalizeFilePath(file_path, 'file_path');
		const file = getFileOrThrow(app, normalizedPath);
		const binary = await app.vault.readBinary(file);
		const mimeType = getMimeType(normalizedPath);
		return {
			content: [
				{
					type: (mimeType.startsWith('image/')
						? 'image'
						: mimeType.startsWith('audio/')
							? 'audio'
							: 'blob') as 'image' | 'audio' | 'blob',
					data: toBase64(binary),
					mimeType,
				},
			],
		};
	} catch (error) {
		return {
			isError: true,
			content: [
				{
					type: 'text' as const,
					text: error instanceof Error ? error.message : String(error),
				},
			],
		};
	}
};

export function registerFilesystemBuiltinTools(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	registerBuiltinTool(
		server,
		registry,
		'read_file',
		{
			title: '读取文本文件',
			description: READ_FILE_DESCRIPTION,
			inputSchema: readTextFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async ({
			file_path,
			read_mode = 'segment',
			start_line,
			line_count = DEFAULT_READ_SEGMENT_LINES,
			response_format = 'json',
		}) => {
			parseReadTextFileArgs({
				file_path,
				read_mode,
				start_line,
				line_count,
				response_format,
			});
			const normalizedPath = normalizeFilePath(file_path, 'file_path');
			const file = getFileOrThrow(app, normalizedPath);
			const content = await app.vault.cachedRead(file);
			const payload = createReadFilePayload(
				normalizedPath,
				content,
				read_mode,
				line_count,
				start_line ?? 1
			);
			return asStructuredOrText(
				response_format,
				payload,
				(structured) => {
					const parts = [String(structured.content ?? '')];
					if (structured.warning) {
						parts.push(`[提示] ${String(structured.warning)}`);
					}
					if (structured.has_more && structured.next_start_line) {
						parts.push(
							`[更多内容可用，下一次从第 ${String(structured.next_start_line)} 行继续读取]`
						);
					}
					return parts.filter(Boolean).join('\n');
				}
			);
		}
	);

	const readMediaHandler = createReadMediaHandler(app);
	registry.register({
		name: 'read_media',
		title: '读取媒体文件',
		description: READ_MEDIA_DESCRIPTION,
		inputSchema: readMediaFileSchema,
		annotations: readOnlyToolAnnotations,
		execute: async (args) => await readMediaHandler(args),
	});
	(server as any).registerTool(
		'read_media',
		{
			title: '读取媒体文件',
			description: READ_MEDIA_DESCRIPTION,
			inputSchema: readMediaFileSchema,
			annotations: readOnlyToolAnnotations,
		},
		async (args: Record<string, unknown>) => await readMediaHandler(args)
	);

	registerBuiltinTool(
		server,
		registry,
		'read_files',
		{
			title: '批量读取文本文件',
			description: READ_FILES_DESCRIPTION,
			inputSchema: readMultipleFilesSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async ({
			file_paths,
			read_mode = 'segment',
			start_line,
			line_count = Math.min(80, DEFAULT_READ_SEGMENT_LINES),
			response_format = 'json',
		}) => {
			parseReadMultipleFilesArgs({
				file_paths,
				read_mode,
				start_line,
				line_count,
				response_format,
			});
				const files = await Promise.all(
					file_paths.map(async (filePath: string) => {
					try {
						const normalizedPath = normalizeFilePath(filePath);
						const file = getFileOrThrow(app, normalizedPath);
						const content = await app.vault.cachedRead(file);
						return {
							...createReadFilePayload(
								normalizedPath,
								content,
								read_mode === 'head' ? 'head' : 'segment',
								line_count,
								start_line ?? 1
							),
							error: null,
						};
					} catch (error) {
						return {
							file_path: filePath,
							content: '',
							read_mode,
							total_lines: null,
							returned_start_line: null,
							returned_end_line: null,
							has_more: false,
							next_start_line: null,
							truncated: false,
							warning: null,
							suggested_next_call: null,
							error: error instanceof Error ? error.message : String(error),
						};
					}
				})
			);
			return asStructuredOrText(
				response_format,
				{
					files,
					meta: {
						returned: files.length,
						read_mode,
						line_count,
					},
				},
				(structured) =>
					(structured.files as Array<{
						file_path: string;
						content: string;
						error: string | null;
					}>)
						.map((file) =>
							file.error
								? `${file.file_path}: Error - ${file.error}`
								: `${file.file_path}:\n${file.content}`
						)
						.join('\n---\n')
			);
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'write_file',
		{
			title: '写入文本文件',
			description: WRITE_FILE_DESCRIPTION,
			inputSchema: writeFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ file_path, content }) => {
			const normalizedPath = normalizeFilePath(file_path, 'file_path');
			await ensureParentFolderExists(app, normalizedPath);
			const existing = app.vault.getAbstractFileByPath(normalizedPath);
			const existed = !!existing;
			if (!existing) {
				await app.vault.create(normalizedPath, content);
			} else if (existing instanceof TFile) {
				await app.vault.modify(existing, content);
			} else {
				throw new Error(`目标不是文件: ${normalizedPath}`);
			}
			return {
				file_path: normalizedPath,
				action: existed ? 'updated' : 'created',
				bytes_written: content.length,
			};
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'edit_file',
		{
			title: '编辑文本文件',
			description: EDIT_FILE_DESCRIPTION,
			inputSchema: editFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ file_path, edits, dry_run = false }) => {
			const normalizedPath = normalizeFilePath(file_path, 'file_path');
			const file = getFileOrThrow(app, normalizedPath);
			const originalText = await app.vault.cachedRead(file);
			const { diff, modifiedText } = applyEditsToText(
				originalText,
				edits,
				normalizedPath,
				dry_run
			);
			if (!dry_run) {
				await app.vault.modify(file, modifiedText);
			}
			return {
				file_path: normalizedPath,
				dry_run,
				applied_edits: edits.length,
				updated: !dry_run,
				diff,
			};
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'create_directory',
		{
			title: '创建目录',
			description: CREATE_DIRECTORY_DESCRIPTION,
			inputSchema: directoryPathSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ directory_path }) => {
			const normalizedPath = normalizeDirectoryPath(directory_path, 'directory_path');
			const existed = !!app.vault.getAbstractFileByPath(normalizedPath);
			await ensureFolderExists(app, normalizedPath);
			return {
				directory_path: normalizedPath || '/',
				created: !existed,
				existed,
			};
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'list_directory',
		{
			title: '列出目录内容',
			description: LIST_DIRECTORY_DESCRIPTION,
			inputSchema: listDirectorySchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async ({
			directory_path = '/',
			view = 'flat',
			include_sizes = false,
			sort_by = 'name',
			regex,
			exclude_patterns = [],
			limit = 100,
			offset = 0,
			max_depth = 5,
			max_nodes = 200,
			file_extensions = [],
			vault_limit = 1_000,
			response_format = 'json',
		}) => {
			parseListDirectoryArgs({
				directory_path,
				view,
				include_sizes,
				sort_by,
				regex,
				exclude_patterns,
				limit,
				offset,
				max_depth,
				max_nodes,
				file_extensions,
				vault_limit,
				response_format,
			});
			if (view === 'vault') {
				const normalizedExtensions = normalizeFileTypeFilters(file_extensions);
				const allPaths = collectVaultFilePaths(app, normalizedExtensions);
				const paths = allPaths.slice(0, vault_limit);
				const payload = {
					directory_path: '/',
					view,
					paths,
					meta: {
						returned: paths.length,
						truncated: allPaths.length > vault_limit,
						file_extensions: normalizedExtensions ?? [],
						vault_limit,
						total_before_limit: allPaths.length,
					},
				};
				return asStructuredOrText(
					response_format,
					payload,
					(structured) => {
						const textPaths = structured.paths as string[];
						const meta = structured.meta as {
							truncated: boolean;
							total_before_limit: number;
						};
						return [
							...textPaths,
							...(meta.truncated
								? [`[结果已截断，共有 ${meta.total_before_limit} 个文件，请调整 file_extensions 过滤条件或增大 vault_limit]`]
								: []),
						].join('\n');
					}
				);
			}

			const normalizedPath = normalizeDirectoryPath(directory_path, 'directory_path');
			const folder = getFolderOrThrow(app, normalizedPath);
			if (view === 'tree') {
				const state = { nodes: 0, truncated: false };
				const tree = buildDirectoryTree(
					folder,
					normalizedPath,
					exclude_patterns,
					max_depth,
					max_nodes,
					state
				);
				return asStructuredOrText(
					response_format,
					{
						directory_path: normalizedPath || '/',
						view,
						tree,
						meta: {
							max_depth,
							max_nodes,
							returned_nodes: state.nodes,
							truncated: state.truncated,
						},
					},
					(structured) => toCanonicalJsonText(structured)
				);
			}

			const pattern = resolveRegex(regex);
			const entries = folder.children
				.filter((child) => !pattern || pattern.test(child.name))
				.map((child) => ({
					name: child.name,
					type: child instanceof TFolder ? 'directory' : 'file',
					path: child.path,
					size: child instanceof TFile ? getFileStat(child).size : 0,
				}));

			const sortedEntries = [...entries].sort((a, b) => {
				if (sort_by === 'size') {
					return b.size - a.size;
				}
				return a.name.localeCompare(b.name);
			});
			const pagedEntries = sortedEntries.slice(offset, offset + limit);
			const basePayload = {
				directory_path: normalizedPath || '/',
				view,
				items: pagedEntries.map((entry) => ({
					name: entry.name,
					type: entry.type,
					path: entry.path,
					...(include_sizes
						? {
							size: entry.size,
							sizeText:
								entry.type === 'directory' ? null : formatSize(entry.size),
						}
						: {}),
				})),
				meta: {
					total_before_limit: sortedEntries.length,
					returned: pagedEntries.length,
					offset,
					limit,
					truncated: offset + pagedEntries.length < sortedEntries.length,
					regex: regex ?? null,
				},
			};

			if (!include_sizes) {
				return asStructuredOrText(
					response_format,
					basePayload,
					(structured) => {
						const textItems = structured.items as Array<{
							name: string;
							type: string;
						}>;
						const meta = structured.meta as { truncated: boolean };
						return [
							...textItems.map((item) =>
								`${item.type === 'directory' ? '[DIR]' : '[FILE]'} ${item.name}`
							),
							...(meta.truncated
								? ['[结果已截断，请增大 limit 或调整 offset]']
								: []),
						].join('\n');
					}
				);
			}

			const totalFiles = entries.filter((entry) => entry.type === 'file').length;
			const totalDirs = entries.filter((entry) => entry.type === 'directory').length;
			const totalSize = entries.reduce((sum, entry) => sum + (entry.type === 'file' ? entry.size : 0), 0);
			return asStructuredOrText(
				response_format,
				{
					...basePayload,
					summary: {
						total_files: totalFiles,
						total_directories: totalDirs,
						total_size: totalSize,
						total_size_text: formatSize(totalSize),
					},
				},
				(structured) => {
					const items = structured.items as Array<{
						name: string;
						type: string;
						sizeText: string | null;
					}>;
					const summary = structured.summary as {
						total_files: number;
						total_directories: number;
						total_size_text: string;
					};
					const meta = structured.meta as { truncated: boolean };
					return [
						...items.map((entry) =>
							`${entry.type === 'directory' ? '[DIR]' : '[FILE]'} ${entry.name.padEnd(30)} ${
								entry.type === 'directory' ? '' : String(entry.sizeText ?? '').padStart(10)
							}`.trimEnd()
						),
						'',
						`Total: ${summary.total_files} files, ${summary.total_directories} directories`,
						`Combined size: ${summary.total_size_text}`,
						...(meta.truncated
							? ['[结果已截断，请增大 limit 或调整 offset]']
							: []),
					].join('\n');
				}
			);
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'move_path',
		{
			title: '移动或重命名路径',
			description: MOVE_PATH_DESCRIPTION,
			inputSchema: moveFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ source_path, destination_path }) => {
			const normalizedSource = normalizeFilePath(source_path, 'source_path');
			const normalizedDestination = normalizeFilePath(destination_path, 'destination_path');
			const from = getAbstractFileOrThrow(app, normalizedSource);
			if (app.vault.getAbstractFileByPath(normalizedDestination)) {
				throw new Error(`目标路径已存在: ${normalizedDestination}`);
			}
			const destinationParent = normalizedDestination.includes('/')
				? normalizedDestination.slice(0, normalizedDestination.lastIndexOf('/'))
				: '';
			await ensureFolderExists(app, destinationParent);
			await app.vault.rename(from, normalizedDestination);
			return {
				source_path: normalizedSource,
				destination_path: normalizedDestination,
				moved: true,
			};
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'find_paths',
		{
			title: '按名称发现路径',
			description: FIND_PATHS_DESCRIPTION,
			inputSchema: findPathsSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async ({
			query,
			scope_path = '/',
			target_type = 'any',
			match_mode = 'contains',
			max_results = 100,
			response_format = 'json',
		}) => {
			const normalizedScopePath = normalizeDirectoryPath(scope_path, 'scope_path');
			const folder = getFolderOrThrow(app, normalizedScopePath);
			const matches = collectDescendants(folder)
				.filter((child) => {
					if (target_type === 'file' && !(child instanceof TFile)) {
						return false;
					}
					if (target_type === 'directory' && !(child instanceof TFolder)) {
						return false;
					}
					return true;
				})
				.map((child) => {
					const relativePath = toRelativeChildPath(normalizedScopePath, child.path);
					const meta = getPathSearchMatchMeta(
						query,
						match_mode,
						child.name,
						relativePath
					);
					if (!meta) return null;
					return {
						path: child.path,
						name: child.name,
						type: child instanceof TFolder ? 'directory' : 'file',
						matched_on: meta.matched_on,
						score: meta.score,
					};
				})
				.filter((entry): entry is PathSearchMatch & { score: number } => entry !== null)
				.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path));

			const limitedMatches = matches.slice(0, max_results).map(({ score, ...entry }) => entry);
			return asStructuredOrText(
				response_format,
				{
					query,
					scope_path: normalizedScopePath || '/',
					target_type,
					match_mode,
					matches: limitedMatches,
					meta: {
						total_before_limit: matches.length,
						returned: limitedMatches.length,
						max_results,
						truncated: limitedMatches.length < matches.length,
					},
				},
				(structured) => {
					const textMatches = structured.matches as PathSearchMatch[];
					const meta = structured.meta as { truncated: boolean; max_results: number };
					if (textMatches.length === 0) {
						return 'No path matches found';
					}
					return [
						...textMatches.map((entry) =>
							`${entry.type === 'directory' ? '[DIR]' : '[FILE]'} ${entry.path}`
						),
						...(meta.truncated
							? [formatLocal(localInstance.mcp_fs_search_files_truncated, meta.max_results)]
							: []),
					].join('\n');
				}
			);
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'delete_path',
		{
			title: '删除路径',
			description: DELETE_PATH_DESCRIPTION,
			inputSchema: deleteFileSchema,
			outputSchema: structuredOutputSchema,
			annotations: mutationToolAnnotations,
		},
		async ({ target_path, force = true }) => {
			const normalizedPath = normalizeVaultPath(target_path);
			if (!normalizedPath) {
				throw new Error(localInstance.mcp_fs_delete_root_forbidden);
			}
			assertVaultPath(normalizedPath, 'target_path');
			const target = app.vault.getAbstractFileByPath(normalizedPath);
			if (!target) {
				return {
					target_path: normalizedPath,
					existed: false,
					deleted: false,
				};
			}
			await app.vault.delete(target, force);
			return {
				target_path: normalizedPath,
				existed: true,
				deleted: true,
			};
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'search_content',
		{
			title: '搜索文件内容',
			description: SEARCH_CONTENT_DESCRIPTION,
			inputSchema: searchContentSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async ({
			pattern,
			match_mode = 'literal',
			scope_path = '/',
			file_types = [],
			max_results = DEFAULT_SEARCH_MAX_RESULTS,
			case_sensitive = false,
			context_lines = 0,
			response_format = 'json',
			}) => {
				const normalizedScopePath = normalizeDirectoryPath(scope_path, 'scope_path');
				if (normalizedScopePath) {
					getFolderOrThrow(app, normalizedScopePath);
				}
				const regex = createContentSearchRegex(pattern, match_mode, case_sensitive);
			const allowedExtensions = normalizeFileTypeFilters(file_types);
			const matches: ContentSearchMatch[] = [];
			const skippedFiles: Array<{ path: string; reason: string }> = [];
			let scannedFiles = 0;
			const buildResponse = (truncated: boolean) =>
				asStructuredOrText(
					response_format,
					{
						matches,
						meta: {
							scope_path: normalizedScopePath || '/',
							match_mode,
							file_types: allowedExtensions ?? [],
							max_results,
							case_sensitive,
							context_lines,
							scanned_files: scannedFiles,
							skipped_files: skippedFiles,
							returned: matches.length,
							has_more: truncated,
							truncated,
						},
					},
					(structured) => {
						const textMatches = structured.matches as ContentSearchMatch[];
						const meta = structured.meta as { truncated: boolean };
						if (textMatches.length === 0) {
							return 'No content matches found';
						}
						return [
							...textMatches.flatMap((match) => {
								const lines = [`${match.path}:${match.line}: ${match.text}`];
								for (const before of match.before) {
									lines.push(`  ${before.line}- ${before.text}`);
								}
								for (const after of match.after) {
									lines.push(`  ${after.line}+ ${after.text}`);
								}
								return lines;
							}),
							...(meta.truncated
								? ['[结果已截断，请缩小搜索范围或降低 max_results]']
								: []),
						].join('\n');
					}
				);

			for (const file of app.vault.getFiles()) {
				if (!isPathUnderDirectory(normalizedScopePath, file.path)) {
					continue;
				}
				const skipReason = shouldSkipContentSearchFile(file, allowedExtensions);
				if (skipReason) {
					if (skipReason !== 'filtered') {
						skippedFiles.push({
							path: file.path,
							reason: skipReason,
						});
					}
					continue;
				}

				const content = await app.vault.cachedRead(file);
				scannedFiles += 1;
				const lines = normalizeLineEndings(content).split('\n');
				for (let index = 0; index < lines.length; index += 1) {
					if (!regex.test(lines[index])) {
						continue;
					}
					matches.push({
						path: file.path,
						line: index + 1,
						text: lines[index],
						before: createContextEntries(
							lines,
							index - context_lines,
							index - 1
						),
						after: createContextEntries(
							lines,
							index + 1,
							index + context_lines
						),
					});
					if (matches.length >= max_results) {
						return buildResponse(true);
					}
				}
			}

			return buildResponse(false);
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'query_index',
		{
			title: '查询结构化索引',
			description: QUERY_INDEX_DESCRIPTION,
			inputSchema: queryIndexSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async (args: QueryIndexArgs) => {
			const parsedArgs = parseQueryIndexArgs(args);
			const expression = buildQueryIndexExpression(parsedArgs);
			const result = toQueryIndexResponse(await executeVaultQuery(app, expression));
			return asStructuredOrText(
				parsedArgs.response_format ?? 'json',
				result,
				(structured) => toCanonicalJsonText(structured)
			);
		}
	);

	registerBuiltinTool(
		server,
		registry,
		'stat_path',
		{
			title: '读取文件元信息',
			description: STAT_PATH_DESCRIPTION,
			inputSchema: getFileInfoSchema,
			outputSchema: structuredOutputSchema,
			annotations: readOnlyToolAnnotations,
		},
		async ({ target_path, response_format = 'json' }) => {
			const normalizedPath = normalizeDirectoryPath(target_path, 'target_path');
			const target = normalizedPath
				? getAbstractFileOrThrow(app, normalizedPath)
				: app.vault.getRoot();
			const adapterStat = normalizedPath
				? await app.vault.adapter.stat(normalizedPath)
				: null;
			const fileStat = target instanceof TFile ? getFileStat(target) : null;
			return asStructuredOrText(
				response_format,
				{
					target_path: normalizedPath || '/',
					type: target instanceof TFolder ? 'directory' : 'file',
					size: fileStat?.size ?? adapterStat?.size ?? 0,
					created: fileStat?.ctime ?? adapterStat?.ctime ?? null,
					modified: fileStat?.mtime ?? adapterStat?.mtime ?? null,
					accessed: null,
					permissions: 'N/A',
				},
				(structured) =>
					Object.entries(structured)
						.map(([key, value]) => `${key}: ${value}`)
						.join('\n')
			);
		}
	);

	registerNavTools(server, app, registry);
}

export function registerFilesystemTools(
	app: App,
	registry: BuiltinToolRegistry
): void {
	const noopServer = {
		registerTool: () => undefined,
	} as unknown as McpServer;
	registerFilesystemBuiltinTools(noopServer, app, registry);
}
