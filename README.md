# 🏴‍☠️ Arrr – Advanced Robot RSS Reader

**Cross-platform desktop RSS reader with AI-powered deduplication, translation, and summarization.**

Built with Electron, React, TypeScript, and SQLite. Runs on **Windows**, **macOS**, and **Linux**.

---

## ✨ Features

- **News-like UI** – Three-panel newspaper layout with image-rich article cards, not a plain list
- **AI Deduplication** – Semantic duplicate detection across feeds using local or remote LLMs
- **AI Translation & Summarization** – Translate and summarize articles into 9 languages (DE, EN, FR, ES, IT, HI, ZH, RU, JA)
- **Local AI, Zero Dependencies** – Bundled llama.cpp + Ministral-3B model. No Ollama, no Docker, no setup required
- **OpenAI-Compatible API** – Use any OpenAI-compatible endpoint (OpenAI, Azure, LiteLLM, etc.)
- **Article Scraping** – Extract full article content from source pages, not just RSS snippets
- **Offline-First** – All data stored locally in SQLite. API keys encrypted at OS level via Electron safeStorage
- **9 UI Languages** – English, Deutsch, Français, Español, Italiano, हिन्दी, 中文, Русский, 日本語
- **Auto-Fetch** – Configurable background feed refresh
- **Category Management** – Organize feeds into categories with drag-free reordering

## 📸 Screenshots

<p align="center">
  <em>Three-panel layout: Categories (top) → Article cards (left) → Full article view (right)</em>
</p>

## 🚀 Quick Start

### Download (Recommended)

Download the latest release for your platform from the [Releases](https://github.com/example/rss-reader-electron/releases) page:

| Platform | Format |
|----------|--------|
| Windows | `.exe` (NSIS Installer) |
| macOS | `.dmg` |
| Linux | `.AppImage` / `.deb` |

### Build from Source

```bash
# Prerequisites: Node.js ≥18, npm ≥9
git clone https://github.com/example/rss-reader-electron.git
cd rss-reader-electron
npm install
npm run build
npm run electron
```

### Development

```bash
npm run dev            # Vite dev server (renderer)
npm run electron:dev   # Build main process + launch Electron
```

### Package

```bash
npm run dist           # All platforms
npm run dist:win       # Windows only
npm run dist:mac       # macOS only
npm run dist:linux     # Linux only
```

## ⚙️ Configuration

### AI Provider: OpenAI-Compatible (External)

| Setting | Default | Description |
|---------|---------|-------------|
| API Base URL | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| API Key | – | Encrypted via OS keychain |
| Model | `gpt-4o-mini` | Any chat model available at your endpoint |
| Temperature | `0.2` | Low for factual tasks |

### AI Provider: Local Model (llama.cpp)

| Setting | Default | Description |
|---------|---------|-------------|
| Model | Ministral-3-3B-Instruct (Q4_K_M) | ~1.9 GB download from HuggingFace |
| VRAM Required | ~4-5 GB | CUDA GPU recommended |
| Port | `8080` | llama-server port |
| Context Size | `8192` | Context window |
| GPU Layers | `99` | Layers offloaded to GPU |
| CPU Fallback | Off | Slow, but works without GPU |

## 🧠 AI Features in Detail

### Deduplication

When enabled, Arrr sends article titles within a category to the AI, which groups semantically identical stories (e.g., the same news reported by multiple outlets). Duplicates are hidden by default but can be shown via toggle.

### Translation & Summarization

- Translates the full article HTML, title, and description into your target language
- Summarizes to approximately 500 words for quick reading
- Toggle between **Original** and **Translated** views with one click
- Results are **cached** – no repeated API calls for already translated articles
- Batch translation: process all articles in a category sequentially with progress feedback

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│              Electron Main Process              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ main.ts  │  │ ipc.ts   │  │ preload.ts   │  │
│  │ (window) │  │ (router) │  │ (bridge)     │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│  ┌──────────────────────────────────────────┐   │
│  │           AI Provider Layer              │   │
│  │  aiProviderFactory                       │   │
│  │  ├── OpenAIProvider (HTTP fetch)         │   │
│  │  └── LocalLlamaProvider (child process)  │   │
│  │  deduplicateTitles / translateArticle    │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │           Data Layer                     │   │
│  │  SQLite (6 tables) + JSON settings        │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │           Feed Layer                     │   │
│  │  rss-parser / cheerio scraping           │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
                       │ IPC
                       ▼
┌─────────────────────────────────────────────────┐
│             Electron Renderer Process           │
│  Zustand Store → React Components               │
│  CategoryBar → ArticleList → ArticleView         │
│  SettingsModal / ManageFeedsModal               │
│  i18n (9 languages)                             │
└─────────────────────────────────────────────────┘
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 33 |
| UI | React 18, TypeScript 5 |
| Build | Vite 5 |
| CSS | Tailwind CSS 3 |
| State | Zustand 5 |
| Database | SQLite (sqlite3) |
| RSS Parsing | rss-parser |
| Content Scraping | Cheerio |
| XSS Protection | DOMPurify |
| Local AI Runtime | llama.cpp (bundled) |
| Packaging | electron-builder |

## 📁 Project Structure

```
src/
├── main/              # Electron main process
│   ├── main.ts        # App entry, window, auto-fetch
│   ├── preload.ts     # Context bridge
│   ├── ipc.ts         # IPC handlers
│   ├── db/            # SQLite database layer
│   ├── ai/            # AI providers & features
│   ├── feeds/         # RSS parsing, image extraction
│   ├── articles/      # Content scraping & extraction
│   └── settings/      # Encrypted settings store
├── renderer/          # React frontend
│   ├── App.tsx        # Root layout
│   ├── components/    # UI components
│   ├── state/         # Zustand store
│   └── i18n/          # Internationalization
├── shared/            # Types, constants, validation
└── resources/
    └── llama.cpp/     # Bundled llama.cpp binaries
```

## 🔒 Privacy & Security

- **All data stays local** – Articles, feeds, settings are stored in SQLite and JSON files on your machine
- **API keys encrypted** – Stored using Electron's `safeStorage` (OS-level encryption: Keychain on macOS, DPAPI on Windows, libsecret on Linux)
- **No telemetry** – The app never phones home
- **Local AI option** – Run entirely offline with the bundled llama.cpp model

## 📄 License

Apache License 2.0 – See [LICENSE.md](LICENSE.md)

