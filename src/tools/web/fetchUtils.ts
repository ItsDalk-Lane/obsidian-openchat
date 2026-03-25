import { htmlToMarkdown, requestUrl } from 'obsidian';
import { Readability } from '@mozilla/readability';

/**
 * 验证 URL 格式，仅允许 http/https 协议
 */
export function validateUrl(url: string): string {
	const trimmed = url.trim();
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error(`URL 格式无效: ${trimmed}`);
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(`不支持的协议: ${parsed.protocol}，仅支持 http 和 https`);
	}

	// 安全检查：拒绝指向私有 IP 的 URL
	const hostname = parsed.hostname;
	if (isPrivateHostname(hostname)) {
		throw new Error(`安全限制：不允许访问私有网络地址: ${hostname}`);
	}

	return trimmed;
}

/**
 * 检查主机名是否为私有/内部地址
 */
function isPrivateHostname(hostname: string): boolean {
	// 检查常见私有 IP 范围
	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
		return true;
	}

	// 检查 IPv4 私有地址段
	const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (ipv4Match) {
		const [, a, b] = ipv4Match.map(Number);
		// 10.0.0.0/8
		if (a === 10) return true;
		// 172.16.0.0/12
		if (a === 172 && b >= 16 && b <= 31) return true;
		// 192.168.0.0/16
		if (a === 192 && b === 168) return true;
		// 169.254.0.0/16 (link-local)
		if (a === 169 && b === 254) return true;
	}

	return false;
}

/**
 * 构建 robots.txt 的 URL
 */
export function getRobotsTxtUrl(url: string): string {
	const parsed = new URL(url);
	return `${parsed.protocol}//${parsed.host}/robots.txt`;
}

/**
 * 解析 robots.txt，检查是否允许指定 User-Agent 访问目标 URL
 */
export function parseRobotsTxt(robotsTxt: string, url: string, userAgent: string): boolean {
	const lines = robotsTxt.split('\n').map((line) => {
		// 移除注释
		const commentIndex = line.indexOf('#');
		return (commentIndex >= 0 ? line.slice(0, commentIndex) : line).trim();
	});

	const parsedUrl = new URL(url);
	const path = parsedUrl.pathname + parsedUrl.search;
	const normalizedAgent = userAgent.toLowerCase();

	const currentAgents: string[] = [];
	let isMatchingAgent = false;
	let isWildcardAgent = false;
	let specificResult: boolean | null = null;
	let wildcardResult: boolean | null = null;

	for (const line of lines) {
		if (!line) continue;

		const colonIndex = line.indexOf(':');
		if (colonIndex < 0) continue;

		const directive = line.slice(0, colonIndex).trim().toLowerCase();
		const value = line.slice(colonIndex + 1).trim();

		if (directive === 'user-agent') {
			if (currentAgents.length > 0 && (isMatchingAgent || isWildcardAgent)) {
				// 已处理完当前 agent 块，如果找到特定匹配则停止
				if (specificResult !== null) break;
			}
			if (currentAgents.length === 0 || directive === 'user-agent') {
				currentAgents.push(value.toLowerCase());
				isMatchingAgent = currentAgents.some(
					(agent) => normalizedAgent.includes(agent) && agent !== '*'
				);
				isWildcardAgent = currentAgents.includes('*');
			}
		} else if (directive === 'disallow' || directive === 'allow') {
			if (!value && directive === 'disallow') continue; // 空 Disallow 意味着允许所有
			if (!isMatchingAgent && !isWildcardAgent) continue;

			const matches = matchRobotsPath(path, value);
			if (matches) {
				const allowed = directive === 'allow';
				if (isMatchingAgent) {
					specificResult = allowed;
				} else if (isWildcardAgent && wildcardResult === null) {
					wildcardResult = allowed;
				}
			}
		} else if (directive !== 'user-agent') {
			// 遇到非 User-agent 行后，重置 agent 列表以准备下一个块
			// 但只有遇到新的 User-agent 行时才重置
		}
	}

	// 优先使用特定 agent 匹配结果，其次使用通配符结果
	if (specificResult !== null) return specificResult;
	if (wildcardResult !== null) return wildcardResult;

	// 默认允许访问
	return true;
}

/**
 * 匹配 robots.txt 路径规则
 */
export function matchRobotsPath(urlPath: string, pattern: string): boolean {
	if (!pattern) return false;

	// 将 robots.txt 通配符模式转换为正则
	let regexStr = '';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === '*') {
			regexStr += '.*';
		} else if (char === '$' && i === pattern.length - 1) {
			regexStr += '$';
		} else {
			regexStr += char.replace(/[.*+?^{}()|[\]\\]/g, '\\$&');
		}
	}

	try {
		return new RegExp(`^${regexStr}`).test(urlPath);
	} catch {
		return urlPath.startsWith(pattern);
	}
}

/**
 * 检查 robots.txt 是否允许访问
 */
export async function checkRobotsTxt(url: string, userAgent: string): Promise<void> {
	const robotsTxtUrl = getRobotsTxtUrl(url);

	try {
		const response = await requestUrl({
			url: robotsTxtUrl,
			method: 'GET',
			headers: { 'User-Agent': userAgent },
		});

		// 401/403 表示禁止自动访问
		if (response.status === 401 || response.status === 403) {
			throw new Error(
				`获取 robots.txt (${robotsTxtUrl}) 时收到状态码 ${response.status}，` +
				`推断该站点不允许自动化工具访问。用户可尝试设置 raw 参数手动获取。`
			);
		}

		// 4xx 其他错误视为无限制
		if (response.status >= 400 && response.status < 500) {
			return;
		}

		const robotsTxt = response.text;
		const allowed = parseRobotsTxt(robotsTxt, url, userAgent);

		if (!allowed) {
			throw new Error(
				`目标网站的 robots.txt (${robotsTxtUrl}) 禁止当前 User-Agent 访问该页面。\n` +
				`User-Agent: ${userAgent}\n` +
				`URL: ${url}\n` +
				`如需强制获取，请在设置中禁用 robots.txt 检查。`
			);
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes('robots.txt')) {
			throw error;
		}
		// robots.txt 获取失败（网络问题），记录警告但继续执行
		// 因为无法确定限制规则，默认允许访问
	}
}

/**
 * 判断内容是否为 HTML
 */
export function isHtmlContent(contentType: string, rawContent: string): boolean {
	if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
		return true;
	}
	// Content-Type 未指定时，检测内容特征
	if (!contentType || contentType.includes('text/plain')) {
		const trimmed = rawContent.trimStart().slice(0, 200).toLowerCase();
		return trimmed.includes('<html') || trimmed.includes('<!doctype html');
	}
	return false;
}

/**
 * 使用 Readability 提取 HTML 正文内容
 */
export function extractHtmlContent(html: string, url: string): string {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');

		// 设置文档 URL，使 Readability 能正确处理相对链接
		const baseEl = doc.createElement('base');
		baseEl.setAttribute('href', url);
		doc.head.appendChild(baseEl);

		const reader = new Readability(doc);
		const article = reader.parse();

		if (!article || !article.content) {
			return '';
		}

		return article.content;
	} catch {
		return '';
	}
}

/**
 * 将 HTML 内容转换为 Markdown
 */
export function convertHtmlToMarkdown(html: string): string {
	try {
		return htmlToMarkdown(html);
	} catch {
		// 回退：简单移除 HTML 标签
		return html
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}
}
