import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { INLINE_ALLOWED_TOOLS_UNSUPPORTED_REASON } from 'src/domains/skills/config'

const require = createRequire(import.meta.url)
require.extensions['.css'] = () => undefined

type SkillEditorModalModule = typeof import('./SkillEditorModal')

let skillEditorModalModule: SkillEditorModalModule | null = null

const loadSkillEditorModalModule = async (): Promise<SkillEditorModalModule> => {
	if (skillEditorModalModule) {
		return skillEditorModalModule
	}
	skillEditorModalModule = await import('./SkillEditorModal')
	return skillEditorModalModule
}

type SkillEditorDetail = import('./SkillEditorModal').SkillEditorDetail

const createDetail = (): SkillEditorDetail => ({
	skill: {
		metadata: {
			name: 'alpha',
			description: 'Alpha skill',
			enabled: true,
			when_to_use: 'Need alpha help',
			arguments: [
				{ name: 'path', description: 'target path', required: true },
			],
			execution: { mode: 'isolated_resume' },
			allowed_tools: ['read_file', 'run_command'],
		},
		skillFilePath: 'System/AI Data/skills/alpha/SKILL.md',
		basePath: 'System/AI Data/skills/alpha',
	},
	sourceLabel: 'Local Vault',
	bodyContent: '# Alpha\nBody',
	errorMessage: null,
})

test('buildSkillEditorDraft 会把 skill 详情格式化为表单草稿', () => {
	const { buildSkillEditorDraft } = skillEditorModalModule!
	const draft = buildSkillEditorDraft(createDetail())

	assert.equal(draft.description, 'Alpha skill')
	assert.equal(draft.enabled, true)
	assert.equal(draft.whenToUseInput, 'Need alpha help')
	assert.match(draft.argumentsInput, /"name": "path"/)
	assert.equal(draft.executionMode, 'isolated_resume')
	assert.equal(draft.allowedToolsInput, 'read_file\nrun_command')
	assert.equal(draft.bodyContent, '# Alpha\nBody')
})

test('parseSkillEditorSubmitValue 会把表单草稿解析为保存载荷', () => {
	const { parseSkillEditorSubmitValue } = skillEditorModalModule!
	const parsed = parseSkillEditorSubmitValue({
		description: '  Alpha skill updated  ',
		enabled: false,
		whenToUseInput: '  Run when alpha is needed  ',
		argumentsInput: JSON.stringify([
			{ name: 'path', required: true, default: null },
		]),
		executionMode: 'isolated',
		allowedToolsInput: 'read_file\nrun_command, read_file',
		bodyContent: 'line1\r\nline2',
	})

	assert.deepEqual(parsed, {
		description: 'Alpha skill updated',
		enabled: false,
		whenToUse: 'Run when alpha is needed',
		arguments: [{ name: 'path', required: true, default: null }],
		executionMode: 'isolated',
		allowedTools: ['read_file', 'run_command'],
		bodyContent: 'line1\nline2',
	})
})

test('parseSkillEditorSubmitValue 在参数定义不是数组时抛错', () => {
	const { parseSkillEditorSubmitValue } = skillEditorModalModule!
	assert.throws(
		() => parseSkillEditorSubmitValue({
			description: 'Alpha skill',
			enabled: true,
			whenToUseInput: '',
			argumentsInput: '{"name":"path"}',
			executionMode: 'inline',
			allowedToolsInput: '',
			bodyContent: 'body',
		}),
		/参数定义必须是 JSON 数组/,
	)
})

test('parseSkillEditorSubmitValue 会拒绝 inline 与 allowed_tools 的组合', () => {
	const { parseSkillEditorSubmitValue } = skillEditorModalModule!
	assert.throws(
		() => parseSkillEditorSubmitValue({
			description: 'Alpha skill',
			enabled: true,
			whenToUseInput: '',
			argumentsInput: '',
			executionMode: 'inline',
			allowedToolsInput: 'read_file',
			bodyContent: 'body',
		}),
		new RegExp(INLINE_ALLOWED_TOOLS_UNSUPPORTED_REASON.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')),
	)
})

test.before(async () => {
	await loadSkillEditorModalModule()
})
