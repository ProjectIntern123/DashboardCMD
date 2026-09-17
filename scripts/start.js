const concurrently = require('concurrently');
const path = require('path');

// 1. Sync environment
try {
  require('./sync-env');
} catch (e) {
  console.error('Error syncing env:', e.message);
}

console.log('--- Starting HARTEK CMD Unified Production Servers ---');

const { result } = concurrently(
  [
    {
      command: 'node backend/dist/src/main.js',
      name: 'backend',
      prefixColor: 'blue',
    },
    {
      command: 'node node_modules/next/dist/bin/next start -H 0.0.0.0',
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
