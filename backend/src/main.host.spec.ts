import { getListenConfig } from './common/config/server.config';

describe('Backend Host & Port Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to 0.0.0.0 and port 4000 when environment variables are omitted', () => {
    delete process.env.HOST;
    delete process.env.PORT;

    const { host, port } = getListenConfig(process.env);
    expect(host).toBe('0.0.0.0');
    expect(port).toBe(4000);
  });

  it('resolves configured HOST=127.0.0.1 for loopback isolation', () => {
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '4001';

    const { host, port } = getListenConfig(process.env);
    expect(host).toBe('127.0.0.1');
    expect(port).toBe(4001);
  });

  it('preserves custom port while defaulting host to 0.0.0.0', () => {
    delete process.env.HOST;
    process.env.PORT = '4005';

    const { host, port } = getListenConfig(process.env);
    expect(host).toBe('0.0.0.0');
    expect(port).toBe(4005);
  });
});
