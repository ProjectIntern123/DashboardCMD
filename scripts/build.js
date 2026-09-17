const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('--- Checking & Building HARTEK CMD Unified Project ---');

// 1. Sync environment
try {
  require('./sync-env');
} catch (e) {
  console.error('Error syncing env:', e.message);
}

function getLatestMtime(dirPath) {
  let maxTime = 0;
  if (!fs.existsSync(dirPath)) return maxTime;

  function walk(current) {
    const files = fs.readdirSync(current);
    for (const f of files) {
      const full = path.join(current, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        if (stat.mtimeMs > maxTime) {
          maxTime = stat.mtimeMs;
        }
      }
    }
  }

  walk(dirPath);
  return maxTime;
}

const force = process.argv.includes('--force');

// 2. Build backend if needed
try {
  const backendDistMain = path.join(__dirname, '../backend/dist/src/main.js');
  const backendSrcDir = path.join(__dirname, '../backend/src');
  const distExists = fs.existsSync(backendDistMain);
  
  let needsBackendBuild = !distExists || force;
  if (distExists && !force) {
    const distTime = fs.statSync(backendDistMain).mtimeMs;
    const srcTime = getLatestMtime(backendSrcDir);
    if (srcTime > distTime) {
      needsBackendBuild = true;
    }
  }

  if (!needsBackendBuild) {
    console.log('[UP-TO-DATE] Backend build (NestJS) is already compiled and up to date.');
  } else {
    console.log('\n[BUILDING] Compiling backend (NestJS)...');
    execSync('node node_modules/@nestjs/cli/bin/nest.js build', {
      cwd: path.join(__dirname, '../backend'),
      stdio: 'inherit'
    });
    console.log('[SUCCESS] Backend build complete.');
  }
} catch (error) {
  console.error('Backend compilation failed:', error.message);
  process.exit(1);
}

// 3. Build frontend if needed
try {
  const frontendBuildId = path.join(__dirname, '../frontend/.next/BUILD_ID');
  const frontendSrcDir = path.join(__dirname, '../frontend/src');
  const feBuildExists = fs.existsSync(frontendBuildId);

  let needsFrontendBuild = !feBuildExists || force;
  if (feBuildExists && !force) {
    const buildTime = fs.statSync(frontendBuildId).mtimeMs;
    const srcTime = getLatestMtime(frontendSrcDir);
    if (srcTime > buildTime) {
      needsFrontendBuild = true;
    }
  }

  if (!needsFrontendBuild) {
    console.log('[UP-TO-DATE] Frontend build (Next.js) is already compiled and up to date.');
  } else {
    console.log('\n[BUILDING] Compiling frontend (Next.js)...');
    execSync('node node_modules/next/dist/bin/next build', {
      cwd: path.join(__dirname, '../frontend'),
      stdio: 'inherit'
    });
    console.log('[SUCCESS] Frontend build complete.');
  }
} catch (error) {
  console.error('Frontend compilation failed:', error.message);
  process.exit(1);
}

console.log('\n--- Build verification and compilation completed successfully! ---');
