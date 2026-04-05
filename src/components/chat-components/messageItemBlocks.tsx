import { ChevronDown, ChevronRight } from 'lucide-react';
import { Component } from 'obsidian';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { ObsidianApiProvider } from 'src/providers/providers.types';
import { renderMarkdownContent } from 'src/domains/chat/ui-markdown';

/** 格式化推理耗时（毫秒 → 秒字符串） */
const formatDuration = (durationMs: number): string => {
	const centiSeconds = Math.max(1, Math.round(durationMs / 10))
	return `${(centiSeconds / 100).toFixed(2)}s`
}

// 推理块组件
interface ReasoningBlockProps {
	content: string;
	startMs: number;
	durationMs?: number;
	isGenerating: boolean;
}

export const ReasoningBlockComponent = ({ content, startMs, durationMs, isGenerating }: ReasoningBlockProps) => {
	const [collapsed, setCollapsed] = useState(false);
	const [elapsedTime, setElapsedTime] = useState('0.00s');
	const contentRef = useRef<HTMLDivElement>(null);

	// 推理完成后自动折叠
	useEffect(() => {
		if (durationMs !== undefined) {
			setCollapsed(true);
			setElapsedTime(formatDuration(durationMs));
		}
	}, [durationMs]);

	// 实时更新计时器
	useEffect(() => {
		if (durationMs !== undefined) return; // 已完成，不需要计时
		if (!isGenerating) return;

		let rafId: number;
		const tick = () => {
			const elapsed = Date.now() - startMs;
			setElapsedTime(`${(elapsed / 1000).toFixed(2)}s`);
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);

		return () => {
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [startMs, durationMs, isGenerating]);

	// 自动滚动到底部
	useEffect(() => {
		if (!collapsed && contentRef.current && isGenerating) {
			contentRef.current.scrollTop = contentRef.current.scrollHeight;
		}
	}, [content, collapsed, isGenerating]);

	const toggleCollapse = useCallback(() => {
		setCollapsed(prev => !prev);
	}, []);

	return (
		<div className="ff-reasoning-block">
			<div
				className="ff-reasoning-header"
				onClick={toggleCollapse}
			>
				<span className="ff-reasoning-title">深度思考</span>
				<span className="ff-reasoning-time">{elapsedTime}</span>
				<span className="ff-reasoning-toggle">
					{collapsed ? <ChevronRight className="tw-size-4" /> : <ChevronDown className="tw-size-4" />}
				</span>
			</div>
			{!collapsed && (
				<div
					ref={contentRef}
					className="ff-reasoning-content"
				>
					{content}
				</div>
			)}
		</div>
	);
};

// MCP 工具调用块组件
interface McpToolBlockProps {
	toolName: string;
	content: string;
}

export const McpToolBlockComponent = ({ toolName, content }: McpToolBlockProps) => {
	const [collapsed, setCollapsed] = useState(true);

	const toggleCollapse = useCallback(() => {
		setCollapsed(prev => !prev);
	}, []);

	return (
		<div className="ff-reasoning-block">
			<div
				className="ff-reasoning-header"
				onClick={toggleCollapse}
			>
				<span className="ff-reasoning-title">{toolName}</span>
				<span className="ff-reasoning-toggle">
					{collapsed ? <ChevronRight className="tw-size-4" /> : <ChevronDown className="tw-size-4" />}
				</span>
			</div>
			{!collapsed && (
				<div className="ff-reasoning-content">
					{content}
				</div>
			)}
		</div>
	);
};

// 文本块组件 - 用于渲染 Markdown 内容
interface TextBlockProps {
	content: string;
	obsidianApi: ObsidianApiProvider;
}

export const TextBlockComponent = ({ content, obsidianApi }: TextBlockProps) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const componentRef = useRef(new Component());

	useEffect(() => {
		if (!containerRef.current) return;

		const run = async () => {
			await renderMarkdownContent(
				obsidianApi,
				content,
				containerRef.current as HTMLDivElement,
				componentRef.current,
			);
		};
		void run();

		return () => {
			componentRef.current.unload();
		};
	}, [content, obsidianApi]);

	return <div ref={containerRef}></div>;
};
