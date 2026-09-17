const fs = require('fs');
const path = require('path');

const rootEnvPath = path.join(__dirname, '../.env');
const exampleEnvPath = path.join(__dirname, '../.env.example');
const backendEnvPath = path.join(__dirname, '../backend/.env');
const frontendEnvPath = path.join(__dirname, '../frontend/.env');

console.log('--- Checking & Synchronizing Environment Configurations ---');

// 1. Ensure root .env exists
if (!fs.existsSync(rootEnvPath)) {
  if (fs.existsSync(exampleEnvPath)) {
    fs.copyFileSync(exampleEnvPath, rootEnvPath);
    console.log('[CREATED] .env created from .env.example template.');
  } else {
    console.warn('[WARNING] Neither .env nor .env.example found.');
  }
} else if (fs.existsSync(exampleEnvPath)) {
  // Merge missing keys from .env.example into existing .env safely
  try {
    const rootContent = fs.readFileSync(rootEnvPath, 'utf8');
    const exampleContent = fs.readFileSync(exampleEnvPath, 'utf8');

    const getKeys = (content) => {
      return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => line.split('=')[0].trim());
    };

    const rootKeys = new Set(getKeys(rootContent));
    const exampleLines = exampleContent.split(/\r?\n/);
    const missingLines = [];

    for (const line of exampleLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const key = trimmed.split('=')[0].trim();
        if (!rootKeys.has(key)) {
          missingLines.push(line);
        }
      }
    }

    if (missingLines.length > 0) {
      console.log(`[UPDATE] Adding ${missingLines.length} missing config key(s) to root .env...`);
      fs.appendFileSync(rootEnvPath, '\n# Added automatically by setup sync\n' + missingLines.join('\n') + '\n');
    }
  } catch (err) {
    console.error('Failed to parse .env keys:', err.message);
  }
}

// 2. Sync root .env to backend and frontend
if (fs.existsSync(rootEnvPath)) {
  try {
    fs.copyFileSync(rootEnvPath, backendEnvPath);
    console.log('[SYNC] Successfully synced .env to backend/.env');

    fs.copyFileSync(rootEnvPath, frontendEnvPath);
    console.log('[SYNC] Successfully synced .env to frontend/.env');
  } catch (error) {
    console.error('Error copying env configuration:', error.message);
  }
}
