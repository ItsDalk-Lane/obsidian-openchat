/** 内置的可用界面语言。 */
export type Locale = "en" | "zh-CN";

/** 翻译字符串使用的简单插值参数。 */
export type TranslationParams = Record<string, string | number>;

/** 可注册的语言包定义。 */
export interface LocalePlugin {
  id: string;
  label: string;
  messages: Record<string, string>;
}
