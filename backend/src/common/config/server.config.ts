export interface ServerListenConfig {
  port: number;
  host: string;
}

export function getListenConfig(env: NodeJS.ProcessEnv = process.env): ServerListenConfig {
  const rawPort = env.PORT;
  const port = rawPort ? parseInt(rawPort, 10) || 4000 : 4000;
  const host = (env.HOST || '0.0.0.0').trim();
  return { port, host };
}
