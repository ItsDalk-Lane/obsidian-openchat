export const detectImageGenerationIntent = (content: string): boolean => {
	if (!content) return false;

	const lowerContent = content.toLowerCase();
	const explicitPhrases = [
		'图片生成', '图像生成', '作画', '绘画', '画图',
		'visualize', 'visualize a', 'visualize an',
		'show me a picture', 'show me an image',
		'display a picture', 'display an image',
	];
	if (explicitPhrases.some((phrase) => lowerContent.includes(phrase))) {
		return true;
	}

	const nonImageIndicators = [
		'计划', '方案', '方法', '流程', '系统', '策略', '模型', '框架', '文档', '报告',
		'故事', '代码', '文件', '列表', '表格', '总结', '概述', '分析', '结论',
		'重点', '笔记', '大纲', '草稿', '项目', '任务', '问题', '答案', '想法',
		'plan', 'strategy', 'method', 'approach', 'system', 'process', 'workflow',
		'story', 'code', 'file', 'list', 'table', 'summary', 'overview', 'analysis',
		'conclusion', 'note', 'outline', 'draft', 'project', 'task', 'problem', 'idea',
		'document', 'report', 'proposal', 'solution', 'concept',
	];
	const isBlacklisted = (text: string, pattern: string): boolean => {
		const index = text.indexOf(pattern);
		if (index === -1) return false;
		const afterPattern = text.slice(index + pattern.length).trim();
		const firstWord = afterPattern.split(/\s+/)[0];
		return nonImageIndicators.some((word) => firstWord.includes(word));
	};

	const chinesePatterns = [
		{ pattern: '画一个', maxLength: 12 },
		{ pattern: '画一张', maxLength: 12 },
		{ pattern: '画一幅', maxLength: 12 },
		{ pattern: '画个', maxLength: 10 },
		{ pattern: '画张', maxLength: 10 },
		{ pattern: '生成一张', maxLength: 12 },
		{ pattern: '生成一幅', maxLength: 12 },
		{ pattern: '生成一个', maxLength: 12 },
		{ pattern: '绘制一张', maxLength: 12 },
		{ pattern: '绘制一个', maxLength: 12 },
		{ pattern: '创建一张', maxLength: 12 },
		{ pattern: '创建一个', maxLength: 12 },
		{ pattern: '制作一张', maxLength: 12 },
		{ pattern: '制作一个', maxLength: 12 },
		{ pattern: '设计一张', maxLength: 12 },
		{ pattern: '设计一个', maxLength: 12 },
		{ pattern: '创作一张', maxLength: 12 },
		{ pattern: '创作一个', maxLength: 12 },
	];
	const imageRelatedWords = [
		'流程图', '结构图', '思维导图', '架构图', '示意图', '系统图',
		'肖像', '素描', '漫画', '线框图',
		'图片', '图像', '图表', '插图', '图画', '照片', '截图',
		'图', '画',
		'logo', '图标', '界面', '原型', 'ui',
	];
	for (const { pattern, maxLength } of chinesePatterns) {
		const index = lowerContent.indexOf(pattern);
		if (index === -1) continue;
		const afterPattern = lowerContent.slice(index + pattern.length, index + pattern.length + maxLength);
		if (imageRelatedWords.some((word) => afterPattern.includes(word))) {
			return true;
		}
		if (isBlacklisted(lowerContent, pattern)) {
			continue;
		}
	}

	const englishPatterns = [
		'draw a', 'draw an', 'draw me a', 'draw me an',
		'paint a', 'paint an', 'paint me a', 'paint me an',
	];
	for (const pattern of englishPatterns) {
		if (!lowerContent.includes(pattern) || isBlacklisted(lowerContent, pattern)) continue;
		return true;
	}

	const otherEnglishPatterns = [
		{ pattern: 'make a', maxLength: 20 },
		{ pattern: 'make an', maxLength: 20 },
		{ pattern: 'design a', maxLength: 20 },
		{ pattern: 'design an', maxLength: 20 },
		{ pattern: 'create a', maxLength: 20 },
		{ pattern: 'create an', maxLength: 20 },
		{ pattern: 'generate a', maxLength: 20 },
		{ pattern: 'generate an', maxLength: 20 },
	];
	const englishImageWords = [
		'image', 'picture', 'photo', 'diagram', 'chart', 'graph', 'icon', 'logo',
		'illustration', 'sketch', 'drawing', 'painting', 'portrait', 'visual',
	];
	for (const { pattern, maxLength } of otherEnglishPatterns) {
		const index = lowerContent.indexOf(pattern);
		if (index === -1 || isBlacklisted(lowerContent, pattern)) continue;
		const afterPattern = lowerContent.slice(index + pattern.length, index + pattern.length + maxLength);
		if (englishImageWords.some((word) => afterPattern.includes(word))) {
			return true;
		}
	}

	return false;
};
