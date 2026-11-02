import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface BackendVersionManifest {
  status: 'ok';
  commit: string;
  builtAt?: string;
  version?: string;
}

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getVersion(): BackendVersionManifest {
    // Determine runtime path to version.json across environments:
    // 1. Compiled production: __dirname is <backend>/dist/src -> path.resolve(__dirname, '..', 'version.json') is <backend>/dist/version.json
    // 2. PM2 execution: cwd is <backend> -> path.resolve(process.cwd(), 'dist', 'version.json') is <backend>/dist/version.json
    // 3. Fallback: <backend>/version.json
    const candidatePaths = [
      path.resolve(__dirname, '..', 'version.json'),
      path.resolve(process.cwd(), 'dist', 'version.json'),
      path.resolve(process.cwd(), 'version.json'),
    ];

    let manifestPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        manifestPath = p;
        break;
      }
    }

    if (!manifestPath) {
      throw new ServiceUnavailableException({
        status: 'error',
        message: 'Release identity manifest missing or unreadable',
        commit: 'unknown',
      });
    }

    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') {
        throw new Error('Manifest is not an object');
      }

      const commit = typeof data.commit === 'string' ? data.commit.trim() : '';
      if (!commit || commit.toLowerCase() === 'unknown') {
        throw new Error('Manifest commit is missing, empty, or unknown');
      }

      return {
        status: 'ok',
        commit,
        builtAt: typeof data.builtAt === 'string' ? data.builtAt : undefined,
        version: typeof data.version === 'string' ? data.version : undefined,
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        message: 'Release identity manifest is malformed or invalid',
        commit: 'unknown',
      });
    }
  }
}
