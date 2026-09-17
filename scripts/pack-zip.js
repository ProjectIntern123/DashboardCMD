const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('--- Packing CMD Dashboard System Archive ---');

const rootDir = path.join(__dirname, '..');
const stagingDir = path.join(rootDir, 'temp_zip_staging');
const zipFile = path.join(rootDir, 'CMD_Dashboard_Full_System.zip');

// Clean staging and existing zip
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
  fs.rmSync(zipFile, { force: true });
}

fs.mkdirSync(stagingDir, { recursive: true });

const items = [
  'backend',
  'frontend',
  'scripts',
  'package.json',
  'package-lock.json',
  '.env.example',
  '.gitignore',
  'ecosystem.config.js',
  'nginx.conf',
  'README.md',
  'SYSTEM_DOCUMENTATION.md',
  'WORK_REPORT.md',
  'PATCH_INSTRUCTIONS.md',
  'setup.bat',
  'run.bat',
  'setup.sh',
  'run.sh',
  'UBUNTU_DEPLOYMENT.md',
  'apply-patch.bat'
];

console.log('Copying source files to staging (skipping node_modules, build outputs, and git)...');

const filterFunc = (src) => {
  const base = path.basename(src);
  if (base === 'node_modules' || base === 'dist' || base === '.next' || base === '.git' || base === 'temp_zip_staging') {
    return false;
  }
  return true;
};

items.forEach(item => {
  const src = path.join(rootDir, item);
  const dest = path.join(stagingDir, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true, filter: filterFunc });
  }
});

console.log('Creating ZIP archive...');
const psCommand = `powershell -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipFile}' -Force"`;
execSync(psCommand, { stdio: 'inherit' });

// Remove staging folder
fs.rmSync(stagingDir, { recursive: true, force: true });

const stats = fs.statSync(zipFile);
console.log(`\n--- Archive Created Successfully! ---`);
console.log(`File Path: ${zipFile}`);
console.log(`File Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
