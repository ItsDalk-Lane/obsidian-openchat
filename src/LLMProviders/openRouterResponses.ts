import { DebugLogger } from 'src/utils/DebugLogger'
import type { SaveAttachment } from '.'
import { buildReasoningBlockEnd, buildReasoningBlockStart } from './utils'

interface OpenRouterResponseContext {
	useResponsesAPI: boolean
	imageSaveAsAttachment: boolean
	saveAttachment?: SaveAttachment
	imageDisplayWidth: number
	supportsImageGeneration: boolean
	controller: AbortController
}

const yieldImageContent = async function* (
	imageUrl: string,
	index: number,
	total: number,
	context: OpenRouterResponseContext,
): AsyncGenerator<string, void, undefined> {
	if (context.imageSaveAsAttachment && context.saveAttachment) {
		try {
			if (!imageUrl.startsWith('data:')) {
				yield `⚠️ 检测到 URL 格式图片，但配置为保存附件。图片 URL：${imageUrl}\n\n`
				return
			}

			const base64Data = imageUrl.split(',')[1]
			if (!base64Data) {
				throw new Error('无效的 base64 数据')
			}

			const binaryString = atob(base64Data)
			const bytes = new Uint8Array(binaryString.length)
			for (let offset = 0; offset < binaryString.length; offset += 1) {
				bytes[offset] = binaryString.charCodeAt(offset)
			}
			const now = new Date()
			const formatTime =
				`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
				+ `_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
			const indexFlag = total > 1 ? `-${index + 1}` : ''
			const filename = `openrouter-${formatTime}${indexFlag}.png`

			await context.saveAttachment(filename, bytes.buffer)
			yield `![[${filename}|${context.imageDisplayWidth}]]\n\n`
		} catch (error) {
			DebugLogger.error('[OpenRouter] 处理图片 URL 时出错', error)
			const errorMsg = error instanceof Error ? error.message : String(error)
			yield `❌ 图片保存失败: ${errorMsg}\n\n`
		}
		return
	}

	yield imageUrl.startsWith('data:')
		? `📷 生成的图片（Base64 格式，长度: ${imageUrl.length}）\n\n`
		: `📷 生成的图片 URL：${imageUrl}\n\n`
}

const extractOutputText = (content: unknown): string => {
	if (!Array.isArray(content)) return ''
	for (const item of content) {
		if (!item || typeof item !== 'object') continue
		const record = item as { type?: unknown; text?: unknown }
		if (record.type === 'output_text' && typeof record.text === 'string') {
			return record.text
		}
	}
	return ''
}

