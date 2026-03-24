import { DateTime, IANAZone } from 'luxon';

export interface TimeResult {
	timezone: string;
	datetime: string;
	day_of_week: string;
	is_dst: boolean;
	month: number;
	iso_week_of_year: number;
	iso_week_year: number;
}

export interface TimeConversionResult {
	source: TimeResult;
	target: TimeResult;
	time_difference: string;
}

export interface TimeRangeResult {
	start: number;
	end: number;
	start_datetime: string;
	end_datetime: string;
	timezone: string;
	parsed_expression: string;
}

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CHINESE_NUMBER_MAP: Record<string, number> = {
	零: 0,
	〇: 0,
	一: 1,
	二: 2,
	两: 2,
	三: 3,
	四: 4,
	五: 5,
	六: 6,
	七: 7,
	八: 8,
	九: 9,
};

const normalizeNaturalTimeInput = (input: string): { spaced: string; compact: string } => {
	const normalized = String(input ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
	return {
		spaced: normalized,
		compact: normalized.replace(/\s+/g, ''),
	};
};

const parseChineseInteger = (value: string): number | null => {
	const normalized = value.trim();
	if (!normalized) {
		return null;
	}
	if (/^\d+$/.test(normalized)) {
		return Number(normalized);
	}
	if (normalized === '十') {
		return 10;
	}
	const tensMatch = normalized.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
	if (tensMatch) {
		const tens = tensMatch[1] ? CHINESE_NUMBER_MAP[tensMatch[1]] : 1;
		const ones = tensMatch[2] ? CHINESE_NUMBER_MAP[tensMatch[2]] : 0;
		return tens * 10 + ones;
	}
	if (normalized.length === 1 && normalized in CHINESE_NUMBER_MAP) {
		return CHINESE_NUMBER_MAP[normalized];
	}
	return null;
};

const parsePositiveCount = (value: string): number | null => {
	const normalized = value.trim();
	if (!normalized) {
		return null;
	}
	if (/^\d+$/.test(normalized)) {
		const parsed = Number(normalized);
		return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
	}
	const parsedChinese = parseChineseInteger(normalized);
	return parsedChinese !== null && parsedChinese > 0 ? parsedChinese : null;
};

const createTimeRangeResult = (
	timezone: string,
	start: DateTime,
	end: DateTime,
	parsedExpression: string
): TimeRangeResult => {
	if (!start.isValid || !end.isValid) {
		throw new Error('无法计算时间范围');
	}
	const startIso = start.toISO();
	const endIso = end.toISO();
	if (!startIso || !endIso) {
		throw new Error('无法格式化时间范围为 ISO 字符串');
	}
	return {
		start: start.toMillis(),
		end: end.toMillis(),
		start_datetime: startIso,
		end_datetime: endIso,
		timezone,
		parsed_expression: parsedExpression,
	};
};

const toIsoSeconds = (dt: DateTime): string => {
	const iso = dt.toISO({
		suppressMilliseconds: true,
	});
	if (!iso) {
		throw new Error('Failed to format datetime to ISO string');
	}
	return iso;
};

const toTimeResult = (timezone: string, dt: DateTime): TimeResult => {
	return {
		timezone,
		datetime: toIsoSeconds(dt),
		day_of_week: dt.setLocale('en').toFormat('cccc'),
		is_dst: dt.isInDST,
		month: dt.month,
		iso_week_of_year: dt.weekNumber,
		iso_week_year: dt.weekYear,
	};
};

export function validateIanaTimezone(tz: string): string {
	const normalized = String(tz ?? '').trim();
	if (!IANAZone.isValidZone(normalized)) {
		throw new Error(`Invalid timezone: ${normalized}`);
	}
	return normalized;
}

export function formatHourDiff(diffHours: number): string {
	if (!Number.isFinite(diffHours)) {
		throw new Error('Invalid hour difference');
	}

	if (Number.isInteger(diffHours)) {
		return `${diffHours >= 0 ? '+' : ''}${diffHours.toFixed(1)}h`;
	}

	const absValue = Math.abs(diffHours);
	const compact = absValue.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
	return `${diffHours >= 0 ? '+' : '-'}${compact}h`;
}

export function buildCurrentTimeResult(timezone: string): TimeResult {
	const normalizedTimezone = validateIanaTimezone(timezone);
	const now = DateTime.now().setZone(normalizedTimezone);
	if (!now.isValid) {
		throw new Error(`Invalid timezone: ${normalizedTimezone}`);
	}
	return toTimeResult(normalizedTimezone, now);
}

export function buildTimeConversionResult(
	sourceTimezone: string,
	timeHHMM: string,
	targetTimezone: string
): TimeConversionResult {
	const normalizedSourceTimezone = validateIanaTimezone(sourceTimezone);
	const normalizedTargetTimezone = validateIanaTimezone(targetTimezone);
	const normalizedTime = String(timeHHMM ?? '').trim();

	const matches = normalizedTime.match(TIME_24H_REGEX);
	if (!matches) {
		throw new Error('Invalid time format. Expected HH:MM [24-hour format]');
	}

	const hour = Number(matches[1]);
	const minute = Number(matches[2]);
	const nowInSourceTimezone = DateTime.now().setZone(normalizedSourceTimezone);
	const sourceTime = DateTime.fromObject(
		{
			year: nowInSourceTimezone.year,
			month: nowInSourceTimezone.month,
			day: nowInSourceTimezone.day,
			hour,
			minute,
			second: 0,
			millisecond: 0,
		},
		{
			zone: normalizedSourceTimezone,
		}
	);

	if (!sourceTime.isValid) {
		throw new Error('Invalid time format. Expected HH:MM [24-hour format]');
	}

	const targetTime = sourceTime.setZone(normalizedTargetTimezone);
	if (!targetTime.isValid) {
		throw new Error(`Invalid timezone: ${normalizedTargetTimezone}`);
	}

	const hoursDifference = (targetTime.offset - sourceTime.offset) / 60;

	return {
		source: toTimeResult(normalizedSourceTimezone, sourceTime),
		target: toTimeResult(normalizedTargetTimezone, targetTime),
		time_difference: formatHourDiff(hoursDifference),
	};
}

export function buildTimeRangeResult(
	naturalLanguageInput: string,
	timezone?: string,
	defaultTimezone?: string
): TimeRangeResult {
	const normalizedInput = String(naturalLanguageInput ?? '').trim();
	if (!normalizedInput) {
		throw new Error('自然语言时间表达不能为空');
	}

	const effectiveTimezone = timezone ?? defaultTimezone;
	if (!effectiveTimezone) {
		throw new Error('缺少可用的时区配置');
	}

	const normalizedTimezone = validateIanaTimezone(effectiveTimezone);
	const now = DateTime.now().setZone(normalizedTimezone);
	if (!now.isValid) {
		throw new Error(`Invalid timezone: ${normalizedTimezone}`);
	}

	const { spaced, compact } = normalizeNaturalTimeInput(normalizedInput);
	const exactRanges: Record<string, () => TimeRangeResult> = {
		today: () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.startOf('day'),
				now.endOf('day'),
				'today'
			),
		今天: () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.startOf('day'),
				now.endOf('day'),
				'today'
			),
		yesterday: () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.minus({ days: 1 }).startOf('day'),
				now.minus({ days: 1 }).endOf('day'),
				'yesterday'
			),
		昨天: () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.minus({ days: 1 }).startOf('day'),
				now.minus({ days: 1 }).endOf('day'),
				'yesterday'
			),
		'this week': () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.startOf('week'),
				now.endOf('week'),
				'this_week'
			),
		本周: () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.startOf('week'),
				now.endOf('week'),
				'this_week'
			),
		'last week': () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.minus({ weeks: 1 }).startOf('week'),
				now.minus({ weeks: 1 }).endOf('week'),
				'last_week'
			),
		上周: () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.minus({ weeks: 1 }).startOf('week'),
				now.minus({ weeks: 1 }).endOf('week'),
				'last_week'
			),
		'this month': () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.startOf('month'),
				now.endOf('month'),
				'this_month'
			),
		本月: () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.startOf('month'),
				now.endOf('month'),
				'this_month'
			),
		'last month': () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.minus({ months: 1 }).startOf('month'),
				now.minus({ months: 1 }).endOf('month'),
				'last_month'
			),
		上个月: () =>
			createTimeRangeResult(
				normalizedTimezone,
				now.minus({ months: 1 }).startOf('month'),
				now.minus({ months: 1 }).endOf('month'),
				'last_month'
			),
	};

	const exactMatch = exactRanges[spaced] ?? exactRanges[compact];
	if (exactMatch) {
		return exactMatch();
	}

	const englishDynamicMatch = spaced.match(
		/^(past|last|recent)\s+(\d+)\s+(day|days|week|weeks)$/
	);
	if (englishDynamicMatch) {
		const keyword = englishDynamicMatch[1];
		const count = parsePositiveCount(englishDynamicMatch[2]);
		if (!count) {
			throw new Error(`无法识别时间范围中的数量: ${englishDynamicMatch[2]}`);
		}
		if (englishDynamicMatch[3].startsWith('day')) {
			const end =
				keyword === 'last'
					? now.minus({ days: 1 }).endOf('day')
					: now.endOf('day');
			const start =
				keyword === 'last'
					? now.minus({ days: count }).startOf('day')
					: now.minus({ days: count - 1 }).startOf('day');
			return createTimeRangeResult(
				normalizedTimezone,
				start,
				end,
				`${keyword}_${count}_days`
			);
		}
		const end =
			keyword === 'last'
				? now.minus({ weeks: 1 }).endOf('week')
				: now.endOf('week');
		const start =
			keyword === 'last'
				? now.minus({ weeks: count }).startOf('week')
				: now.minus({ weeks: count - 1 }).startOf('week');
		return createTimeRangeResult(
			normalizedTimezone,
			start,
			end,
			`${keyword}_${count}_weeks`
		);
	}

	const chineseDynamicMatch = compact.match(
		/^(过去|最近)([零〇一二两三四五六七八九十\d]+)(天|周)$/
	);
	if (chineseDynamicMatch) {
		const count = parsePositiveCount(chineseDynamicMatch[2]);
		if (!count) {
			throw new Error(`无法识别时间范围中的数量: ${chineseDynamicMatch[2]}`);
		}
		if (chineseDynamicMatch[3] === '天') {
			return createTimeRangeResult(
				normalizedTimezone,
				now.minus({ days: count - 1 }).startOf('day'),
				now.endOf('day'),
				`past_${count}_days`
			);
		}
		return createTimeRangeResult(
			normalizedTimezone,
			now.minus({ weeks: count - 1 }).startOf('week'),
			now.endOf('week'),
			`past_${count}_weeks`
		);
	}

	throw new Error(
		`无法识别自然语言时间表达: ${naturalLanguageInput}。支持示例：今天、昨天、本周、上周、本月、上个月、过去三天、最近7天、last week、this month、past 3 days`
	);
}
