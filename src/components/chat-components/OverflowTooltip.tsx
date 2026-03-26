import { useEffect, useRef, useState, type ReactNode } from 'react'

interface OverflowTooltipProps {
	children: ReactNode
	content: string
	className?: string
}

/**
 * 带溢出检测的描述组件
 * 只有当文本溢出（显示省略号）时，才在鼠标悬停时显示完整内容的 tooltip
 */
export function OverflowTooltip({
	children,
	content,
	className = '',
}: OverflowTooltipProps) {
	const textRef = useRef<HTMLDivElement>(null)
	const [isOverflowing, setIsOverflowing] = useState(false)

	useEffect(() => {
		const checkOverflow = () => {
			if (textRef.current) {
				const { scrollHeight, clientHeight } = textRef.current
				setIsOverflowing(scrollHeight > clientHeight)
			}
		}

		checkOverflow()

		// 监听窗口变化重新检测
		window.addEventListener('resize', checkOverflow)
		return () => window.removeEventListener('resize', checkOverflow)
	}, [content])

	return (
		<div className={`chat-settings-server-card__desc-wrapper ${className}`}>
			<div ref={textRef} className="chat-settings-server-card__desc">
				{children}
			</div>
			{isOverflowing && (
				<div className="chat-settings-server-card__desc-tooltip">
					{content}
				</div>
			)}
		</div>
	)
}
