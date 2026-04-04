import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { ChatService } from 'src/core/chat/services/chat-service'
import type { SkillScannerService } from 'src/domains/skills/service'
import type {
	CreateSkillInput,
	SkillDefinition,
	SkillScanError,
	SkillScanResult,
	UpdateSkillInput,
} from 'src/domains/skills/types'
import { localInstance } from 'src/i18n/locals'
import {
	SkillEditorModal,
	type SkillEditorDetail,
	type SkillEditorSubmitValue,
} from './SkillEditorModal'
import { CreateSkillForm } from './CreateSkillForm'

interface SkillSettingsObsidianApi {
	notify(message: string, timeout?: number): void
	openInternalLink(path: string, sourcePath?: string): void
	getActiveFilePath(): string | null
}

interface UseSkillSettingsControllerParams {
	service: ChatService
	obsidianApi: SkillSettingsObsidianApi
	skillScanResult: SkillScanResult
	setSkillScanResult: Dispatch<SetStateAction<SkillScanResult>>
	getInstalledSkillScanner: () => SkillScannerService | undefined
}

interface UseSkillSettingsControllerResult {
	handleCreateInstalledSkill: () => void
	handleEditInstalledSkill: (skill: SkillDefinition) => Promise<void>
	handleToggleInstalledSkill: (skill: SkillDefinition, enabled: boolean) => Promise<void>
	handleDeleteInstalledSkill: (skill: SkillDefinition) => Promise<void>
	refreshInstalledSkills: () => Promise<void>
	createSkillFormModal: JSX.Element | null
	skillEditorModal: JSX.Element | null
}

const normalizeLineEndings = (value: string): string => value.replace(/\r\n/gu, '\n')

const normalizeSkillErrorPath = (path: string): string => path.replace(/\\/gu, '/')

const findSkillErrorMessage = (
	skill: SkillDefinition,
	errors: readonly SkillScanError[],
): string | null => {
	const normalizedSkillPath = normalizeSkillErrorPath(skill.skillFilePath)
	const normalizedBasePath = normalizeSkillErrorPath(skill.basePath)
	const matched = errors.find((error) => {
		const normalizedErrorPath = normalizeSkillErrorPath(error.path)
		return normalizedErrorPath === normalizedSkillPath
			|| normalizedErrorPath === normalizedBasePath
			|| normalizedErrorPath.startsWith(`${normalizedBasePath}/`)
	})
	return matched?.reason ?? null
}

const buildSkillEditorDetail = (
	skill: SkillDefinition,
	bodyContent: string,
	errors: readonly SkillScanError[],
): SkillEditorDetail => ({
	skill,
	sourceLabel: localInstance.chat_settings_skill_source_local,
	bodyContent: normalizeLineEndings(bodyContent),
	errorMessage: findSkillErrorMessage(skill, errors),
})

