process.env.NODE_ENV = 'test-unit-manual';

import {
  assertSafeTestDatabaseUrl,
  configureTestEnvironment,
  APPROVED_TEST_DATABASE_NAME,
  APPROVED_LOOPBACK_HOSTS,
} from './setup-test-db';
import * as fs from 'fs';
import * as path from 'path';

describe('Test Database Isolation Guard (setup-test-db.ts)', () => {
  describe('assertSafeTestDatabaseUrl() - Strict URL & Host Allowlist', () => {
    // 1. Missing or empty URLs
    it('should throw immediately when database URL is undefined or null', () => {
      expect(() => assertSafeTestDatabaseUrl(undefined)).toThrow(
        /Database URL is missing or empty/
      );
      expect(() => assertSafeTestDatabaseUrl(null)).toThrow(
        /Database URL is missing or empty/
      );
    });

    it('should throw immediately when database URL is an empty or whitespace string', () => {
      expect(() => assertSafeTestDatabaseUrl('')).toThrow(
        /Database URL is missing or empty/
      );
      expect(() => assertSafeTestDatabaseUrl('   ')).toThrow(
        /Database URL is missing or empty/
      );
    });

    // 2. Malformed URLs
    it('should throw on completely malformed or unparseable URLs', () => {
      expect(() => assertSafeTestDatabaseUrl('not-a-valid-url')).toThrow(
        /Malformed database URL/
      );
      expect(() => assertSafeTestDatabaseUrl('postgresql://')).toThrow(
        /Malformed database URL/
      );
    });

    // 3. Protocol Enforcement
    it('should reject non-PostgreSQL protocols', () => {
      expect(() =>
        assertSafeTestDatabaseUrl('http://localhost:5432/cmd_office_test')
      ).toThrow(/Invalid protocol "http:"/);
      expect(() =>
        assertSafeTestDatabaseUrl('mysql://localhost:3306/cmd_office_test')
      ).toThrow(/Invalid protocol "mysql:"/);
      expect(() =>
        assertSafeTestDatabaseUrl('mongodb://localhost:27017/cmd_office_test')
      ).toThrow(/Invalid protocol "mongodb:"/);
    });

    // 4. Remote & Non-Loopback Hosts (Fail Closed)
    it('should strictly reject remote hostnames and domain names', () => {
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@db.hartek.com:5432/cmd_office_test')
      ).toThrow(/Unsafe database host "db.hartek.com"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@production-db.internal:5432/cmd_office_test')
      ).toThrow(/Unsafe database host "production-db.internal"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@postgres.railway.internal:5432/cmd_office_test')
      ).toThrow(/Unsafe database host "postgres.railway.internal"/);
    });

    it('should strictly reject non-loopback IP addresses (private, public, cloud)', () => {
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@192.168.1.100:5432/cmd_office_test')
      ).toThrow(/Unsafe database host "192.168.1.100"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@10.0.0.5:5432/cmd_office_test')
      ).toThrow(/Unsafe database host "10.0.0.5"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@172.20.0.2:5432/cmd_office_test')
      ).toThrow(/Unsafe database host "172.20.0.2"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@54.210.12.34:5432/cmd_office_test')
      ).toThrow(/Unsafe database host "54.210.12.34"/);
    });

    // 5. Production Database Names on Loopback (Fail Closed)
    it('should strictly reject production database names even on loopback host', () => {
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432/cmd_office_prod?schema=public')
      ).toThrow(/Unauthorized database target "cmd_office_prod"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/cmd_office_prod')
      ).toThrow(/Unauthorized database target "cmd_office_prod"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432/production')
      ).toThrow(/Unauthorized database target "production"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432/hartek_live')
      ).toThrow(/Unauthorized database target "hartek_live"/);
    });

    // 6. Unexpected / Non-Test Database Names on Loopback (Fail Closed)
    it('should strictly reject development or default database names', () => {
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432/cmd_office?schema=public')
      ).toThrow(/Unauthorized database target "cmd_office"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432/postgres')
      ).toThrow(/Unauthorized database target "postgres"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432/test')
      ).toThrow(/Unauthorized database target "test"/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432/cmd_office_testing')
      ).toThrow(/Unauthorized database target "cmd_office_testing"/);
    });

    it('should reject URLs with empty database paths', () => {
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432/')
      ).toThrow(/Database name is missing from URL path/);
      expect(() =>
        assertSafeTestDatabaseUrl('postgresql://user:pass@localhost:5432')
      ).toThrow(/Database name is missing from URL path/);
    });

    // 7. Approved Local Test Database (Pass Cases)
    it('should accept valid localhost URL pointing to approved test database', () => {
      const parsed = assertSafeTestDatabaseUrl(
        'postgresql://postgres:root123@localhost:5432/cmd_office_test?schema=public'
      );
      expect(parsed.hostname).toBe('localhost');
      expect(parsed.pathname).toBe('/cmd_office_test');
    });

    it('should accept valid 127.0.0.1 loopback IP pointing to approved test database', () => {
      const parsed = assertSafeTestDatabaseUrl(
        'postgresql://postgres:root123@127.0.0.1:5432/cmd_office_test'
      );
      expect(parsed.hostname).toBe('127.0.0.1');
      expect(parsed.pathname).toBe('/cmd_office_test');
    });

    it('should accept "postgres:" scheme with query parameters', () => {
      const parsed = assertSafeTestDatabaseUrl(
        'postgres://custom_test_user:pass@localhost:5432/cmd_office_test?sslmode=disable'
      );
      expect(parsed.protocol).toBe('postgres:');
      expect(parsed.hostname).toBe('localhost');
      expect(parsed.pathname).toBe('/cmd_office_test');
    });
  });

  describe('configureTestEnvironment() - Safe Derivation & Fail-Closed Logic', () => {
    const tempEnvPath = path.resolve(__dirname, 'temp-test-env.txt');

    afterEach(() => {
      if (fs.existsSync(tempEnvPath)) {
        fs.unlinkSync(tempEnvPath);
      }
    });

    it('should safely derive cmd_office_test from local development cmd_office on loopback', () => {
      fs.writeFileSync(
        tempEnvPath,
        'DATABASE_URL="postgresql://postgres:root123@localhost:5432/cmd_office?schema=public"\n'
      );

      const target = configureTestEnvironment({ envPath: tempEnvPath });
      expect(target).toContain('/cmd_office_test');
      expect(target).toContain('localhost');
      expect(process.env.DATABASE_URL).toBe(target);
    });

    it('should fail closed if .env contains a remote host database URL', () => {
      fs.writeFileSync(
        tempEnvPath,
        'DATABASE_URL="postgresql://prod_user:secret@192.168.1.50:5432/cmd_office?schema=public"\n'
      );

      expect(() => configureTestEnvironment({ envPath: tempEnvPath })).toThrow(
        /Cannot safely derive test database from environment: host "192.168.1.50"/
      );
    });

    it('should fail closed if .env contains a production database name', () => {
      fs.writeFileSync(
        tempEnvPath,
        'DATABASE_URL="postgresql://postgres:root123@localhost:5432/cmd_office_prod?schema=public"\n'
      );

      expect(() => configureTestEnvironment({ envPath: tempEnvPath })).toThrow(
        /Cannot safely derive test database from environment: host "localhost" and db "cmd_office_prod"/
      );
    });

    it('should use explicitUrl if valid test database', () => {
      const valid = 'postgresql://postgres:secret@127.0.0.1:5432/cmd_office_test?schema=public';
      const target = configureTestEnvironment({ explicitUrl: valid });
      expect(target).toBe(valid);
    });

    it('should throw immediately if explicitUrl is invalid or production', () => {
      const invalid = 'postgresql://postgres:secret@localhost:5432/cmd_office_prod';
      expect(() => configureTestEnvironment({ explicitUrl: invalid })).toThrow(
        /Unauthorized database target "cmd_office_prod"/
      );
    });
  });
});
