"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getLocalePlugin,
  getSupportedLocales,
  resolveBrowserLocale,
} from "@/lib/i18n/registry";
import { translateMessage } from "@/lib/i18n/format";
import type {
  Locale,
  LocalePlugin,
  TranslationParams,
} from "@/lib/i18n/types";

const LOCALE_STORAGE_KEY = "pi-locale";
const DEFAULT_LOCALE: Locale = "en";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
  supportedLocales: LocalePlugin[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getMessages(): Record<string, Record<string, string>> {
  return Object.fromEntries(
    getSupportedLocales().flatMap((id) => {
      const plugin = getLocalePlugin(id);
      return plugin ? [[id, plugin.messages]] : [];
    }),
  );
}

function readInitialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch {
    // 隐私模式或存储不可用时继续使用浏览器语言。
  }
  const languages = window.navigator.languages.length
    ? window.navigator.languages
    : [window.navigator.language];
  return resolveBrowserLocale(languages);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);
  const supportedLocales = useMemo(
    () =>
      getSupportedLocales()
        .map((id) => getLocalePlugin(id))
        .filter((plugin): plugin is LocalePlugin => Boolean(plugin)),
    [],
  );
  const messages = useMemo(() => getMessages(), []);

  useEffect(() => {
    const next = readInitialLocale();
    setLocaleState(next);
    document.documentElement.lang = next;
    setHydrated(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (!getLocalePlugin(next)) return;
    setLocaleState(next);
    document.documentElement.lang = next;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // 存储失败不影响当前页面内切换。
    }
  }, []);

  const t = useCallback(
    (key: string, params?: TranslationParams) =>
      translateMessage(locale, key, messages, params),
    [locale, messages],
  );
  const value = useMemo(
    () => ({
      locale: hydrated ? locale : DEFAULT_LOCALE,
      setLocale,
      t,
      supportedLocales,
    }),
    [hydrated, locale, setLocale, supportedLocales, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
