import { availableVendors } from 'src/domains/settings/config-ai-runtime-vendors'
import { localInstance } from 'src/i18n/locals'
import { DebugLogger } from 'src/utils/DebugLogger'
import type { SubAgentScanResult } from 'src/tools/sub-agents/types'
import type { SkillExecutionRequest } from 'src/domains/skills/execution'
import type { SkillReturnPacket } from 'src/domains/skills/session-state'
import type { ChatSession, ChatState } from '../types/chat'
import type { PreparedChatRequest } from './chat-service-types'
import type { ProviderSettings } from 'src/types/provider'
import type { ObsidianApiProvider } from 'src/providers/providers.types'

export interface ExecuteSkillCommandParams {
	obsidianApi: Pick<ObsidianApiProvider, 'notify'>
	executeSkillExecution: (request: SkillExecutionRequest) => Promise<SkillReturnPacket>
	saveSkillExecutionResult: (packet: SkillReturnPacket) => Promise<void>
}

export interface ExecuteSubAgentCommandParams {
	state: ChatState
	notify: (message: string, timeout?: number) => void
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

const notifySkillExecutionFailure = (
	params: ExecuteSkillCommandParams,
	packet: SkillReturnPacket,
): void => {
	if (packet.content.includes('未找到名为')) {
		params.obsidianApi.notify(
			localInstance.chat_skill_not_found_prefix.replace('{name}', packet.skillName),
		)
		return
	}
	if (packet.content === `Skill "${packet.skillName}" 没有可用的内容。`) {
		params.obsidianApi.notify(
			localInstance.chat_skill_content_empty_prefix.replace('{name}', packet.skillName),
		)
		return
	}
	params.obsidianApi.notify(
		localInstance.chat_skill_execute_failed_prefix.replace('{reason}', packet.content),
	)
}

export const executeSkillCommand = async (
	params: ExecuteSkillCommandParams,
	skillName: string
): Promise<void> => {
	try {
		const packet = await params.executeSkillExecution({
			skillName,
			trigger: 'slash_command',
		})
		if (packet.status === 'failed') {
			notifySkillExecutionFailure(params, packet)
			return
		}
		if (packet.metadata?.executionMode === 'inline') {
			return
		}
		await params.saveSkillExecutionResult(packet)
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		params.obsidianApi.notify(
			localInstance.chat_skill_execute_failed_prefix.replace('{reason}', reason)
		)
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
		params.notify(localInstance.chat_sub_agent_not_found.replace('{name}', agentName))
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
		params.notify(localInstance.no_ai_model_configured)
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
		params.notify(localInstance.no_ai_model_configured)
		return
	}

	await params.generateAssistantResponseForModel(prepared.session, resolvedModelTag, {
		systemPromptOverride: agent.systemPrompt,
		createMessageInSession: true,
		manageGeneratingState: true
	})
}
