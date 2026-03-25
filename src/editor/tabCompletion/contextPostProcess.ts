import { EditorContext, ContextType } from './ContextBuilder'

/**
 * 后处理 AI 输出的建议内容
 * 根据上下文智能处理换行、格式等
 */
export function postProcessSuggestion(
    suggestion: string,
    context: EditorContext
): string {
    if (!suggestion || suggestion.trim().length === 0) {
        return ''
    }

    let processed = suggestion

    // 1. 移除 AI 可能添加的代码块包裹
    processed = removeCodeBlockWrapper(processed)

    // 2. 智能处理开头的换行
    processed = processLeadingNewline(processed, context)

    // 3. 处理列表格式
    if (context.contextType === ContextType.ListItem && context.listItemFormat) {
        processed = processListFormat(processed, context)
    }

    // 4. 处理引用块格式
    if (context.contextType === ContextType.Blockquote) {
        processed = processBlockquoteFormat(processed)
    }

    return processed
}

/**
 * 移除 AI 可能添加的代码块包裹
 */
function removeCodeBlockWrapper(text: string): string {
    // 移除开头的 ```markdown 或 ``` 和结尾的 ```
    const codeBlockMatch = text.match(/^```(?:markdown|md)?\n([\s\S]*?)\n?```$/m)
    if (codeBlockMatch) {
        return codeBlockMatch[1]
    }
    return text
}

/**
 * 智能处理开头的换行
 */
function processLeadingNewline(text: string, context: EditorContext): string {
    // 如果需要在建议前添加换行
    if (context.needsLeadingNewline) {
        // 检查建议是否已经以换行开头
        if (!text.startsWith('\n')) {
            return '\n' + text
        }
    } else {
        // 不需要换行时，移除开头多余的换行
        // 但保留一个空格（如果原文没有以空格结尾）
        if (text.startsWith('\n')) {
            const trimmed = text.replace(/^\n+/, '')
            // 如果光标前没有空格，且建议不以空格开头，添加一个空格
            if (context.textBeforeCursorOnLine.length > 0 &&
                !context.textBeforeCursorOnLine.endsWith(' ') &&
                !trimmed.startsWith(' ')) {
                return ' ' + trimmed
            }
            return trimmed
        }
    }
    return text
}

/**
 * 处理列表格式
 */
function processListFormat(text: string, context: EditorContext): string {
    if (!context.listItemFormat) return text

    const lines = text.split('\n')
    const processedLines: string[] = []
    const { indent, marker, isOrdered, nextItemPrefix } = context.listItemFormat
    let currentNumber = isOrdered ? parseInt(marker) : 0

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]

        // 跳过空行
        if (line.trim().length === 0) {
            processedLines.push(line)
            continue
        }

        // 检查这一行是否已经有列表格式
        const hasListMarker = /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)

        if (hasListMarker) {
            // 已经有列表标记，保持原样但调整缩进
            if (isOrdered) {
                // 有序列表：更新数字
                currentNumber++
                line = line.replace(/^\s*\d+\.\s/, `${indent}${currentNumber}. `)
            } else {
                // 无序列表：统一使用相同的标记
                line = line.replace(/^\s*[-*+]\s/, nextItemPrefix)
            }
        } else if (i > 0 || context.needsLeadingNewline) {
            // 没有列表标记但应该是新的列表项
            // 第一行如果不需要换行，则是当前列表项的续写
            if (i > 0) {
                if (isOrdered) {
                    currentNumber++
                    line = `${indent}${currentNumber}. ${line.trim()}`
                } else {
                    line = `${nextItemPrefix}${line.trim()}`
                }
            }
        }

        processedLines.push(line)
    }

    return processedLines.join('\n')
}

/**
 * 处理引用块格式
 */
function processBlockquoteFormat(text: string): string {
    const lines = text.split('\n')
    const processedLines = lines.map((line) => {
        // 如果行不为空且不以 > 开头，添加 >
        if (line.trim().length > 0 && !line.startsWith('>')) {
            return '> ' + line
        }
        return line
    })
    return processedLines.join('\n')
}

/**
 * 限制建议内容的长度
 * @param text 原始建议文本
 * @param maxSentences 最大句子数
 * @returns 截断后的文本
 */
export function limitSuggestionLength(text: string, maxSentences = 1): string {
    if (maxSentences <= 0) {
        return text
    }

    // 句子结束的标记
    const sentenceEnders = /[。！？.!?]/g

    let sentenceCount = 0
    let lastEndIndex = 0
    let match: RegExpExecArray | null

    while ((match = sentenceEnders.exec(text)) !== null) {
        sentenceCount++
        lastEndIndex = match.index + 1

        if (sentenceCount >= maxSentences) {
            // 达到最大句子数，截断
            return text.substring(0, lastEndIndex)
        }
    }

    // 如果没有找到句子结束标记，返回原文
    // 或者句子数没达到限制，也返回原文
    return text
}