const isSameValue = (left: unknown, right: unknown): boolean => {
	return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

const buildSkillUpdateInput = (
	detail: SkillEditorDetail,
	value: SkillEditorSubmitValue,
): UpdateSkillInput | null => {
	const normalizedBodyContent = normalizeLineEndings(value.bodyContent)
	const previousWhenToUse = detail.skill.metadata.when_to_use ?? null
	const previousExecutionMode = detail.skill.metadata.execution?.mode ?? 'isolated_resume'
	const descriptionChanged = value.description !== detail.skill.metadata.description
	const whenToUseChanged = value.whenToUse !== previousWhenToUse
	const argumentsChanged = !isSameValue(value.arguments, detail.skill.metadata.arguments)
	const executionChanged = value.executionMode !== previousExecutionMode
	const bodyChanged = normalizedBodyContent !== normalizeLineEndings(detail.bodyContent)

	if (
		!descriptionChanged
		&& !whenToUseChanged
		&& !argumentsChanged
		&& !executionChanged
		&& !bodyChanged
	) {
		return null
	}

	return {
		skillId: detail.skill.skillFilePath,
		...(descriptionChanged ? { description: value.description } : {}),
		...(whenToUseChanged ? { when_to_use: value.whenToUse } : {}),
		...(argumentsChanged ? { arguments: value.arguments } : {}),
		...(executionChanged ? { execution: { mode: value.executionMode } } : {}),
		...(bodyChanged ? { bodyContent: normalizedBodyContent } : {}),
	}
}

const openSkillFile = (
	obsidianApi: SkillSettingsObsidianApi,
	skill: SkillDefinition,
): void => {
	obsidianApi.openInternalLink(
		skill.skillFilePath,
		obsidianApi.getActiveFilePath() ?? undefined,
	)
}

export const useSkillSettingsController = ({
	service,
	obsidianApi,
	skillScanResult,
	setSkillScanResult,
	getInstalledSkillScanner,
}: UseSkillSettingsControllerParams): UseSkillSettingsControllerResult => {
	const [isCreateOpen, setIsCreateOpen] = useState(false)
	const [editingDetail, setEditingDetail] = useState<SkillEditorDetail | null>(null)

	const refreshInstalledSkills = useCallback(async () => {
		setSkillScanResult(await service.refreshInstalledSkills())
	}, [service, setSkillScanResult])

	const handleCreateInstalledSkill = useCallback(() => {
		setIsCreateOpen(true)
	}, [])

	const handleEditInstalledSkill = useCallback(async (skill: SkillDefinition) => {
		const scanner = getInstalledSkillScanner()
		if (!scanner) {
			obsidianApi.notify(localInstance.chat_settings_skill_runtime_unavailable)
			return
		}
		try {
			const loaded = await scanner.loadSkillContent(skill.skillFilePath)
			setEditingDetail(buildSkillEditorDetail(
				loaded.definition,
				loaded.bodyContent,
				skillScanResult.errors,
			))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			obsidianApi.notify(`${localInstance.chat_settings_skill_load_failed}: ${message}`)
		}
	}, [getInstalledSkillScanner, obsidianApi, skillScanResult.errors])

	const handleToggleInstalledSkill = useCallback(
		async (skill: SkillDefinition, enabled: boolean) => {
			const scanner = getInstalledSkillScanner()
			if (!scanner) {
				obsidianApi.notify(localInstance.chat_settings_skill_runtime_unavailable)
				return
			}
			try {
				await scanner.setSkillEnabled(skill.skillFilePath, enabled)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				obsidianApi.notify(`${localInstance.chat_settings_skill_toggle_failed}: ${message}`)
			}
		},
		[getInstalledSkillScanner, obsidianApi],
	)

	const handleDeleteInstalledSkill = useCallback(
		async (skill: SkillDefinition) => {
			const scanner = getInstalledSkillScanner()
			if (!scanner) {
				obsidianApi.notify(localInstance.chat_settings_skill_runtime_unavailable)
				return
			}
			const shouldDelete = typeof globalThis.confirm !== 'function'
				|| globalThis.confirm(
					localInstance.chat_settings_skill_delete_confirm
						.replace('{name}', skill.metadata.name),
				)
			if (!shouldDelete) {
				return
			}
			try {
				await scanner.removeSkill(skill.skillFilePath)
				if (editingDetail?.skill.skillFilePath === skill.skillFilePath) {
					setEditingDetail(null)
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				obsidianApi.notify(`${localInstance.chat_settings_skill_delete_failed}: ${message}`)
			}
		},
		[getInstalledSkillScanner, obsidianApi, editingDetail],
	)

	const handleOpenSkillFile = useCallback(() => {
		if (!editingDetail) {
			return
		}
		try {
			openSkillFile(obsidianApi, editingDetail.skill)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			obsidianApi.notify(`${localInstance.chat_settings_skill_open_failed}: ${message}`)
		}
	}, [editingDetail, obsidianApi])

	const handleSaveSkillEditor = useCallback(async (value: SkillEditorSubmitValue) => {
		const scanner = getInstalledSkillScanner()
		if (!scanner || !editingDetail) {
			throw new Error(localInstance.chat_settings_skill_runtime_unavailable)
		}

		let nextSkill = editingDetail.skill
		const updateInput = buildSkillUpdateInput(editingDetail, value)
		if (updateInput) {
			nextSkill = await scanner.updateSkill(updateInput)
		}

		const previousEnabled = editingDetail.skill.metadata.enabled ?? true
		if (value.enabled !== previousEnabled) {
			nextSkill = await scanner.setSkillEnabled(nextSkill.skillFilePath, value.enabled)
		}

		const loaded = await scanner.loadSkillContent(nextSkill.skillFilePath)
		setEditingDetail(buildSkillEditorDetail(
			loaded.definition,
			loaded.bodyContent,
			skillScanResult.errors,
		))
	}, [editingDetail, getInstalledSkillScanner, skillScanResult.errors])

	const handleTestRunSkill = useCallback(async () => {
		if (!editingDetail) {
			throw new Error(localInstance.chat_settings_skill_runtime_unavailable)
		}
		await service.executeSkillCommand(editingDetail.skill.metadata.name)
		setEditingDetail(null)
	}, [editingDetail, service])

	const handleSubmitCreateSkill = useCallback(async (value: CreateSkillInput) => {
		const scanner = getInstalledSkillScanner()
		if (!scanner) {
			throw new Error(localInstance.chat_settings_skill_runtime_unavailable)
		}
		await scanner.createSkill(value)
		setIsCreateOpen(false)
	}, [getInstalledSkillScanner])

	const createSkillFormModal = isCreateOpen ? (
		<CreateSkillForm
			open={isCreateOpen}
			onOpenChange={setIsCreateOpen}
			onSubmit={handleSubmitCreateSkill}
		/>
	) : null

	const skillEditorModal = editingDetail ? (
		<SkillEditorModal
			open={editingDetail !== null}
			detail={editingDetail}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					setEditingDetail(null)
				}
			}}
			onSave={handleSaveSkillEditor}
			onTestRun={handleTestRunSkill}
			onOpenFile={handleOpenSkillFile}
		/>
	) : null

	return {
		handleCreateInstalledSkill,
		handleEditInstalledSkill,
		handleToggleInstalledSkill,
		handleDeleteInstalledSkill,
		refreshInstalledSkills,
		createSkillFormModal,
		skillEditorModal,
	}
}
