import type { BuiltinTool } from '../runtime/types';
import { PlanState } from '../runtime/plan-state';
import {
	createWritePlanTool,
	WRITE_PLAN_TOOL_NAME,
} from './write-plan/tool';

export {
	WRITE_PLAN_TOOL_NAME,
};

export const createPlanTools = (planState: PlanState): BuiltinTool[] => [
	createWritePlanTool(planState),
];
