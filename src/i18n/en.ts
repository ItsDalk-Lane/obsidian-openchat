import type { Local } from './local';
import { enPart1 } from './fragments/en/part1';
import { enPart2 } from './fragments/en/part2';
import { enPart3 } from './fragments/en/part3';
import { enPart4 } from './fragments/en/part4';

export const en: Local = {
	...enPart1,
	...enPart2,
	...enPart3,
	...enPart4,
};

export default en;
