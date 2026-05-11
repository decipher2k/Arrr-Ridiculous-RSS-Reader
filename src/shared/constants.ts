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

export const SUPPORTED_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Französisch' },
  { code: 'es', name: 'Spanisch' },
  { code: 'en', name: 'Englisch' },
  { code: 'it', name: 'Italienisch' },
  { code: 'hi', name: 'Hindi' },
  { code: 'zh', name: 'Chinesisch' },
  { code: 'ru', name: 'Russisch' },
  { code: 'ja', name: 'Japanisch' },
];

export type SupportedLanguage = 'de' | 'fr' | 'es' | 'en' | 'it' | 'hi' | 'zh' | 'ru' | 'ja';
