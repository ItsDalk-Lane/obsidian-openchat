import type {
	ExecuteSkillCommandParams,
	ExecuteSubAgentCommandParams,
} from './chatCommands'

export interface ChatCommandFacade {
	executeSkillCommand(skillName: string): Promise<void>
	executeSubAgentCommand(agentName: string, task?: string): Promise<void>
}

export interface ChatCommandFacadeOperations {
	executeSkillCommand(
		params: ExecuteSkillCommandParams,
		skillName: string,
	): Promise<void>
	executeSubAgentCommand(
		params: ExecuteSubAgentCommandParams,
		agentName: string,
		task?: string,
	): Promise<void>
}

export interface ChatCommandFacadeDepsAccessors {
	getExecuteSkillCommandParams: () => ExecuteSkillCommandParams
	getExecuteSubAgentCommandParams: () => ExecuteSubAgentCommandParams
}

export const createChatCommandFacade = (
	depsAccessors: ChatCommandFacadeDepsAccessors,
	operations: ChatCommandFacadeOperations,
): ChatCommandFacade => ({
	executeSkillCommand: async (skillName) =>
		await operations.executeSkillCommand(
			depsAccessors.getExecuteSkillCommandParams(),
			skillName,
		),
	executeSubAgentCommand: async (agentName, task) =>
		await operations.executeSubAgentCommand(
			depsAccessors.getExecuteSubAgentCommandParams(),
			agentName,
			task,
		),
})