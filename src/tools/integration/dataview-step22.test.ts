import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Module from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))

const readIntegrationSource = async (relativePath: string): Promise<string> => {
	return await readFile(resolve(CURRENT_DIR, relativePath), 'utf8')
}

const installObsidianStub = (): void => {
	const globalScope = globalThis as typeof globalThis & {
		__obsidianDataviewStubInstalled?: boolean
	}
	if (globalScope.__obsidianDataviewStubInstalled) {
		return
	}

	const moduleLoader = Module as typeof Module & {
		_load: (request: string, parent: object | null, isMain: boolean) => unknown
	}
	const originalLoad = moduleLoader._load
	moduleLoader._load = (request, parent, isMain) => {
		if (request === 'obsidian') {
			class App {}
			class TAbstractFile {}
			class TFile extends TAbstractFile {}
			class TFolder extends TAbstractFile {}
			class FileSystemAdapter {
				constructor(private readonly basePath = process.cwd()) {}

				getBasePath(): string {
					return this.basePath
				}
			}
			const noop = () => undefined
			const NoopClass = class {}
			const normalizePath = (value: string) =>
				String(value ?? '').replace(/\\/gu, '/').replace(/\/+/gu, '/')
			const moment = () => ({
				isValid: () => true,
				format: () => '2026-04-02',
				clone() {
					return this
				},
				add() {
					return this
				},
				startOf() {
					return this
				},
				endOf() {
					return this
				},
				toISOString: () => '2026-04-02T00:00:00.000Z',
				valueOf: () => 0,
			})
			return new Proxy(
				{
					App,
					FileSystemAdapter,
					Modal: NoopClass,
					Notice: NoopClass,
					Platform: {
						isDesktopApp: true,
						isDesktop: true,
					},
					TAbstractFile,
					TFile,
					TFolder,
					moment,
					normalizePath,
					parseYaml: () => ({}),
					stringifyYaml: () => '',
				},
				{
					get(target, property) {
						if (property in target) {
							return target[property as keyof typeof target]
						}
						return typeof property === 'string' && /^[A-Z]/u.test(property)
							? NoopClass
							: noop
					},
				},
			)
		}
		return originalLoad(request, parent, isMain)
	}

	globalScope.__obsidianDataviewStubInstalled = true
}

const loadDataviewModules = async () => {
	installObsidianStub()
	return await Promise.all([
		import('./dataview-query/tool'),
		import('./dataview-query/service'),
		import('./dataview-query/schema'),
		import('./integration-tools'),
	])
}

interface FakeDataviewApi {
	query: (source: string, file?: string) => Promise<unknown>
	queryMarkdown: (source: string, file?: string) => Promise<unknown>
}

const createIntegrationApp = (options: {
	dataviewApi?: FakeDataviewApi
	files?: string[]
	pluginVersion?: string
}) => {
	const files = new Set(options.files ?? [])
	return {
		plugins: {
			getPlugin(pluginId: string) {
				if (pluginId !== 'dataview' || !options.dataviewApi) {
					return null
				}
				return { api: options.dataviewApi }
			},
			manifests: options.dataviewApi
				? {
					dataview: {
						version: options.pluginVersion ?? '0.5.67',
					},
				}
				: {},
		},
		vault: {
			getAbstractFileByPath(filePath: string) {
				return files.has(filePath) ? { path: filePath } : null
			},
		},
	} as never
}


test('Step 22 schema 保持 dataview_query 的只读查询边界', async () => {
	const [
		,
		,
		{ dataviewQueryResultSchema, dataviewQuerySchema },
	] = await loadDataviewModules()

	const parsed = dataviewQuerySchema.parse({
		query: 'TABLE file.name FROM #project',
	})

	assert.equal(parsed.query, 'TABLE file.name FROM #project')
	assert.equal(parsed.max_rows, 50)
	assert.equal(parsed.max_cell_length, 200)
	assert.equal(parsed.markdown_preview_length, 4_000)
	assert.deepEqual(Object.keys(dataviewQueryResultSchema.shape).sort(), [
		'headers',
		'markdown',
		'notes',
		'origin_file_path',
		'plugin_version',
		'query',
		'result_type',
		'row_count',
		'rows',
		'truncated',
	])
})

