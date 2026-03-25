const createOpenRouterHTTPError = (status: number, message: string) => {
	const error = new Error(message) as Error & { status?: number; statusCode?: number }
	error.status = status
	error.statusCode = status
	return error
}

export const buildOpenRouterHTTPError = (
	status: number,
	errorText: string,
	model: string,
	supportsImageGeneration: boolean,
) => {
	let errorMessage = `OpenRouter API 错误 (${status}): ${errorText}`

	if (status === 403) {
		errorMessage =
			`❌ OpenRouter API 访问被拒绝 (403 Forbidden)\n\n可能的原因：\n`
			+ `1. API Key 无效或已过期\n`
			+ `2. API Key 没有访问此模型的权限\n`
			+ `3. 账户余额不足或超出配额\n`
			+ `4. API Key 格式错误（应该是 sk-or-v1-xxxxxx）\n\n`
			+ `解决方法：\n`
			+ `• 在 OpenRouter 设置中检查 API Key 是否正确\n`
			+ `• 访问 https://openrouter.ai/keys 验证 API Key\n`
			+ `• 访问 https://openrouter.ai/credits 检查账户余额\n`
			+ `• 确认模型访问权限：${model}`

		try {
			const errorJson = JSON.parse(errorText) as { error?: { message?: string } }
			if (errorJson.error?.message) {
				errorMessage += `\n\nAPI 返回的详细错误：${errorJson.error.message}`
			}
		} catch {
			// ignore parse failure
		}
		return createOpenRouterHTTPError(status, errorMessage)
	}

	if (status === 401) {
		errorMessage =
			`❌ OpenRouter API 认证失败 (401 Unauthorized)\n\n`
			+ `API Key 未提供或无效。\n\n`
			+ `解决方法：\n`
			+ `• 在插件设置 > OpenRouter 中配置有效的 API Key\n`
			+ `• 访问 https://openrouter.ai/keys 获取或创建新的 API Key\n`
			+ `• 确保 API Key 格式正确（sk-or-v1-xxxxxx）`
		return createOpenRouterHTTPError(status, errorMessage)
	}

	try {
		const errorJson = JSON.parse(errorText) as { error?: { message?: string } }
		if (errorJson.error) {
			errorMessage = errorJson.error.message || errorText

			if (errorMessage.includes('invalid model name') || errorMessage.includes('invalid_model')) {
				errorMessage =
					`❌ 无效的模型名称：${model}\n\n推荐的图像生成模型：\n`
					+ `• google/gemini-2.5-flash-image-preview\n`
					+ `• google/gemini-2.0-flash-exp\n`
					+ `• openai/gpt-4o\n`
					+ `• anthropic/claude-3-5-sonnet\n\n`
					+ `请在 OpenRouter 设置中选择正确的模型名称。`
			} else if (
				supportsImageGeneration
				&& (
					errorMessage.includes('modalities')
					|| errorMessage.includes('output_modalities')
					|| errorMessage.includes('not support')
				)
			) {
				errorMessage =
					`❌ 模型不支持图像生成：${errorMessage}\n\n`
					+ `请确保：\n`
					+ `1. 模型的 output_modalities 包含 "image"\n`
					+ `2. 在 OpenRouter 模型页面筛选支持图像生成的模型\n`
					+ `3. 推荐使用 google/gemini-2.5-flash-image-preview`
			} else if (status === 429 || errorMessage.includes('rate limit')) {
				errorMessage =
					`❌ 请求频率超限 (429 Too Many Requests)\n\n`
					+ `您的请求过于频繁。\n\n`
					+ `解决方法：\n`
					+ `• 稍等片刻后再试\n`
					+ `• 检查账户配额限制\n`
					+ `• 考虑升级 OpenRouter 账户套餐`
			}
		}
	} catch {
		// keep original error text
	}

	return createOpenRouterHTTPError(status, errorMessage)
}
