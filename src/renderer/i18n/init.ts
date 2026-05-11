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

import { registerLocale } from '.';
import type { UiLanguage } from '.';

import en from './locales/en';
import de from './locales/de';
import es from './locales/es';
import fr from './locales/fr';
import it from './locales/it';
import hi from './locales/hi';
import ru from './locales/ru';
import zh from './locales/zh';
import ja from './locales/ja';

const locales: Record<UiLanguage, Record<string, string>> = {
  en,
  de,
  es,
  fr,
  it,
  hi,
  ru,
  zh,
  ja,
};

export function initI18n() {
  (Object.keys(locales) as UiLanguage[]).forEach((lang) => {
    registerLocale(lang, locales[lang]);
  });
}
