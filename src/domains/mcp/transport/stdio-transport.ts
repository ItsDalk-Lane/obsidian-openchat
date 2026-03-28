/**
 * @module mcp/transport/stdio-transport
 * @description 实现基于子进程标准输入输出的 MCP 传输层。
 *
 * @dependencies child_process, src/domains/mcp/types, src/domains/mcp/transport/transport.types
 * @side-effects 启动和终止子进程、读写 stdio 流、发出连接错误与关闭回调
 * @invariants 子进程存在且 stdin 可写时才允许发送消息。
 */

import type { ChildProcess } from 'child_process'
import type { McpDomainLogger } from '../types'
import type { ITransport, JsonRpcMessage } from './transport.types'

export interface StdioConfig {
	command: string
	args: string[]
	env?: Record<string, string>
	cwd?: string
}

export class StdioTransport implements ITransport {
	private process: ChildProcess | null = null
	private buffer = ''

	onMessage: ((msg: JsonRpcMessage) => void) | null = null
	onClose: ((code: number | null) => void) | null = null
	onError: ((error: Error) => void) | null = null

	constructor(
		private readonly config: StdioConfig,
		private readonly logger: McpDomainLogger,
	) {}

	get pid(): number | undefined {
		return this.process?.pid
	}

	/** @precondition config.command 为有效命令 @postcondition 子进程已启动并开始转发 stdout/stderr 事件 @throws 当子进程创建失败时抛出 @example await transport.start() */
	async start(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { spawn } = require('child_process') as typeof import('child_process')
		const env = { ...process.env, ...(this.config.env ?? {}) }
		this.process = spawn(this.config.command, this.config.args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: true,
			env,
			cwd: this.config.cwd,
			windowsHide: true,
		})

		await this.waitForProcessReady()

		this.process.stdout?.on('data', (data: Buffer) => {
			this.buffer += data.toString('utf-8')
			this.processBuffer()
		})
		this.process.stderr?.on('data', (data: Buffer) => {
			const text = data.toString('utf-8').trim()
			if (text) {
				this.logger.warn(`[MCP:stdio:stderr] ${text}`)
			}
		})
		this.process.on('close', (code) => {
			this.logger.info(`[MCP:stdio] 进程退出，code=${code}`)
			this.process = null
			this.onClose?.(code)
		})
		this.process.on('error', (error) => {
			this.logger.error('[MCP:stdio] 进程错误', error)
			this.onError?.(error)
		})
	}

	/** @precondition 子进程已运行且 stdin 可写 @postcondition 消息被写入标准输入流 @throws 当进程不可写时抛出 @example transport.send(message) */
	send(message: JsonRpcMessage): void {
		if (!this.process?.stdin?.writable) {
			throw new Error('MCP 服务器进程未运行，无法发送消息')
		}
		this.process.stdin.write(`${JSON.stringify(message)}\n`, 'utf-8')
	}

	/** @precondition 无 @postcondition 子进程被优雅或强制终止 @throws 从不抛出 @example await transport.stop() */
	async stop(): Promise<void> {
		if (!this.process) {
			return
		}

		const proc = this.process
		await new Promise<void>((resolve) => {
			const forceKillTimer = setTimeout(() => {
				try {
					proc.kill('SIGKILL')
				} catch (error) {
					this.logger.warn('[MCP:stdio] 强制终止进程失败', error)
				}
				resolve()
			}, 5000)

			proc.once('close', () => {
				clearTimeout(forceKillTimer)
				resolve()
			})

			try {
				proc.kill('SIGTERM')
			} catch (error) {
				this.logger.warn('[MCP:stdio] 终止进程失败', error)
				clearTimeout(forceKillTimer)
				resolve()
			}
		})
	}

	private waitForProcessReady(): Promise<void> {
		const proc = this.process
		if (!proc) {
			return Promise.reject(new Error('进程未创建'))
		}

		return new Promise<void>((resolve, reject) => {
			const readyTimeoutMs = 10000
			const cleanup = (): void => {
				clearTimeout(timer)
				proc.removeListener('spawn', onSpawn)
				proc.removeListener('error', onError)
			}
			const timer = setTimeout(() => {
				cleanup()
				this.logger.warn(`[MCP:stdio] 等待进程就绪超时（${readyTimeoutMs}ms），继续尝试握手...`)
				resolve()
			}, readyTimeoutMs)
			const onSpawn = (): void => {
				cleanup()
				this.logger.info(`[MCP:stdio] 进程已启动，PID=${proc.pid}`)
				resolve()
			}
			const onError = (error: Error): void => {
				cleanup()
				reject(new Error(`MCP 进程启动失败: ${error.message}`))
			}
			proc.once('spawn', onSpawn)
			proc.once('error', onError)
		})
	}

	private processBuffer(): void {
		const lines = this.buffer.split('\n')
		this.buffer = lines.pop() ?? ''
		for (const line of lines) {
			const trimmed = line.trim()
			if (!trimmed) {
				continue
			}
			try {
				this.onMessage?.(JSON.parse(trimmed) as JsonRpcMessage)
			} catch {
				this.logger.warn(`[MCP:stdio] 无法解析 JSON-RPC 消息: ${trimmed.substring(0, 200)}`)
			}
		}
	}
}