import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;
  const tempVersionPath = path.resolve(process.cwd(), 'version.json');
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Clean up any test version.json before each test
    if (fs.existsSync(tempVersionPath)) {
      fs.unlinkSync(tempVersionPath);
    }

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  afterEach(() => {
    if (fs.existsSync(tempVersionPath)) {
      fs.unlinkSync(tempVersionPath);
    }
    process.env = { ...originalEnv };
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('GET /api/version (Release Identity)', () => {
    it('should fail closed with 503 ServiceUnavailableException if version manifest is missing', () => {
      expect(() => appController.getVersion()).toThrow(ServiceUnavailableException);
    });

    it('should fail closed with 503 if version manifest contains invalid JSON', () => {
      fs.writeFileSync(tempVersionPath, '{ malformed-json: true ');
      expect(() => appController.getVersion()).toThrow(ServiceUnavailableException);
    });

    it('should fail closed with 503 if version manifest has missing or unknown commit', () => {
      fs.writeFileSync(tempVersionPath, JSON.stringify({ commit: 'unknown', builtAt: 'now' }));
      expect(() => appController.getVersion()).toThrow(ServiceUnavailableException);

      fs.writeFileSync(tempVersionPath, JSON.stringify({ commit: '', version: '1.0.0' }));
      expect(() => appController.getVersion()).toThrow(ServiceUnavailableException);
    });

    it('should return exact release identity and 200 OK when manifest is valid', () => {
      const targetCommit = '3df707a0ab65138c5cdfbf3db25f01828b7a64ef';
      const timestamp = '2026-10-31T05:40:00Z';
      fs.writeFileSync(
        tempVersionPath,
        JSON.stringify({ commit: targetCommit, builtAt: timestamp, version: '0.0.1' }),
      );

      const res = appController.getVersion();
      expect(res.status).toBe('ok');
      expect(res.commit).toBe(targetCommit);
      expect(res.builtAt).toBe(timestamp);
      expect(res.version).toBe('0.0.1');
    });

    it('should strictly never expose sensitive runtime configuration or environment secrets', () => {
      process.env.DATABASE_URL = 'postgresql://admin:super_secret_pw@127.0.0.1:5432/cmd_office';
      process.env.JWT_SECRET = 'super_secret_jwt_key_that_must_never_leak';

      fs.writeFileSync(
        tempVersionPath,
        JSON.stringify({ commit: '3df707a0ab65138c5cdfbf3db25f01828b7a64ef' }),
      );

      const res: any = appController.getVersion();
      const stringified = JSON.stringify(res);
      expect(stringified).not.toContain('super_secret_pw');
      expect(stringified).not.toContain('super_secret_jwt_key');
      expect(res.DATABASE_URL).toBeUndefined();
      expect(res.JWT_SECRET).toBeUndefined();
    });
  });
});
