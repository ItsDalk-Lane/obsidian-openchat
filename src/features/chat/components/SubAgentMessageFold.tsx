import { ChevronDown, ChevronRight, CheckCircle2, Loader2, XCircle, Ban } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ChatMessage } from '../types/chat';
import type { SubAgentExecutionStatus } from 'src/features/sub-agents';

interface SubAgentMessageFoldProps {
	name: string;
	status: SubAgentExecutionStatus;
	internalMessages: ChatMessage[];
	defaultFolded?: boolean;
	renderMessage: (message: ChatMessage, index: number) => JSX.Element;
}

const statusLabelMap: Record<SubAgentExecutionStatus, string> = {
	running: '执行中',
	completed: '已完成',
	failed: '失败',
	cancelled: '已取消',
};

const StatusIcon = ({ status }: { status: SubAgentExecutionStatus }) => {
	if (status === 'running') {
		return <Loader2 className="tw-size-4 tw-animate-spin tw-text-accent" />;
	}
	if (status === 'completed') {
		return <CheckCircle2 className="tw-size-4 tw-text-green-500" />;
	}
	if (status === 'cancelled') {
		return <Ban className="tw-size-4 tw-text-muted" />;
	}
	return <XCircle className="tw-size-4 tw-text-destructive" />;
};

export const SubAgentMessageFold = ({
	name,
	status,
	internalMessages,
	defaultFolded = false, // 默认展开
	renderMessage,
}: SubAgentMessageFoldProps) => {
	const [folded, setFolded] = useState(defaultFolded);

	// 过滤掉系统消息（提示词）
	// 同时过滤掉 role: 'tool' 的消息，因为工具调用详情已通过 assistant 消息中的
	// MCP 工具标记（{{FF_MCP_TOOL_START}}:toolName:content{{FF_MCP_TOOL_END}}:）被渲染
	// 但需要确保 assistant 消息中包含 MCP 工具标记时才过滤，防止边界情况丢失数据
	const filteredMessages = useMemo(() => {
		// 检查是否存在包含 MCP 工具标记的 assistant 消息
		const hasMcpToolMarkers = internalMessages.some(
			(msg) => msg.role === 'assistant' && msg.content?.includes('{{FF_MCP_TOOL_START}}')
		);

		return internalMessages.filter((msg) => {
			// 始终过滤掉系统消息
			if (msg.role === 'system') return false;
			// 仅当 assistant 消息中包含 MCP 工具标记时，才过滤掉 tool 消息
			// 这样可以避免重复显示，同时确保边界情况下工具结果不丢失
			if (msg.role === 'tool' && hasMcpToolMarkers) return false;
			return true;
		});
	}, [internalMessages]);

	const messageCount = useMemo(() => filteredMessages.length, [filteredMessages]);

	return (
		<div className="ff-reasoning-block">
			<div
				className="ff-reasoning-header"
				onClick={() => setFolded((current) => !current)}
			>
				<div className="tw-flex tw-items-center tw-gap-2">
					<StatusIcon status={status} />
					<span className="ff-reasoning-title">{name}</span>
					<span className="tw-text-xs tw-text-faint">{statusLabelMap[status]}</span>
					<span className="tw-text-xs tw-text-faint">{messageCount} 条消息</span>
				</div>
				<span className="ff-reasoning-toggle">
					{folded ? <ChevronRight className="tw-size-4" /> : <ChevronDown className="tw-size-4" />}
				</span>
			</div>
			{!folded && (
				<div className="ff-internal-messages-container">
					{filteredMessages.map((message, index) => (
						<div key={`${message.id}-${index}`} className="ff-internal-message-separator">
							{renderMessage(message, index)}
						</div>
					))}
				</div>
			)}
		</div>
	);
};
