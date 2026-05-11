// Copyright 2026 Dennis Michael Heine
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { createContext, useContext, useState, useCallback } from 'react';

export type UiLanguage = 'en' | 'de' | 'es' | 'fr' | 'it' | 'hi' | 'ru' | 'zh' | 'ja';

export const UI_LANGUAGES: Array<{ code: UiLanguage; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
];

const translations: Record<UiLanguage, Record<string, string>> = {} as any;

export function registerLocale(lang: UiLanguage, data: Record<string, string>) {
  translations[lang] = data;
}

export function t(key: string, lang?: UiLanguage): string {
  const currentLang = lang || i18nContext.currentLang || 'en';
  const locale = translations[currentLang];
  if (locale && locale[key]) {
    return locale[key];
  }
  // Fallback to English
  const enLocale = translations['en'];
  if (enLocale && enLocale[key]) {
    return enLocale[key];
  }
  return key;
}

// Simple module-level state for non-React usage
export const i18nContext = {
  currentLang: 'en' as UiLanguage,
  setLang: (lang: UiLanguage) => {
    i18nContext.currentLang = lang;
  },
};

interface I18nContextType {
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
  t: (key: string) => string;
}

const Context = createContext<I18nContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key: string) => key,
});

export const I18nProvider: React.FC<{ children: React.ReactNode; initialLang?: UiLanguage }> = ({
  children,
  initialLang = 'en',
}) => {
  const [lang, setLangState] = useState<UiLanguage>(initialLang);

  const setLang = useCallback((newLang: UiLanguage) => {
    setLangState(newLang);
    i18nContext.currentLang = newLang;
  }, []);

  const translate = useCallback((key: string) => t(key, lang), [lang]);

  return <Context.Provider value={{ lang, setLang, t: translate }}>{children}</Context.Provider>;
};

export function useI18n() {
  return useContext(Context);
}
