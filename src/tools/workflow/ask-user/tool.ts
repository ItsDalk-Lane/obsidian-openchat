import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { ASK_USER_DESCRIPTION } from './description';
import {
	describeAskUserActivity,
	executeAskUser,
	summarizeAskUser,
	validateAskUserInput,
} from './service';
import {
	askUserAnnotations,
	askUserResultSchema,
	askUserSchema,
	type AskUserArgs,
	type AskUserResult,
} from './schema';

export const ASK_USER_TOOL_NAME = 'ask_user';

export const createAskUserTool = (): BuiltinTool<AskUserArgs, AskUserResult> =>
	buildBuiltinTool<AskUserArgs, AskUserResult>({
		name: ASK_USER_TOOL_NAME,
		title: '向用户提问',
		description: ASK_USER_DESCRIPTION,
		inputSchema: askUserSchema,
		outputSchema: askUserResultSchema,
		annotations: askUserAnnotations,
		surface: {
			family: 'workflow.user-clarification',
			source: 'workflow',
			visibility: 'workflow-only',
			argumentComplexity: 'medium',
			riskLevel: 'read-only',
			oneLinePurpose: '向用户发起澄清问题并等待回答。',
			whenNotToUse: [
				'权限确认应由具体工具的确认流处理',
				'上下文已经足够明确时不要额外打断用户',
			],
			capabilityTags: ['ask user', 'clarify', 'workflow', '澄清', '提问'],
			requiredArgsSummary: ['question'],
		},
		isReadOnly: () => true,
		isConcurrencySafe: () => false,
		validateInput: (args) => validateAskUserInput(args),
		getToolUseSummary: summarizeAskUser,
		getActivityDescription: describeAskUserActivity,
		execute: async (args, context) => await executeAskUser(args, context),
	});
