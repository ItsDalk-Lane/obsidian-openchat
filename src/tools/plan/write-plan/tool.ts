import type { BuiltinTool } from '../../runtime/types';
import { buildBuiltinTool } from '../../runtime/build-tool';
import { PlanState } from '../../runtime/plan-state';
import { WRITE_PLAN_DESCRIPTION } from './description';
import {
	describeWritePlanActivity,
	executeWritePlan,
	summarizeWritePlan,
	validateWritePlanInput,
} from './service';
import {
	writePlanAnnotations,
	writePlanResultSchema,
	writePlanSchema,
	type WritePlanArgs,
	type WritePlanResult,
} from './schema';

export const WRITE_PLAN_TOOL_NAME = 'write_plan';

export const createWritePlanTool = (
	planState: PlanState,
): BuiltinTool<WritePlanArgs, WritePlanResult> => buildBuiltinTool<
	WritePlanArgs,
	WritePlanResult
>({
	name: WRITE_PLAN_TOOL_NAME,
	title: '更新 Live Plan',
	description: WRITE_PLAN_DESCRIPTION,
	inputSchema: writePlanSchema,
	outputSchema: writePlanResultSchema,
	annotations: writePlanAnnotations,
	surface: {
		family: 'workflow.plan',
		source: 'workflow',
		visibility: 'workflow-only',
		argumentComplexity: 'medium',
		riskLevel: 'mutating',
		oneLinePurpose: '维护当前会话的任务计划状态。',
		whenNotToUse: [
			'直接执行文件操作时改用对应 Vault 工具',
			'运行脚本或命令时改用 run_script 或 run_shell',
		],
		capabilityTags: ['plan', 'todo', '任务计划', '步骤'],
		requiredArgsSummary: ['tasks'],
	},
	isReadOnly: () => false,
	validateInput: (args) => validateWritePlanInput(args),
	getToolUseSummary: summarizeWritePlan,
	getActivityDescription: describeWritePlanActivity,
	execute: (args) => executeWritePlan(args, planState),
});
