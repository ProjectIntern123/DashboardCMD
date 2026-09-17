const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('--- Checking & Bootstrapping HARTEK CMD Subprojects ---');

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function isUpToDate(targetDir) {
  const nodeModulesPath = path.join(targetDir, 'node_modules');
  const pkgPath = path.join(targetDir, 'package.json');
  const lockPath = path.join(targetDir, 'package-lock.json');

  if (!fs.existsSync(nodeModulesPath)) {
    return false;
  }

  try {
    const nmStat = fs.statSync(nodeModulesPath);
    const pkgStat = fs.statSync(pkgPath);
    let isFresh = nmStat.mtime >= pkgStat.mtime;

    if (fs.existsSync(lockPath)) {
      const lockStat = fs.statSync(lockPath);
      isFresh = isFresh && nmStat.mtime >= lockStat.mtime;
    }
    return isFresh;
  } catch (e) {
    return false;
  }
}

function installIfNeeded(targetDir, label) {
  const force = process.argv.includes('--force');
  if (!force && isUpToDate(targetDir)) {
    console.log(`[UP-TO-DATE] ${label} node_modules already exist and are up to date. Skipping install.`);
    return;
  }

  console.log(`\n[INSTALLING] Installing/Updating dependencies for ${label}...`);
  execSync('npm install', { cwd: targetDir, stdio: 'inherit', shell: true });
  console.log(`[SUCCESS] ${label} dependencies ready.`);
}

try {
  const rootDir = path.join(__dirname, '..');
  const backendDir = path.join(__dirname, '../backend');
  const frontendDir = path.join(__dirname, '../frontend');

  installIfNeeded(rootDir, 'Root Project');
  installIfNeeded(backendDir, 'Backend Service');
  installIfNeeded(frontendDir, 'Frontend Application');

  console.log('\n--- All subproject dependencies verified and ready! ---');
} catch (error) {
  console.error('\n[ERROR] Bootstrapping failed:', error.message);
  process.exit(1);
}
