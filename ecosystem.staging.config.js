const fs = require('fs');
const path = require('path');

// Safe loader for dedicated staging environment file only
// Strictly never reads backend/.env or production environment files
function loadStagingEnv(customEnvPath) {
  const stagingEnvPaths = customEnvPath
    ? [customEnvPath]
    : [
        path.join(__dirname, 'backend', '.env.staging'),
        path.join(__dirname, '.env.staging'),
      ];
  const stagingEnv = {};
  for (const envPath of stagingEnvPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and full comment lines
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        if (trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.substring(0, idx).trim();
          let val = trimmed.substring(idx + 1).trim();

          // Strip surrounding matching double or single quotes
          if (
            (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
            (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
          ) {
            val = val.substring(1, val.length - 1);
          }

          // If duplicate key exists, preserve the first occurrence
          if (stagingEnv[key] === undefined) {
            stagingEnv[key] = val;
          }
        }
      }
      break;
    }
  }
  return stagingEnv;
}

const stagingEnv = loadStagingEnv();

module.exports = {
  apps: [
    {
      name: 'cmd-staging-backend',
      script: 'dist/src/main.js',
      cwd: './backend',
      env: {
        NODE_ENV: 'production',
        PORT: 4001,
        HOST: '127.0.0.1',
        APP_ENV: 'staging',
        DEPLOY_ENV: 'staging',
        STAGING: 'true',
        DISABLE_OUTBOUND_EMAILS: 'true',
        ALLOW_OUTBOUND_EMAILS: 'false',
        // The explicit staging env file takes precedence over shell variables.
        // Falls back ONLY to STAGING_DATABASE_URL if set; NEVER inherits production DATABASE_URL.
        DATABASE_URL: stagingEnv.DATABASE_URL || process.env.STAGING_DATABASE_URL || '',
        JWT_SECRET: stagingEnv.JWT_SECRET || process.env.STAGING_JWT_SECRET || '',
        JWT_REFRESH_SECRET: stagingEnv.JWT_REFRESH_SECRET || process.env.STAGING_JWT_REFRESH_SECRET || '',
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/staging-backend-error.log',
      out_file: './logs/staging-backend-out.log',
      time: true
    },
    {
      name: 'cmd-staging-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 3001',
      cwd: './frontend',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        HOST: '127.0.0.1',
        APP_ENV: 'staging',
        DEPLOY_ENV: 'staging',
        STAGING: 'true',
        BACKEND_URL: 'http://127.0.0.1:4001',
        NEXT_PUBLIC_API_URL: '/api'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/staging-frontend-error.log',
      out_file: './logs/staging-frontend-out.log',
      time: true
    }
  ],
  loadStagingEnv,
};
