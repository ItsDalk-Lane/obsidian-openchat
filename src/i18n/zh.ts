import type { Local } from './local';
import { zhPart1 } from './fragments/zh/part1';
import { zhPart2 } from './fragments/zh/part2';
import { zhPart3 } from './fragments/zh/part3';
import { zhPart4 } from './fragments/zh/part4';

export const zh: Local = {
	...zhPart1,
	...zhPart2,
	...zhPart3,
	...zhPart4,
};

export default zh;
