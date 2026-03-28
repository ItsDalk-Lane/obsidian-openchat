import { Notice, TFile } from 'obsidian'
import { availableVendors } from 'src/settings/ai-runtime'
import { localInstance } from 'src/i18n/locals'
import { DebugLogger } from 'src/utils/DebugLogger'
import type { SubAgentScanResult } from 'src/tools/sub-agents'
import type { SkillScanResult } from 'src/domains/skills/types'
import type { ChatSession, ChatState } from '../types/chat'
import type { PreparedChatRequest } from './ChatServiceCore'
import type { ProviderSettings } from 'src/types/provider'

export interface ExecuteSkillCommandParams {
	app: App
	state: ChatState
	emitState: () => void
	loadInstalledSkills: () => Promise<SkillScanResult>
	sendMessage: (content?: string) => Promise<void>
}

export interface ExecuteSubAgentCommandParams {
	state: ChatState
	providers: ProviderSettings[]
	loadInstalledSubAgents: () => Promise<SubAgentScanResult>
	prepareChatRequest: (
		content: string,
		options?: { skipImageSupportValidation?: boolean }
	) => Promise<PreparedChatRequest | null>
	ensurePlanSyncReady: () => Promise<void>
	resolveProvider: () => ProviderSettings | null
	getDefaultProviderTag: () => string | null
	generateAssistantResponseForModel: (
		session: ChatSession,
		modelTag: string,
		options?: {
			systemPromptOverride?: string
			createMessageInSession?: boolean
			manageGeneratingState?: boolean
		}
	) => Promise<unknown>
	emitState: () => void
}

type App = import('obsidian').App

export const executeSkillCommand = async (
	params: ExecuteSkillCommandParams,
	skillName: string
): Promise<void> => {
	const skillsResult = await params.loadInstalledSkills()
	const skill = skillsResult.skills.find((item) => item.metadata.name === skillName)

	if (!skill) {
		new Notice(localInstance.chat_skill_not_found_prefix.replace('{name}', skillName))
		return
	}

	try {
		const file = params.app.vault.getAbstractFileByPath(skill.skillFilePath)
		if (!file) {
			new Notice(localInstance.chat_skill_file_missing_prefix.replace('{path}', skill.skillFilePath))
			return
		}
		if (!(file instanceof TFile)) {
			new Notice(localInstance.chat_skill_path_invalid_prefix.replace('{path}', skill.skillFilePath))
			return
		}

		const fullContent = await params.app.vault.read(file)
		const bodyContent = fullContent
			.replace(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n)?/, '')
			.trim()
		if (!bodyContent) {
			new Notice(localInstance.chat_skill_content_empty_prefix.replace('{name}', skillName))
			return
		}

		params.state.selectedPromptTemplate = {
			name: skill.metadata.name,
			path: skill.skillFilePath,
			content: bodyContent
		}
		params.state.enableTemplateAsSystemPrompt = true
		params.state.inputValue = ''
		params.emitState()
		await params.sendMessage('')
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		new Notice(localInstance.chat_skill_execute_failed_prefix.replace('{reason}', reason))
		DebugLogger.error('[ChatService] 执行 Skill 失败', error)
	}
}

export const executeSubAgentCommand = async (
	params: ExecuteSubAgentCommandParams,
	agentName: string,
	task?: string
): Promise<void> => {
	const agentsResult = await params.loadInstalledSubAgents()
	const agent = agentsResult.agents.find((item) => item.metadata.name === agentName)

	if (!agent) {
		new Notice(localInstance.chat_sub_agent_not_found.replace('{name}', agentName))
		return
	}

	params.state.inputValue = ''
	params.emitState()

	const userTask = task || localInstance.chat_sub_agent_default_task.replace('{name}', agentName)
	const prepared = await params.prepareChatRequest(userTask, {
		skipImageSupportValidation: params.state.multiModelMode !== 'single'
	})
	if (!prepared) {
		return
	}

	await params.ensurePlanSyncReady()

	if (!params.resolveProvider()) {
		new Notice(localInstance.no_ai_model_configured)
		return
	}

	if (agent.metadata.models?.trim()) {
		const modelTag = agent.metadata.models.trim()
		const targetVendor = availableVendors.find((vendor) => {
			return vendor.models.some((model) => model === modelTag || model.includes(modelTag))
		})
		if (targetVendor) {
			const matchingProvider = params.providers.find((candidate) => {
				return candidate.tag === modelTag || candidate.options.model === modelTag
			})
			params.state.selectedModelId = matchingProvider?.tag ?? modelTag
		}
	}

	const resolvedModelTag = params.state.selectedModelId ?? params.getDefaultProviderTag()
	if (!resolvedModelTag) {
		new Notice(localInstance.no_ai_model_configured)
		return
	}

	await params.generateAssistantResponseForModel(prepared.session, resolvedModelTag, {
		systemPromptOverride: agent.systemPrompt,
		createMessageInSession: true,
		manageGeneratingState: true
	})
}
