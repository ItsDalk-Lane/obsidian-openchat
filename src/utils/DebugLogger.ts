/**
 * 调试日志管理器
 * 提供统一的日志输出控制
 */
export class DebugLogger {
	private static debugMode = false;
	private static debugLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
	private static llmConsoleLogEnabled = false;
	private static llmResponsePreviewChars = 100;
	private static readonly levels: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'warn', 'error'];

	/**
	 * 设置调试模式
	 */
	static setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}

	/**
	 * 设置调试级别
	 */
	static setDebugLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
		this.debugLevel = level;
	}

	/**
	 * 设置 LLM 调用日志开关（独立于 debugMode/debugLevel）。
	 */
	static setLlmConsoleLogEnabled(enabled: boolean): void {
		this.llmConsoleLogEnabled = enabled;
	}

	/**
	 * 设置 LLM 返回预览长度（默认 100）。
	 */
	static setLlmResponsePreviewChars(chars: number): void {
		const safe = Number.isFinite(chars) ? Math.floor(chars) : 100;
		this.llmResponsePreviewChars = Math.max(0, Math.min(5000, safe));
	}

	/**
	 * 获取当前调试模式状态
	 */
	static isDebugMode(): boolean {
		return this.debugMode;
	}

	/**
	 * 检查是否应该输出该级别的日志
	 */
	private static shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
		if (level === 'warn' || level === 'error') {
			return true;
		}

		if (!this.debugMode) {
			return false;
		}

		return DebugLogger.levels.indexOf(level) >= DebugLogger.levels.indexOf(this.debugLevel);
	}

	private static emit(
		level: 'debug' | 'info' | 'warn' | 'error' | 'log',
		message: string,
		args: unknown[]
	): void {
		switch (level) {
			case 'debug':
				console.debug(message, ...args);
				return;
			case 'info':
			case 'log':
				console.info(message, ...args);
				return;
			case 'warn':
				console.warn(message, ...args);
				return;
			case 'error':
				console.error(message, ...args);
				return;
		}
	}

	private static truncateText(value: string, maxChars: number): string {
		if (maxChars <= 0 || value.length <= maxChars) {
			return value;
		}

		return `${value.slice(0, maxChars)}...`;
	}

	private static summarizeLlmMessage(
		message: { role?: string; content?: string; embeds?: unknown },
		index: number,
		maxContentChars: number,
		remainingChars: number
	): {
		index: number;
		role: string;
		content: string;
		embedsCount: number;
		contentLength: number;
	} {
		const rawContent = message.content ?? '';
		const contentBudget = Math.max(0, Math.min(maxContentChars, remainingChars));
		const embedsCount = Array.isArray(message.embeds)
			? message.embeds.length
			: typeof message.embeds === 'object' && message.embeds !== null
				? Object.keys(message.embeds).length
				: 0;

		return {
			index,
			role: message.role ?? 'unknown',
			content: this.truncateText(rawContent, contentBudget),
			embedsCount,
			contentLength: rawContent.length,
		};
	}

	/**
	 * 输出 debug 级别日志
	 */
	static debug(message: string, ...args: unknown[]): void {
		if (this.shouldLog('debug')) {
			this.emit('debug', message, args);
		}
	}

	/**
	 * 输出 info 级别日志
	 */
	static info(message: string, ...args: unknown[]): void {
		if (this.shouldLog('info')) {
			this.emit('info', message, args);
		}
	}

	/**
	 * 输出 warn 级别日志
	 */
	static warn(message: string, ...args: unknown[]): void {
		if (this.shouldLog('warn')) {
			this.emit('warn', message, args);
		}
	}

	/**
	 * 输出 error 级别日志
	 */
	static error(message: string, ...args: unknown[]): void {
		if (this.shouldLog('error')) {
			this.emit('error', message, args);
		}
	}

	/**
	 * 输出普通日志（受调试模式控制，等同于 info 级别）。
	 */
	static log(message: string, ...args: unknown[]): void {
		if (this.shouldLog('info')) {
			this.emit('log', message, args);
		}
	}

	/**
	 * 统一打印大模型请求 messages 数组（受 LLM 日志独立开关控制）。
	 * - 默认会对单条 content 做截断，避免控制台卡顿。
	 * - 会输出 embeds 数量摘要（如有）。
	 */
	static logLlmMessages(
		tag: string,
		messages: Array<{ role?: string; content?: string; embeds?: unknown }>,
		options?: {
			level?: 'debug' | 'info' | 'warn' | 'error';
			maxContentChars?: number;
			maxTotalChars?: number;
			printRaw?: boolean;
		}
	): void {
		const level = options?.level ?? 'debug';
		if (!this.llmConsoleLogEnabled || !this.shouldLog(level)) {
			return;
		}

		if (options?.printRaw) {
			this.emit(level, `[LLM] ${tag} messages`, [messages]);
			return;
		}

		const maxContentChars = options?.maxContentChars ?? this.llmResponsePreviewChars;
		const maxTotalChars = options?.maxTotalChars ?? maxContentChars * Math.max(messages.length, 1);
		let consumedChars = 0;

		const summary = messages.map((message, index) => {
			const item = this.summarizeLlmMessage(
				message,
				index,
				maxContentChars,
				maxTotalChars - consumedChars,
			);
			consumedChars += item.content.length;
			return item;
		});

		this.emit(level, `[LLM] ${tag} messages`, [summary]);
	}

	/**
	 * 统一打印大模型返回内容的预览（默认前 100 字符）。
	 */
	static logLlmResponsePreview(
		tag: string,
		responseText: string,
		options?: {
			level?: 'debug' | 'info' | 'warn' | 'error';
			previewChars?: number;
			printLength?: boolean;
		}
	): void {
		const level = options?.level ?? 'debug';
		if (!this.llmConsoleLogEnabled || !this.shouldLog(level)) {
			return;
		}

		const previewChars = options?.previewChars ?? this.llmResponsePreviewChars;
		const preview = this.truncateText(responseText, previewChars);
		const metadata = options?.printLength ? { length: responseText.length } : undefined;

		if (metadata) {
			this.emit(level, `[LLM] ${tag} response`, [preview, metadata]);
			return;
		}

		this.emit(level, `[LLM] ${tag} response`, [preview]);
	}
}
