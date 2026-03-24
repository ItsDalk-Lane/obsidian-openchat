/**
 * 爬虫黑名单配置模块
 * 定义禁止抓取的网站域名列表，支持精确域名匹配和子域名匹配
 */

/**
 * 默认爬虫黑名单 — 需要登录验证、有反爬机制或内容获取困难的网站
 *
 * 包括：
 * - 社交媒体平台（知乎、小红书、微博等）
 * - 短视频平台（抖音、TikTok 等）
 * - 即时通讯平台（微信公众号等）
 * - 视频平台（B站等）
 * - 技术社区（CSDN 等）
 */
export const DEFAULT_CRAWLER_BLACKLIST: readonly string[] = [
	// 知乎
	'zhihu.com',
	// 小红书
	'xiaohongshu.com',
	'xhs.com',
	// 微博
	'weibo.com',
	// 微信
	'weixin.qq.com',
	'mp.weixin.qq.com',
	// 抖音 / TikTok
	'douyin.com',
	'tiktok.com',
	// B站
	'bilibili.com',
	// CSDN
	'csdn.net',
];

/**
 * 将黑名单数组构建为高效查找用的 Set（去重 + 标准化）
 */
export function buildBlacklistSet(domains: readonly string[]): Set<string> {
	const set = new Set<string>();
	for (const domain of domains) {
		set.add(domain.toLowerCase());
	}
	return set;
}

/**
 * 检查指定主机名是否命中黑名单
 * 支持精确匹配和子域名匹配：
 *   黑名单 "zhihu.com" 会匹配 "zhihu.com"、"www.zhihu.com"、"zhuanlan.zhihu.com" 等
 */
export function isHostnameBlacklisted(
	hostname: string,
	blacklistSet: Set<string>
): boolean {
	const lower = hostname.toLowerCase();

	// 精确匹配
	if (blacklistSet.has(lower)) return true;

	// 子域名匹配：逐级剥离最左侧子域名
	const parts = lower.split('.');
	for (let i = 1; i < parts.length - 1; i++) {
		const parent = parts.slice(i).join('.');
		if (blacklistSet.has(parent)) return true;
	}

	return false;
}

/**
 * 检查 URL 是否命中爬虫黑名单
 * @returns 如果命中则返回匹配的域名，否则返回 null
 */
export function checkUrlBlacklist(
	url: string,
	blacklistSet: Set<string>
): string | null {
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.toLowerCase();

		if (blacklistSet.has(hostname)) return hostname;

		const parts = hostname.split('.');
		for (let i = 1; i < parts.length - 1; i++) {
			const parent = parts.slice(i).join('.');
			if (blacklistSet.has(parent)) return parent;
		}

		return null;
	} catch {
		return null;
	}
}
