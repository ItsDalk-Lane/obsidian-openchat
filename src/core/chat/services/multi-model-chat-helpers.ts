import { v4 as uuidv4 } from 'uuid'
import type { ChatMessage } from '../types/chat'
import type { ParallelResponseEntry, ParallelResponseGroup } from '../types/multiModel'
import type { ProviderSettings } from 'src/types/provider'
import { getProviderModelDisplayName } from 'src/utils/aiProviderMetadata'

interface MultiModelChatServicePort {
	getState(): { parallelResponses?: ParallelResponseGroup }
	setParallelResponses(group?: ParallelResponseGroup): void
	getProviders(): ProviderSettings[]
	findProviderByTagExact(modelTag?: string): ProviderSettings | null
}

export const queueParallelResponseUpdate = (
	groupId: string,
	modelTag: string,
	patch: Partial<ParallelResponseEntry>,
	pendingResponsePatches: Map<string, Map<string, Partial<ParallelResponseEntry>>>,
	pendingFlushTimers: Map<string, number>,
	streamUpdateInterval: number,
	flush: (groupId: string) => void,
): void => {
	const groupBuffer =
		pendingResponsePatches.get(groupId)
		?? new Map<string, Partial<ParallelResponseEntry>>()
	const previousPatch = groupBuffer.get(modelTag) ?? {}
	groupBuffer.set(modelTag, { ...previousPatch, ...patch })
	pendingResponsePatches.set(groupId, groupBuffer)

	if (pendingFlushTimers.has(groupId)) {
		return
	}

	const timer = window.setTimeout(() => {
		pendingFlushTimers.delete(groupId)
		flush(groupId)
	}, streamUpdateInterval)
	pendingFlushTimers.set(groupId, timer)
}

export const flushQueuedParallelResponseUpdates = (
	groupId: string,
	pendingResponsePatches: Map<string, Map<string, Partial<ParallelResponseEntry>>>,
	pendingFlushTimers: Map<string, number>,
	chatService: MultiModelChatServicePort,
): void => {
	const timer = pendingFlushTimers.get(groupId)
	if (timer !== undefined) {
		window.clearTimeout(timer)
		pendingFlushTimers.delete(groupId)
	}

	const buffer = pendingResponsePatches.get(groupId)
	if (!buffer || buffer.size === 0) {
		return
	}

	const current = chatService.getState().parallelResponses
	if (!current || current.groupId !== groupId) {
		pendingResponsePatches.delete(groupId)
		return
	}

	const nextGroup: ParallelResponseGroup = {
		...current,
		responses: current.responses.map((response) => ({
			...response,
			...(buffer.get(response.modelTag) ?? {}),
		})),
	}
	pendingResponsePatches.delete(groupId)
	chatService.setParallelResponses(nextGroup)
}

export const applyParallelResponsePatch = (
	groupId: string,
	modelTag: string,
	patch: Partial<ParallelResponseEntry>,
	chatService: MultiModelChatServicePort,
): void => {
	const current = chatService.getState().parallelResponses
	if (!current || current.groupId !== groupId) {
		return
	}

	chatService.setParallelResponses({
		...current,
		responses: current.responses.map((response) =>
			response.modelTag !== modelTag ? response : { ...response, ...patch }
		),
	})
}

export const clearPendingParallelUpdates = (
	groupId: string,
	pendingResponsePatches: Map<string, Map<string, Partial<ParallelResponseEntry>>>,
	pendingFlushTimers: Map<string, number>,
): void => {
	const timer = pendingFlushTimers.get(groupId)
	if (timer !== undefined) {
		window.clearTimeout(timer)
		pendingFlushTimers.delete(groupId)
	}
	pendingResponsePatches.delete(groupId)
}

export const clearAllPendingParallelUpdates = (
	pendingResponsePatches: Map<string, Map<string, Partial<ParallelResponseEntry>>>,
	pendingFlushTimers: Map<string, number>,
): void => {
	for (const timer of pendingFlushTimers.values()) {
		window.clearTimeout(timer)
	}
	pendingFlushTimers.clear()
	pendingResponsePatches.clear()
}

export const runWithConcurrency = async <TInput, TResult>(
	items: TInput[],
	concurrency: number,
	worker: (item: TInput, index: number) => Promise<TResult | null>,
	shouldStop?: () => boolean,
): Promise<TResult[]> => {
	const results = new Array<TResult | null>(items.length).fill(null)
	let cursor = 0
	const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (cursor < items.length) {
			if (shouldStop?.()) {
				return
			}
			const currentIndex = cursor
			cursor += 1
			if (shouldStop?.()) {
				return
			}
			results[currentIndex] = await worker(items[currentIndex], currentIndex)
		}
	})
	await Promise.all(runners)
	return results.filter((item): item is TResult => item !== null)
}

export const isAbortError = (error: unknown): boolean => {
	if (error instanceof DOMException && error.name === 'AbortError') {
		return true
	}
	return error instanceof Error ? error.name === 'AbortError' : false
}

export const getModelDisplayName = (
	modelTag: string,
	chatService: MultiModelChatServicePort,
): string => {
	const providers = chatService.getProviders()
	const provider = chatService.findProviderByTagExact(modelTag)
	return provider
		? getProviderModelDisplayName(provider, providers)
		: modelTag
}

export const createErrorMessage = (
	modelTag: string,
	error: unknown,
	chatService: MultiModelChatServicePort,
	extras?: {
		taskDescription?: string
		executionIndex?: number
		parallelGroupId?: string
	},
): ChatMessage => {
	const errorMessage =
		error instanceof Error ? error.message : `生成过程中发生未知错误: ${String(error)}`
	return {
		id: `chat-${uuidv4()}`,
		role: 'assistant',
		content: errorMessage,
		timestamp: Date.now(),
		isError: true,
		modelTag,
		modelName: getModelDisplayName(modelTag, chatService),
		taskDescription: extras?.taskDescription,
		executionIndex: extras?.executionIndex,
		parallelGroupId: extras?.parallelGroupId,
		metadata: {
			hiddenFromModel: true,
		},
	}
}
