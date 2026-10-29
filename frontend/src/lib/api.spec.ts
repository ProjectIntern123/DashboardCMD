import test from 'node:test';
import assert from 'node:assert';
import { getApiBaseUrl } from './api';

test('getApiBaseUrl() server-side URL resolution and staging guards', async (t) => {
  const originalEnv = { ...process.env };

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  await t.test('throws error in staging when BACKEND_URL is missing', () => {
    process.env.APP_ENV = 'staging';
    delete process.env.BACKEND_URL;
    delete process.env.NEXT_PUBLIC_API_URL;

    assert.throws(
      () => getApiBaseUrl(),
      /Missing or invalid required BACKEND_URL in staging environment/
    );
  });

  await t.test('throws error in staging when DEPLOY_ENV=staging and BACKEND_URL is empty', () => {
    delete process.env.APP_ENV;
    process.env.DEPLOY_ENV = 'staging';
    process.env.BACKEND_URL = '   ';

    assert.throws(
      () => getApiBaseUrl(),
      /Missing or invalid required BACKEND_URL in staging environment/
    );
  });

  await t.test('throws error in staging when STAGING=true and BACKEND_URL is missing', () => {
    delete process.env.APP_ENV;
    delete process.env.DEPLOY_ENV;
    process.env.STAGING = 'true';
    delete process.env.BACKEND_URL;

    assert.throws(
      () => getApiBaseUrl(),
      /Missing or invalid required BACKEND_URL in staging environment/
    );
  });

  await t.test('returns normalized API URL when BACKEND_URL has no /api and no trailing slash', () => {
    process.env.APP_ENV = 'staging';
    process.env.BACKEND_URL = 'http://127.0.0.1:4001';

    assert.strictEqual(getApiBaseUrl(), 'http://127.0.0.1:4001/api');
  });

  await t.test('normalizes trailing slashes without duplicating slashes', () => {
    process.env.APP_ENV = 'staging';
    process.env.BACKEND_URL = 'http://127.0.0.1:4001/';

    assert.strictEqual(getApiBaseUrl(), 'http://127.0.0.1:4001/api');
  });

  await t.test('avoids duplicate /api when BACKEND_URL already includes /api', () => {
    process.env.APP_ENV = 'staging';
    process.env.BACKEND_URL = 'http://127.0.0.1:4001/api';

    assert.strictEqual(getApiBaseUrl(), 'http://127.0.0.1:4001/api');
  });

  await t.test('avoids duplicate /api when BACKEND_URL includes /api with trailing slash', () => {
    process.env.APP_ENV = 'staging';
    process.env.BACKEND_URL = 'http://127.0.0.1:4001/api/';

    assert.strictEqual(getApiBaseUrl(), 'http://127.0.0.1:4001/api');
  });

  await t.test('preserves non-staging default fallback to port 4000', () => {
    delete process.env.APP_ENV;
    delete process.env.DEPLOY_ENV;
    delete process.env.STAGING;
    delete process.env.BACKEND_URL;
    delete process.env.NEXT_PUBLIC_API_URL;

    assert.strictEqual(getApiBaseUrl(), 'http://localhost:4000/api');
  });

  await t.test('preserves non-staging absolute NEXT_PUBLIC_API_URL when set', () => {
    delete process.env.APP_ENV;
    delete process.env.DEPLOY_ENV;
    delete process.env.STAGING;
    delete process.env.BACKEND_URL;
    process.env.NEXT_PUBLIC_API_URL = 'https://dashboard.cmd.hartek.com/api';

    assert.strictEqual(getApiBaseUrl(), 'https://dashboard.cmd.hartek.com/api');
  });
});
