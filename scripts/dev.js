const concurrently = require('concurrently');
const path = require('path');

// 1. Sync environment
try {
  require('./sync-env');
} catch (e) {
  console.error('Error syncing env:', e.message);
}

console.log('--- Starting HARTEK CMD Unified Development Servers ---');

const { result } = concurrently(
  [
    {
      command: 'node node_modules/@nestjs/cli/bin/nest.js start --watch',
      name: 'backend',
      prefixColor: 'blue',
      cwd: path.join(__dirname, '../backend'),
    },
    {
      command: 'node node_modules/next/dist/bin/next dev -H 0.0.0.0',
      name: 'frontend',
      prefixColor: 'green',
      cwd: path.join(__dirname, '../frontend'),
    },
  ],
  {
    prefix: 'name',
    killOthers: ['failure', 'success'],
  }
);

result.then(
  () => console.log('All processes finished successfully.'),
  (err) => console.error('A process failed to run:', err)
);
