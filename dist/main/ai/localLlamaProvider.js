"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalLlamaProvider = void 0;
exports.getDefaultModelPath = getDefaultModelPath;
exports.getModelDownloadUrl = getModelDownloadUrl;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const electron_1 = require("electron");
const cudaCheck_1 = require("./cudaCheck");
const MODEL_DOWNLOAD_URL = 'https://huggingface.co/lmstudio-community/Ministral-3-3B-Instruct-2512-GGUF/resolve/main/Ministral-3-3B-Instruct-2512-Q4_K_M.gguf';
const MODEL_FILE_NAME = 'Ministral-3-3B-Instruct-2512-Q4_K_M.gguf';
const MIN_MODEL_SIZE_BYTES = 1_000_000_000; // ~1 GB minimum
const STARTUP_TIMEOUT_MS = 120_000; // 120s for first GPU init
const CHAT_COMPLETION_TIMEOUT_MS = 180_000;
function getModelDir() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'models');
}
function getDefaultModelPath() {
    return path_1.default.join(getModelDir(), MODEL_FILE_NAME);
}
function getModelDownloadUrl() {
    return MODEL_DOWNLOAD_URL;
}
function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net_1.default.createServer();
        server.once('error', () => resolve(true));
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port, '127.0.0.1');
    });
}
class LocalLlamaProvider {
    settings;
    name = 'LocalLLM (llama.cpp)';
    process = null;
    isReady = false;
    readyPromise = null;
    gpuLayersOffloaded = 0;
    totalLayers = 0;
    startupLog = '';
    constructor(settings) {
        this.settings = settings;
    }
    get isGpuAccelerated() {
        return this.gpuLayersOffloaded > 0 && this.gpuLayersOffloaded >= this.totalLayers && this.totalLayers > 0;
    }
    getGpuStatus() {
        return {
            offloaded: this.gpuLayersOffloaded,
            total: this.totalLayers,
            active: this.isGpuAccelerated,
        };
    }
    async init() {
        if (this.readyPromise)
            return this.readyPromise;
        this.readyPromise = this.startServer();
        return this.readyPromise;
    }
    async startServer() {
        const binaryName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
        const binaryPath = this.getResourcePath('llama.cpp', binaryName);
        const modelPath = this.settings.localLlmModelPath || getDefaultModelPath();
        if (!fs_1.default.existsSync(binaryPath)) {
            throw new Error(`llama-server binary not found at ${binaryPath}`);
        }
        if (!fs_1.default.existsSync(modelPath)) {
            throw new Error(`Model file not found at ${modelPath}. Please download the model first.`);
        }
        // Validate model file size
        const stats = fs_1.default.statSync(modelPath);
        if (stats.size < MIN_MODEL_SIZE_BYTES) {
            throw new Error(`Model file appears incomplete or corrupted (${(stats.size / 1024 / 1024).toFixed(1)} MB, expected ~1900 MB). ` +
                `Please delete ${modelPath} and re-download.`);
        }
        console.log(`[LocalLLM] Model file size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
        // Check port availability
        const portInUse = await isPortInUse(this.settings.localLlmPort);
        if (portInUse) {
            throw new Error(`Port ${this.settings.localLlmPort} is already in use. ` +
                `Another instance of llama-server may be running. Please kill it or change the port in settings.`);
        }
        const cudaAvailable = await (0, cudaCheck_1.checkCudaAvailable)();
        if (!cudaAvailable) {
            if (!this.settings.localLlmAllowCpuFallback) {
                throw new Error('No CUDA GPU detected. Local LLM requires GPU acceleration. Enable CPU fallback in settings if you want to proceed anyway (performance will be extremely poor).');
            }
            console.warn('[LocalLLM] WARNING: No CUDA GPU detected. Falling back to CPU inference. Performance will be extremely poor.');
        }
        const args = [
            '-m', modelPath,
            '--host', '127.0.0.1',
            '--port', String(this.settings.localLlmPort),
            '-c', String(this.settings.localLlmContextSize),
            '-ngl', String(cudaAvailable ? this.settings.localLlmGpuLayers : 0),
            '--no-webui',
        ];
        this.startupLog = '';
        console.log(`[LocalLLM] Starting llama-server: ${binaryPath} ${args.join(' ')}`);
        console.log(`[LocalLLM] Timeout: ${STARTUP_TIMEOUT_MS / 1000}s | CUDA available: ${cudaAvailable}`);
        this.process = (0, child_process_1.spawn)(binaryPath, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            cwd: path_1.default.dirname(binaryPath), // Run from binary dir so shared libs are found
        });
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.kill();
                reject(new Error(`llama-server startup timed out after ${STARTUP_TIMEOUT_MS / 1000}s.\n\n` +
                    `Startup log:\n${this.startupLog.slice(-3000)}\n\n` +
                    `Common causes:\n` +
                    `- Model file is corrupted (delete and re-download)\n` +
                    `- llama-server binary does not support CUDA (use CPU fallback or get CUDA build)\n` +
                    `- First GPU initialization is very slow (try increasing timeout)\n` +
                    `- Port ${this.settings.localLlmPort} is blocked by firewall`));
            }, STARTUP_TIMEOUT_MS);
            const checkReady = (text) => {
                this.startupLog += text;
                this.parseLogForGpu(text);
                const readyMarkers = [
                    'HTTP server is listening',
                    'server is listening',
                    'main: server is listening',
                ];
                if (readyMarkers.some((m) => text.includes(m) || this.startupLog.includes(m))) {
                    if (!this.isReady) {
                        clearTimeout(timeout);
                        this.isReady = true;
                        this.validateGpuOrReject(reject);
                        if (this.isReady) {
                            console.log(`[LocalLLM] Server ready. GPU layers: ${this.gpuLayersOffloaded}/${this.totalLayers}`);
                            resolve();
                        }
                    }
                }
            };
            this.process.stdout.on('data', (data) => {
                const text = data.toString();
                console.log(`[llama-server stdout] ${text.trim()}`);
                checkReady(text);
            });
            this.process.stderr.on('data', (data) => {
                const text = data.toString();
                console.error(`[llama-server stderr] ${text.trim()}`);
                checkReady(text);
            });
            this.process.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to start llama-server: ${err.message}`));
            });
            this.process.on('exit', (code) => {
                if (!this.isReady) {
                    clearTimeout(timeout);
                    reject(new Error(`llama-server exited with code ${code}.\n\n` +
                        `Log output:\n${this.startupLog.slice(-3000)}`));
                }
            });
        });
    }
    validateGpuOrReject(reject) {
        if (this.settings.localLlmAllowCpuFallback)
            return;
        if (this.totalLayers > 0 && this.gpuLayersOffloaded < this.totalLayers) {
            this.kill();
            reject(new Error(`GPU acceleration incomplete: only ${this.gpuLayersOffloaded}/${this.totalLayers} layers offloaded to GPU. ` +
                `Please check your CUDA setup or enable CPU fallback in settings.`));
        }
    }
    parseLogForGpu(log) {
        const match = log.match(/offload\s+(\d+)\/(\d+)\s+layers\s+to\s+GPU/i);
        if (match) {
            this.gpuLayersOffloaded = parseInt(match[1], 10);
            this.totalLayers = parseInt(match[2], 10);
            console.log(`[LocalLLM] GPU offload detected: ${this.gpuLayersOffloaded}/${this.totalLayers} layers`);
        }
    }
    getResourcePath(...segments) {
        if (process.env.NODE_ENV === 'development') {
            return path_1.default.join(process.cwd(), 'resources', ...segments);
        }
        return path_1.default.join(process.resourcesPath, ...segments);
    }
    async chatCompletion(messages, maxTokens = 4000) {
        if (!this.isReady)
            await this.init();
        const body = {
            model: 'local-model',
            messages,
            temperature: 0.2,
            max_tokens: maxTokens,
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CHAT_COMPLETION_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(`http://127.0.0.1:${this.settings.localLlmPort}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        }
        catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`Local LLM request timed out after ${CHAT_COMPLETION_TIMEOUT_MS / 1000}s`);
            }
            throw err;
        }
        finally {
            clearTimeout(timeout);
        }
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Local LLM error ${res.status}: ${text}`);
        }
        const data = (await res.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content)
            throw new Error('Empty response from local LLM');
        return content;
    }
    async healthCheck() {
        try {
            await this.chatCompletion([{ role: 'user', content: 'Say ok' }]);
            const gpuStatus = this.isGpuAccelerated ? 'GPU accelerated' : 'CPU only';
            return { ok: true, message: `Local model is running (${gpuStatus}).` };
        }
        catch (err) {
            return { ok: false, message: `Local model check failed: ${err instanceof Error ? err.message : String(err)}` };
        }
    }
    async dispose() {
        this.kill();
    }
    kill() {
        if (this.process && !this.process.killed) {
            console.log('[LocalLLM] Stopping llama-server...');
            this.process.kill('SIGTERM');
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.process.kill('SIGKILL');
                }
            }, 5000);
            this.process = null;
            this.isReady = false;
            this.readyPromise = null;
            this.gpuLayersOffloaded = 0;
            this.totalLayers = 0;
            this.startupLog = '';
        }
    }
}
exports.LocalLlamaProvider = LocalLlamaProvider;
//# sourceMappingURL=localLlamaProvider.js.map