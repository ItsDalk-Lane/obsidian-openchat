import type { Local } from './local';
import { zhTwPart1 } from './fragments/zhTw/part1';
import { zhTwPart2 } from './fragments/zhTw/part2';
import { zhTwPart3 } from './fragments/zhTw/part3';
import { zhTwPart4 } from './fragments/zhTw/part4';

export const zhTw: Local = {
	...zhTwPart1,
	...zhTwPart2,
	...zhTwPart3,
	...zhTwPart4,
};

export default zhTw;