test('Step 22 缺失 Dataview 时不会暴露工具，并返回清晰不可用原因', async () => {
	const [
		,
		{ executeDataviewQuery, hasDataviewQueryCapability, validateDataviewQueryInput },
		{ dataviewQuerySchema },
		{ createIntegrationTools },
	] = await loadDataviewModules()

	const app = createIntegrationApp({})
	const args = dataviewQuerySchema.parse({
		query: 'LIST FROM #project',
	})

	assert.equal(hasDataviewQueryCapability(app), false)
	assert.deepEqual(createIntegrationTools(app), [])

	const validation = validateDataviewQueryInput(app, args)
	assert.equal(validation.ok, false)
	assert.match(validation.summary ?? '', /未安装或未启用 Dataview/)

	await assert.rejects(
		async () => await executeDataviewQuery(app, args),
		/未安装或未启用 Dataview/,
	)
})

test('Step 22 安装 Dataview 时可执行查询，并保留可选集成的只读暴露语义', async () => {
	const [
		{ createDataviewQueryTool },
		{ executeDataviewQuery, validateDataviewQueryInput },
		{ dataviewQuerySchema },
		{ createIntegrationTools },
	] = await loadDataviewModules()

	const dataviewApi: FakeDataviewApi = {
		async query(source: string, file?: string) {
			assert.equal(source, 'TABLE file.name, due FROM #project')
			assert.equal(file, 'notes/project.md')
			return {
				successful: true,
				value: {
					type: 'table',
					headers: ['name', 'due'],
					values: [
						['Project Alpha', { toISO: () => '2026-04-02T09:30:00.000Z' }],
						['Project Beta', { path: 'notes/beta.md', subpath: 'Tasks' }],
					],
				},
			}
		},
		async queryMarkdown(source: string, file?: string) {
			assert.equal(source, 'TABLE file.name, due FROM #project')
			assert.equal(file, 'notes/project.md')
			return {
				successful: true,
				value: '| name | due |\n| --- | --- |\n| Project Alpha | 2026-04-02 |',
			}
		},
	}
	const app = createIntegrationApp({
		dataviewApi,
		files: ['notes/project.md'],
		pluginVersion: '0.5.68',
	})
	const args = dataviewQuerySchema.parse({
		query: 'TABLE file.name, due FROM #project',
		origin_file_path: 'notes/project.md',
		max_rows: 1,
		max_cell_length: 24,
		markdown_preview_length: 28,
	})

	const validation = validateDataviewQueryInput(app, args)
	assert.deepEqual(validation, { ok: true })

	const result = await executeDataviewQuery(app, args)
	const tool = createDataviewQueryTool(app)

	assert.equal(tool.isReadOnly?.(args), true)
	assert.equal(tool.isConcurrencySafe?.(args), true)
	assert.equal(tool.surface?.family, 'builtin.integration.dataview')
	assert.equal(tool.surface?.visibility, 'candidate-only')
	assert.deepEqual(createIntegrationTools(app).map((entry) => entry.name), ['dataview_query'])

	assert.equal(result.plugin_version, '0.5.68')
	assert.equal(result.origin_file_path, 'notes/project.md')
	assert.equal(result.result_type, 'table')
	assert.equal(result.row_count, 2)
	assert.deepEqual(result.headers, ['name', 'due'])
	assert.deepEqual(result.rows, [['Project Alpha', '2026-04-02T09:30:00.000Z']])
	assert.equal(result.truncated, true)
	assert.match(result.markdown ?? '', /^\| name \| due \|/)
	assert.ok((result.markdown ?? '').length <= 28)
	assert.ok(result.notes.some((note) => note.includes('结构化结果已截断到前 1 行')))
	assert.ok(result.notes.some((note) => note.includes('Markdown 结果已截断到前 28 个字符')))
})

test('Step 22 runtime 已接入可选 integration 工具工厂', async () => {
	const toolSource = await readIntegrationSource('./dataview-query/tool.ts')
	const integrationToolsSource = await readIntegrationSource('./integration-tools.ts')
	const runtimeSource = await readIntegrationSource('../runtime/BuiltinToolsRuntime.ts')

	assert.match(toolSource, /DATAVIEW_QUERY_TOOL_NAME = 'dataview_query'/)
	assert.match(toolSource, /family: 'builtin\.integration\.dataview'/)
	assert.match(toolSource, /riskLevel: 'read-only'/)
	assert.match(integrationToolsSource, /hasDataviewQueryCapability\(app\)/)
	assert.match(integrationToolsSource, /return \[createDataviewQueryTool\(app\)\]/)
	assert.match(runtimeSource, /createIntegrationTools/)
	assert.match(runtimeSource, /registry\.registerAll\(createIntegrationTools\(options\.app\)\)/)
})