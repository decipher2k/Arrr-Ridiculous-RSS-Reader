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

import { EventEmitter } from 'events';
import fs from 'fs';

export interface DownloadProgressInfo {
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: string;
}

export class ModelDownloader extends EventEmitter {
  private abortController: AbortController | null = null;
  private isRunning = false;

  get running(): boolean {
    return this.isRunning;
  }

  async start(url: string, destPath: string): Promise<void> {
    if (fs.existsSync(destPath)) {
      this.emit('complete');
      return;
    }

    const destDir = require('path').dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const tmpPath = destPath + '.tmp';
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }

    this.abortController = new AbortController();
    this.isRunning = true;

    try {
      const response = await fetch(url, {
        signal: this.abortController.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'RSSReader-App/1.0',
          'Accept': '*/*',
        },
      });

      if (!response.ok) {
        let body = '';
        try {
          body = await response.text();
        } catch { /* ignore */ }
        throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}. ${body.slice(0, 200)}`);
      }

      if (!response.body) {
        throw new Error('Download failed: response body is empty');
      }

      const total = parseInt(response.headers.get('content-length') || '0');
      const fileStream = fs.createWriteStream(tmpPath);
      const reader = response.body.getReader();

      let bytesDownloaded = 0;
      let lastReported = 0;
      let lastTime = Date.now();
      let speedSamples: number[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!this.isRunning) {
          reader.releaseLock();
          fileStream.close();
          throw new Error('Download cancelled by user');
        }

        fileStream.write(Buffer.from(value));
        bytesDownloaded += value.length;

        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt > 0.5 || bytesDownloaded === total) {
          const chunkSize = bytesDownloaded - lastReported;
          const speed = chunkSize / dt;
          speedSamples.push(speed);
          if (speedSamples.length > 10) speedSamples.shift();
          const avgSpeed = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;

          const progress: DownloadProgressInfo = {
            percent: total > 0 ? Math.round((bytesDownloaded / total) * 100) : 0,
            bytesDownloaded,
            totalBytes: total,
            speed: this.formatSpeed(avgSpeed),
          };

          this.emit('progress', progress);
          lastReported = bytesDownloaded;
          lastTime = now;
        }
      }

      fileStream.end();
      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });

      fs.renameSync(tmpPath, destPath);
      this.emit('complete');
    } catch (err) {
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
      throw err;
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond > 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bytesPerSecond > 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    }
    return `${Math.round(bytesPerSecond)} B/s`;
  }
}
