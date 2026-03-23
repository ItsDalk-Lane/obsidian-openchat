import { useMemo, useState, useRef, useEffect } from 'react';
import type { ChatMessage, ChatSession } from '../types/chat';
import type { ProviderSettings } from 'src/features/tars/providers';
import { resolveContextBudget } from '../utils/contextBudget';
import { countMessageTokens, countTextTokens } from '../utils/token';

interface ContextUsageIndicatorProps {
	providers: ProviderSettings[];
	selectedModelId: string | null;
	session: ChatSession | null;
	isGenerating?: boolean;
	size?: 'sm' | 'md';
}

function getProviderFromProviders(
	providers: ProviderSettings[],
	selectedModelId: string | null
): ProviderSettings | null {
	if (!selectedModelId) return providers[0] ?? null;

	// 查找匹配的 Provider
	const provider = providers.find((p) => p.tag === selectedModelId);
	return provider ?? providers[0] ?? null;
}

/**
 * 计算消息列表的总 token 数量
 */
function calculateTotalTokens(messages: ChatMessage[]): number {
	if (messages.length === 0) return 0;
	return messages
		.filter((message) => message.role !== 'system')
		.reduce((sum, message) => sum + countMessageTokens(message), 0);
}

/**
 * 扇形进度图组件
 */
interface SectorProgressProps {
	percentage: number;
	size?: number;
	strokeWidth?: number;
	color?: string;
}

const SectorProgress = ({
	percentage,
	size = 18,
	strokeWidth = 3,
	color = 'var(--interactive-accent, #7c3aed)',
}: SectorProgressProps) => {
	const normalizedPercentage = Math.min(100, Math.max(0, percentage));
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const dashOffset = circumference - (normalizedPercentage / 100) * circumference;

	return (
		<svg width={size} height={size} className="tw-block">
			{/* 背景圆 */}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke="var(--background-modifier-border, #e5e7eb)"
				strokeWidth={strokeWidth}
			/>
			{/* 进度圆 */}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeDasharray={circumference}
				strokeDashoffset={dashOffset}
				style={{
					transform: 'rotate(-90deg)',
					transformOrigin: 'center',
					transition: 'stroke-dashoffset 0.3s ease',
				}}
			/>
		</svg>
	);
};

/**
 * 格式化数字
 */
function formatNumber(num: number): string {
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
	return String(num);
}

/**
 * 上下文使用情况指示器组件
 */
