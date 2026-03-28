import type { FileIntentAnalysis, FileRole } from './types'

/**
 * 文件意图分析器
 * 通过分析提示词模板特征，判断文件的预期用途。
 */
export class FileIntentAnalyzer {
	analyzePromptIntent(template: string): FileIntentAnalysis {
		if (!template || template.trim().length === 0) {
			return this.createAnalysis('reference', '空模板，默认作为参考资料', 'low')
		}

		if (this.isRoleDefinitionTemplate(template)) {
			return this.createAnalysis(
				'processing_target',
				'检测到角色定义类提示词，文件应作为待处理数据',
				'high',
			)
		}

		if (this.isTaskInstructionTemplate(template)) {
			return this.analyzeTaskIntent(template)
		}

		if (this.hasExplicitFileReference(template)) {
			return this.createAnalysis(
				'processing_target',
				'提示词明确引用了文件内容',
				'high',
			)
		}

		if (this.isExampleTemplate(template)) {
			return this.createAnalysis(
				'example',
				'检测到示例类关键词，文件作为示例参考',
				'medium',
			)
		}

		return this.createAnalysis(
			'reference',
			'未检测到明确的处理意图，文件作为参考资料',
			'medium',
		)
	}

	private isRoleDefinitionTemplate(template: string): boolean {
		const rolePatterns = [
			/你\s*是\s*(一位|一个)?/,
			/你\s*扮演\s*/,
			/你\s*作为\s*/,
			/你是\s*(资深|专业|经验丰富|优秀)/,
			/你\s*充当/,
			/作为\s*(一位|一个)?\s*(专业|资深)?/,
			/you\s+are\s+(a|an)?\s*/i,
			/act\s+as\s+(a|an)?\s*/i,
			/role:\s*\w+/i,
			/persona:\s*\w+/i,
		]
		return rolePatterns.some((pattern) => pattern.test(template))
	}

	private isTaskInstructionTemplate(template: string): boolean {
		const taskPatterns = [
			/请\s*(分析|总结|提取|生成|创建|处理|翻译|重写|改写)/,
			/(分析|总结|提取|处理)\s*(以下|这篇|上述|下面)/,
			/基于\s*(提供|给定|以下|上述)/,
			/对\s*(以下|这篇|上述).*(进行|执行)/,
			/阅读\s*(以下|这篇|上述)/,
			/根据\s*(以下|这篇|上述)/,
			/please\s+(analyze|summarize|extract|process|translate)/i,
			/based\s+on\s+(the|this|these)/i,
			/(analyze|summarize|process)\s+(the\s+)?following/i,
		]
		return taskPatterns.some((pattern) => pattern.test(template))
	}

	private analyzeTaskIntent(template: string): FileIntentAnalysis {
		const processingKeywords = [
			'分析', '处理', '总结', '提取', '生成', '转换', '翻译', '重写', '改写',
			'优化', '修改', '整理', '归纳', '概括', '解读', '解析', '评估', '审阅',
			'analyze', 'process', 'summarize', 'extract', 'generate', 'transform',
			'translate', 'rewrite', 'optimize', 'modify', 'review', 'evaluate',
		]

		const lowerTemplate = template.toLowerCase()
		const hasProcessingKeyword = processingKeywords.some((keyword) =>
			lowerTemplate.includes(keyword.toLowerCase()),
		)

		if (hasProcessingKeyword) {
			return this.createAnalysis(
				'processing_target',
				'检测到处理类任务关键词',
				'high',
			)
		}

		const queryKeywords = ['查找', '搜索', '检索', '寻找', 'find', 'search', 'lookup']
		const hasQueryKeyword = queryKeywords.some((keyword) =>
			lowerTemplate.includes(keyword.toLowerCase()),
		)

		if (hasQueryKeyword) {
			return this.createAnalysis(
				'reference',
				'检测到查询类任务，文件作为参考数据源',
				'medium',
			)
		}

		return this.createAnalysis(
			'reference',
			'任务类模板，但未明确要求处理文件',
			'medium',
		)
	}

	private hasExplicitFileReference(template: string): boolean {
		const referencePatterns = [
			/\{\{.*\}\}/,
			/\$\{.*\}/,
			/<file>.*<\/file>/i,
			/\[文件\]|\[file\]/i,
			/附件|attachment/i,
			/以下\s*文件/,
			/下面\s*的?\s*文件/,
			/用户\s*(提供|上传)\s*的?\s*文件/,
			/文件\s*内容/,
		]
		return referencePatterns.some((pattern) => pattern.test(template))
	}

	private isExampleTemplate(template: string): boolean {
		const examplePatterns = [
			/示例|样例|范例|模板/,
			/example|sample|template/i,
			/参照\s*(以下|这个)/,
			/按照\s*(这个|以下)\s*(格式|风格)/,
			/仿照|模仿|学习.*风格/,
		]
		return examplePatterns.some((pattern) => pattern.test(template))
	}

	private createAnalysis(
		role: FileRole,
		reasoning: string,
		confidence: 'high' | 'medium' | 'low',
	): FileIntentAnalysis {
		return { role, reasoning, confidence }
	}

	getFileRoleDisplayName(role: FileRole): string {
		const names: Record<FileRole, string> = {
			processing_target: '待处理数据',
			reference: '参考资料',
			example: '示例',
			context: '上下文背景',
		}
		return names[role] ?? '未知'
	}
}