export async function* handleOpenRouterStreamingResponse(
	response: Response,
	context: OpenRouterResponseContext,
): AsyncGenerator<string, void, undefined> {
	const reader = response.body?.getReader()
	if (!reader) {
		throw new Error('Response body is not readable')
	}

	const decoder = new TextDecoder()
	let buffer = ''
	let reasoningActive = false
	let reasoningStartMs: number | null = null

	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })

			while (true) {
				const lineEnd = buffer.indexOf('\n')
				if (lineEnd === -1) break
				const line = buffer.slice(0, lineEnd).trim()
				buffer = buffer.slice(lineEnd + 1)
				if (!line.startsWith('data: ')) continue

				const lineData = line.slice(6)
				if (lineData === '[DONE]') break

				try {
					const parsed = JSON.parse(lineData) as Record<string, unknown>

					if (context.useResponsesAPI) {
						const reasonContent = parsed.reasoning_content
							|| ((parsed.delta as Record<string, unknown> | undefined)?.reasoning_content)
						if (typeof reasonContent === 'string' && reasonContent) {
							if (!reasoningActive) {
								reasoningActive = true
								reasoningStartMs = Date.now()
								yield buildReasoningBlockStart(reasoningStartMs)
							}
							yield reasonContent
							continue
						}

						if (typeof parsed.type === 'string') {
							if (
								parsed.type === 'response.reasoning.delta'
								|| parsed.type === 'response.reasoning_text.delta'
							) {
								if (typeof parsed.delta === 'string' && parsed.delta) {
									if (!reasoningActive) {
										reasoningActive = true
										reasoningStartMs = Date.now()
										yield buildReasoningBlockStart(reasoningStartMs)
									}
									yield parsed.delta
								}
								continue
							}

							if (parsed.type === 'response.output_text.delta') {
								if (reasoningActive) {
									reasoningActive = false
									yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
									reasoningStartMs = null
								}
								if (typeof parsed.delta === 'string' && parsed.delta) {
									yield parsed.delta
								}
								continue
							}

							if (parsed.type === 'response.completed' && reasoningActive) {
								reasoningActive = false
								yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
								reasoningStartMs = null
								continue
							}
						}
					}

					const content = (((parsed.choices as unknown[])?.[0] as Record<string, unknown> | undefined)?.delta as Record<string, unknown> | undefined)?.content
					if (typeof content === 'string' && content) {
						yield content
					}

					const delta = ((parsed.choices as unknown[])?.[0] as Record<string, unknown> | undefined)?.delta as {
						images?: Array<{ image_url?: { url?: string } }>
					} | undefined
					if (Array.isArray(delta?.images)) {
						for (const [index, image] of delta.images.entries()) {
							const imageUrl = image.image_url?.url
							if (imageUrl) {
								yield* yieldImageContent(imageUrl, index, delta.images.length, context)
							}
						}
					}
				} catch {
					// Ignore invalid JSON
				}
			}
		}
	} finally {
		if (reasoningActive) {
			yield buildReasoningBlockEnd(Date.now() - (reasoningStartMs ?? Date.now()))
		}
		void reader.cancel()
	}
}

export async function* handleOpenRouterNonStreamingResponse(
	response: Response,
	context: OpenRouterResponseContext,
): AsyncGenerator<string, void, undefined> {
	const responseText = await response.text()

	try {
		const parsed = JSON.parse(responseText) as Record<string, unknown>

		if (context.useResponsesAPI && Array.isArray(parsed.output)) {
			let hasReasoning = false
			let finalText = ''
			let reasoningText = ''
			for (const output of parsed.output as Array<Record<string, unknown>>) {
				if (output.type === 'reasoning') {
					if (!hasReasoning) {
						hasReasoning = true
						finalText += buildReasoningBlockStart(Date.now())
					}
					if (Array.isArray(output.content)) {
						for (const contentItem of output.content as Array<Record<string, unknown>>) {
							if (contentItem.type === 'input_text' && typeof contentItem.text === 'string') {
								reasoningText += contentItem.text
							}
						}
					}
					if (Array.isArray(output.summary)) {
						for (const summaryItem of output.summary) {
							reasoningText += `\n${String(summaryItem)}`
						}
					}
					finalText += reasoningText
				} else if (output.type === 'message') {
					const textContent = extractOutputText(output.content)
					if (textContent) {
						if (hasReasoning) {
							finalText += buildReasoningBlockEnd(10)
						}
						finalText += textContent
					}
				}
			}
			if (finalText) {
				yield finalText
			}
		} else {
			const content = (((parsed.choices as unknown[])?.[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.content
			if (typeof content === 'string' && content) {
				yield content
			}
		}

		if (context.useResponsesAPI) {
			return
		}

		const message = ((parsed.choices as unknown[])?.[0] as Record<string, unknown> | undefined)?.message as {
			content?: string
			images?: Array<{ image_url?: { url?: string } }>
		} | undefined
		if (Array.isArray(message?.images)) {
			yield '\n\n'
			for (const [index, image] of message.images.entries()) {
				const imageUrl = image.image_url?.url
				if (imageUrl) {
					yield* yieldImageContent(imageUrl, index, message.images.length, context)
				}
			}
		}

		if (!message?.content && !message?.images && context.supportsImageGeneration) {
			yield '⚠️ 图像生成请求完成，但 API 未返回图片数据。请检查模型配置或提示词。'
		}
	} catch (error) {
		DebugLogger.error('解析非流式响应失败:', error)
		throw new Error(`解析响应失败: ${error instanceof Error ? error.message : String(error)}`)
	}
}