export const ContextUsageIndicator = ({
	providers,
	selectedModelId,
	session,
	isGenerating = false,
	size = 'sm',
}: ContextUsageIndicatorProps) => {
	const [showTooltip, setShowTooltip] = useState(false);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLSpanElement>(null);

	// 计算当前上下文使用情况
	const usage = useMemo(() => {
		const budget = resolveContextBudget(
			getProviderFromProviders(providers, selectedModelId)
		);

		if (!session || session.messages.length === 0) {
			return {
				totalTokens: 0,
				contextLength: budget.contextLength,
				usableInputTokens: budget.usableInputTokens,
				triggerTokens: budget.triggerTokens,
				targetTokens: budget.targetTokens,
				reserveForOutput: budget.reserveForOutput,
				percentage: 0,
				remaining: budget.usableInputTokens,
			};
		}

		// 计算已消耗的 tokens：包含所有历史消息（用户+助手）+ 系统提示 + 工具定义
		// requestTokenState.totalTokenEstimate 只记录请求时的估算，不包含模型响应
		// 所以我们需要用 calculateTotalTokens 获取完整的消息历史消耗，再加上工具定义 tokens
		const messageTokens = calculateTotalTokens(session.messages);
		// 系统提示 tokens（如果有）
		const systemPromptTokens = session.systemPrompt
			? countTextTokens(session.systemPrompt)
			: 0;
		// 工具定义 tokens（从 requestTokenState 获取，如果没有则为 0）
		const toolTokens = session.requestTokenState?.toolTokenEstimate ?? 0;

		const totalTokens = messageTokens + systemPromptTokens + toolTokens;

		// 百分比基于总上下文长度计算（包含预留输出空间）
		const percentage = Math.round((totalTokens / budget.contextLength) * 100);
		const remaining = Math.max(0, budget.contextLength - totalTokens - budget.reserveForOutput);

		return {
			totalTokens,
			contextLength: budget.contextLength,
			usableInputTokens: budget.usableInputTokens,
			triggerTokens: budget.triggerTokens,
			targetTokens: budget.targetTokens,
			reserveForOutput: budget.reserveForOutput,
			percentage,
			remaining,
		};
	}, [session, providers, selectedModelId, isGenerating]);

	// 根据使用率选择颜色
	const getColor = () => {
		if (usage.percentage >= 100) return 'var(--text-error, #dc2626)';
		if (usage.percentage >= 75) return 'var(--text-warning, #f59e0b)';
		return 'var(--interactive-accent, #7c3aed)';
	};

	// 点击外部关闭 tooltip
	useEffect(() => {
		if (!showTooltip) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (tooltipRef.current?.contains(target)) return;
			if (triggerRef.current?.contains(target)) return;
			setShowTooltip(false);
		};

		setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
		}, 0);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [showTooltip]);

	// 小尺寸组件
	if (size === 'sm') {
		return (
			<div className="context-usage-indicator tw-relative tw-inline-flex tw-items-center">
				<span
					ref={triggerRef}
					className="tw-cursor-pointer tw-inline-flex tw-items-center tw-justify-center"
					onMouseEnter={() => setShowTooltip(true)}
					onMouseLeave={() => setShowTooltip(false)}
					onClick={() => setShowTooltip(!showTooltip)}
					title="上下文使用情况"
				>
					<SectorProgress percentage={usage.percentage} color={getColor()} size={16} strokeWidth={2.5} />
				</span>

				{/* 详细信息 Tooltip */}
				{showTooltip && (
					<div
						ref={tooltipRef}
						className="context-usage-tooltip tw-absolute tw-z-50 tw-border tw-shadow-lg"
						style={{
							bottom: '100%',
							left: '50%',
							transform: 'translateX(-50%)',
							marginBottom: '4px',
							backgroundColor: 'rgba(255, 255, 255, 0.95)',
							borderColor: '#e5e7eb',
							borderRadius: '8px',
							padding: '8px 16px',
							whiteSpace: 'nowrap',
						}}
					>
						{/* 百分比信息 */}
						<div style={{ fontSize: '12px', color: '#4b5563', marginBottom: '4px' }}>
							{usage.percentage}% 已用（剩余 {100 - usage.percentage}%）
						</div>

						{/* Token 信息 */}
						<div style={{ fontSize: '12px', color: '#4b5563' }}>
							已用 {formatNumber(usage.totalTokens)} 标记，共 {formatNumber(usage.contextLength)}
						</div>
					</div>
				)}
			</div>
		);
	}

	// 原始大尺寸组件（保持兼容）
	return (
		<div className="context-usage-indicator tw-flex tw-items-center tw-justify-center tw-py-1 tw-relative">
			<span
				ref={triggerRef}
				className="tw-cursor-pointer tw-inline-flex tw-items-center tw-justify-center"
				onMouseEnter={() => setShowTooltip(true)}
				onMouseLeave={() => setShowTooltip(false)}
				onClick={() => setShowTooltip(!showTooltip)}
				title="上下文使用情况"
			>
				<SectorProgress percentage={usage.percentage} color={getColor()} />
			</span>

			{/* 详细信息 Tooltip */}
			{showTooltip && (
				<div
					ref={tooltipRef}
					className="context-usage-tooltip tw-absolute tw-z-50 tw-bg-white tw-opacity-95 tw-border tw-border-gray-200 tw-rounded-lg tw-shadow-lg tw-px-4 tw-py-2"
					style={{
						bottom: '100%',
						left: '50%',
						transform: 'translateX(-50%)',
						marginBottom: '4px',
						whiteSpace: 'nowrap',
					}}
				>
					{/* 百分比信息 */}
					<div className="tw-text-xs tw-text-gray-600">
						{usage.percentage}% 已用（剩余 {100 - usage.percentage}%）
					</div>

					{/* Token 信息 */}
					<div className="tw-text-xs tw-text-gray-600">
						已用 {formatNumber(usage.totalTokens)} 标记，共 {formatNumber(usage.contextLength)}
					</div>
				</div>
			)}
		</div>
	);
};
