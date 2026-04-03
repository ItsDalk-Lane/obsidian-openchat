import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { localInstance } from 'src/i18n/locals'
import type { SkillDefinition } from 'src/domains/skills/types'

const require = createRequire(import.meta.url)
require.extensions['.css'] = () => undefined

let ToggleSwitch: typeof import('src/components/toggle-switch/ToggleSwitch').ToggleSwitch
let SkillsSettingsTab: typeof import('./chatSettingsIntegrationTabs').SkillsSettingsTab

function collectElements(
	node: ReactNode,
	matcher: (element: ReactElement) => boolean,
	results: ReactElement[] = [],
): ReactElement[] {
	if (Array.isArray(node)) {
		for (const child of node) {
			collectElements(child, matcher, results)
		}
		return results
	}
	if (!isValidElement(node)) {
		return results
	}
	if (matcher(node)) {
		results.push(node)
	}
	collectElements((node.props as { children?: ReactNode }).children, matcher, results)
	return results
}

test('SkillsSettingsTab 保持列表布局并暴露编辑、删除、启停动作', async () => {
	if (!ToggleSwitch || !SkillsSettingsTab) {
		const toggleModule = await import('src/components/toggle-switch/ToggleSwitch')
		const tabsModule = await import('./chatSettingsIntegrationTabs')
		ToggleSwitch = toggleModule.ToggleSwitch
		SkillsSettingsTab = tabsModule.SkillsSettingsTab
	}

	const edited: string[] = []
	const created: string[] = []
	const deleted: string[] = []
	const toggled: Array<{ name: string; enabled: boolean }> = []
	const skills: SkillDefinition[] = [
		{
			metadata: { name: 'alpha', description: 'first skill', enabled: true },
			skillFilePath: 'System/AI Data/skills/alpha/SKILL.md',
			basePath: 'System/AI Data/skills/alpha',
		},
	]

	const tree = SkillsSettingsTab({
		skillScanResult: { skills, errors: [] },
		refreshInstalledSkills: async () => {},
		handleCreateInstalledSkill: () => {
			created.push('new')
		},
		handleEditInstalledSkill: async (skill) => {
			edited.push(skill.metadata.name)
		},
		handleToggleInstalledSkill: async (skill, enabled) => {
			toggled.push({ name: skill.metadata.name, enabled })
		},
		handleDeleteInstalledSkill: async (skill) => {
			deleted.push(skill.metadata.name)
		},
	})

	const buttons = collectElements(
		tree,
		(element) => typeof element.type === 'string' && element.type === 'button',
	)
	const toggles = collectElements(tree, (element) => element.type === ToggleSwitch)

	assert.equal(toggles.length, 1)
	assert.equal(buttons.length, 3)
	assert.equal(
		buttons.some((button) => button.props.children?.[1]?.props?.children === localInstance.chat_settings_skill_create),
		true,
	)
	assert.equal(
		buttons.some((button) => button.props.title === localInstance.chat_settings_skill_edit),
		true,
	)
	assert.equal(
		buttons.some((button) => button.props.title === localInstance.chat_settings_skill_delete),
		true,
	)

	buttons.find((button) => button.props.children?.[1]?.props?.children === localInstance.chat_settings_skill_create)
		?.props.onClick()
	await toggles[0]?.props.onChange(false)
	await buttons.find((button) => button.props.title === localInstance.chat_settings_skill_edit)
		?.props.onClick()
	await buttons.find((button) => button.props.title === localInstance.chat_settings_skill_delete)
		?.props.onClick()

	assert.deepEqual(created, ['new'])
	assert.deepEqual(toggled, [{ name: 'alpha', enabled: false }])
	assert.deepEqual(edited, ['alpha'])
	assert.deepEqual(deleted, ['alpha'])
})
