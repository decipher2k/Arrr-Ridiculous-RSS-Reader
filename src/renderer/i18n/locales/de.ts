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

export default {
  // App / Toolbar
  'app.categorySelected': 'Kategorie ausgewählt',
  'app.noCategorySelected': 'Keine Kategorie ausgewählt',
  'app.showDuplicates': 'Duplikate anzeigen',
  'app.hideDuplicates': 'Duplikate ausblenden',
  'app.deduplicate': 'Deduplizieren',
  'app.none': '<Keine>',

  // CategoryBar
  'categoryBar.addCategory': 'Kategorie',
  'categoryBar.categoryNamePlaceholder': 'Name...',
  'categoryBar.add': 'Hinzufügen',
  'categoryBar.rename': 'Umbenennen',
  'categoryBar.delete': 'Löschen',
  'categoryBar.moveLeft': 'Nach links',
  'categoryBar.moveRight': 'Nach rechts',
  'categoryBar.confirmDeleteCategory': 'Kategorie wirklich löschen?',
  'categoryBar.fetchFeeds': 'Abrufen',
  'categoryBar.manageFeeds': 'Verwalten',
  'categoryBar.settings': 'Einstellungen',

  // ArticleList
  'articleList.news': 'News',
  'articleList.loading': 'Laden...',
  'articleList.noArticles': 'Keine Artikel vorhanden.',
  'articleList.noDescription': 'Keine Beschreibung verfügbar.',

  // ArticleView
  'articleView.articleView': 'Artikelansicht',
  'articleView.openOriginal': 'Original öffnen',
  'articleView.loading': 'Artikel wird geladen...',
  'articleView.selectArticle': 'Wähle einen Artikel aus der Liste.',
  'articleView.contentError': 'Artikelinhalt konnte nicht geladen werden.',
  'articleView.openInBrowser': 'Im Browser öffnen',
  'articleView.original': 'Original',
  'articleView.translated': 'Übersetzt',
  'articleView.translationSummary': 'KI-Übersetzung / Zusammenfassung',
  'articleView.words': 'Wörter',
  'articleView.translating': 'Artikel wird übersetzt und zusammengefasst...',
  'articleView.translationError': 'Übersetzung fehlgeschlagen',
  'articleView.retry': 'Erneut versuchen',

  // SettingsModal
  'settings.title': 'Einstellungen',
  'settings.aiProvider': 'KI-Anbieter',
  'settings.providerOpenAi': 'OpenAI-kompatibel (extern)',
  'settings.providerLocal': 'Lokales Modell (llama.cpp)',
  'settings.apiBaseUrl': 'API Base URL',
  'settings.apiKey': 'API Key',
  'settings.apiKeyHint': 'Der Key wird verschlüsselt lokal gespeichert und nie an den Renderer gesendet.',
  'settings.model': 'Modell',
  'settings.temperature': 'Temperatur',
  'settings.enableDeduplication': 'KI-Deduplizierung aktivieren',
  'settings.enableTranslation': 'KI-Übersetzung & Zusammenfassung aktivieren',
  'settings.enableAutoFetch': 'Automatischen Feed-Abruf aktivieren',
  'settings.fetchInterval': 'Abruf-Intervall (Minuten)',
  'settings.uiLanguage': 'Sprache der Benutzeroberfläche',
  'settings.testConnection': 'Verbindung testen',
  'settings.save': 'Speichern',
  'settings.connectionSuccess': 'Verbindung erfolgreich.',
  'settings.connectionFailed': 'Verbindung fehlgeschlagen:',
  'settings.localModel': 'Lokales Modell',
  'settings.localModelReady': 'Modell ist bereit.',
  'settings.localModelNotDownloaded': 'Modell noch nicht heruntergeladen.',
  'settings.downloadModel': 'Modell herunterladen',
  'settings.downloadWarning': 'Das Modell "ministral-3:3b" (Q4_K_M, ~1,9 GB) wird heruntergeladen. Es benötigt ca. 4–5 GB VRAM. Der Download kann je nach Verbindung mehrere Minuten dauern.',
  'settings.downloadConfirm': 'Herunterladen',
  'settings.downloading': 'Modell wird heruntergeladen...',
  'settings.downloadSpeed': 'Geschwindigkeit',
  'settings.downloadCancel': 'Abbrechen',
  'settings.localPort': 'Server-Port',
  'settings.localContextSize': 'Kontextgröße',
  'settings.localGpuLayers': 'GPU-Layer',
  'settings.localCpuFallback': 'CPU-Fallback erlauben (langsam)',
  'settings.localTestConnection': 'Lokale Verbindung testen',
  'settings.downloadError': 'Download fehlgeschlagen',

  // ManageFeedsModal
  'manageFeeds.title': 'Feeds & Kategorien verwalten',
  'manageFeeds.addNewFeed': 'Neuen Feed hinzufügen',
  'manageFeeds.titlePlaceholder': 'Titel',
  'manageFeeds.urlPlaceholder': 'RSS/Atom URL',
  'manageFeeds.add': 'Hinzufügen',
  'manageFeeds.existingFeeds': 'Vorhandene Feeds',
  'manageFeeds.noFeeds': 'Keine Feeds vorhanden.',
  'manageFeeds.loading': 'Laden...',
  'manageFeeds.categories': 'Kategorien:',
  'manageFeeds.noCategories': 'Keine',
  'manageFeeds.fetchFeed': 'Feed abrufen',
  'manageFeeds.edit': 'Bearbeiten',
  'manageFeeds.save': 'Speichern',
  'manageFeeds.cancel': 'Abbrechen',
  'manageFeeds.delete': 'Löschen',
  'manageFeeds.confirmDeleteFeed': 'Feed wirklich löschen?',
  'manageFeeds.contentMode': 'Detailansicht',
  'manageFeeds.contentModeFeed': 'Feed-Inhalt',
  'manageFeeds.contentModeScraped': 'Verlinkte News',

  // Common
  'common.error': 'Fehler',
  'common.success': 'Erfolg',
  'common.cancel': 'Abbrechen',
  'common.save': 'Speichern',
  'common.delete': 'Löschen',
  'common.edit': 'Bearbeiten',
  'common.add': 'Hinzufügen',
  'common.loading': 'Laden...',
  'common.close': 'Schließen',
};
