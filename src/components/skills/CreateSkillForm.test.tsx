import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { INLINE_ALLOWED_TOOLS_UNSUPPORTED_REASON } from 'src/domains/skills/config'

const require = createRequire(import.meta.url)
require.extensions['.css'] = () => undefined

type CreateSkillFormModule = typeof import('./CreateSkillForm')

let createSkillFormModule: CreateSkillFormModule | null = null

const loadCreateSkillFormModule = async (): Promise<CreateSkillFormModule> => {
	if (createSkillFormModule) {
		return createSkillFormModule
	}
	createSkillFormModule = await import('./CreateSkillForm')
	return createSkillFormModule
}

test.before(async () => {
	await loadCreateSkillFormModule()
})

test('parseCreateSkillSubmitValue 会构造 createSkill 所需载荷', () => {
	const { parseCreateSkillSubmitValue } = createSkillFormModule!
	const parsed = parseCreateSkillSubmitValue({
		name: 'alpha-skill',
		description: '  Alpha skill  ',
		enabled: true,
		whenToUseInput: '  use when needed  ',
		argumentsInput: JSON.stringify([{ name: 'path', required: true }]),
		executionMode: 'isolated_resume',
		allowedToolsInput: 'read_file\nrun_command',
		bodyContent: 'step1\r\nstep2',
	})

	assert.deepEqual(parsed, {
		name: 'alpha-skill',
		description: 'Alpha skill',
		bodyContent: 'step1\nstep2',
		enabled: true,
		when_to_use: 'use when needed',
		arguments: [{ name: 'path', required: true }],
		execution: { mode: 'isolated_resume' },
		allowed_tools: ['read_file', 'run_command'],
	})
})

test('parseCreateSkillSubmitValue 在名称不合法时抛错', () => {
	const { parseCreateSkillSubmitValue } = createSkillFormModule!
	assert.throws(
		() => parseCreateSkillSubmitValue({
			name: 'Alpha Skill',
			description: 'Alpha skill',
			enabled: true,
			whenToUseInput: '',
			argumentsInput: '',
			executionMode: 'isolated_resume',
			allowedToolsInput: '',
			bodyContent: 'body',
		}),
		/(名称|Skill name)/,
	)
})

test('parseCreateSkillSubmitValue 会拒绝 inline 与 allowed_tools 的组合', () => {
	const { parseCreateSkillSubmitValue } = createSkillFormModule!
	assert.throws(
		() => parseCreateSkillSubmitValue({
			name: 'alpha-skill',
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
