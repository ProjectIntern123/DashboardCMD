// scripts/check-db-init.js
// Read-only safety guard: detects existing database objects before setup/seeding.
const path = require('path');

let PrismaClient;
try {
  PrismaClient = require(path.join(__dirname, '../backend/node_modules/@prisma/client')).PrismaClient;
} catch (e) {
  try {
    PrismaClient = require('@prisma/client').PrismaClient;
  } catch (e2) {
    console.error('[CRITICAL ERROR] Cannot resolve @prisma/client. Run node scripts/bootstrap.js first.');
    process.exit(1);
  }
}

const prisma = new PrismaClient();

async function checkDatabaseState() {
  let exitCode = 1; // Default to fail-closed error
  try {
    // 1. Count base and partitioned tables in user-defined schemas
    const tableRes = await prisma.$queryRaw`
      SELECT count(*)::int as count 
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND c.relkind IN ('r', 'p')
    `;
    const tableCount = tableRes[0]?.count || 0;

    // 2. Count standard views and materialized views in user-defined schemas
    const viewRes = await prisma.$queryRaw`
      SELECT count(*)::int as count 
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND c.relkind IN ('v', 'm')
    `;
    const viewCount = viewRes[0]?.count || 0;

    // 3. Count standalone user types (enums, standalone composite types, domains)
    // Note: Standalone composite types created via CREATE TYPE have c.relkind = 'c'.
    // Auto-generated row types for tables/views have c.relkind IN ('r', 'p', 'v', 'm') and are excluded.
    const typeRes = await prisma.$queryRaw`
      SELECT count(*)::int as count 
      FROM pg_type t 
      JOIN pg_namespace n ON t.typnamespace = n.oid 
      LEFT JOIN pg_class c ON t.typrelid = c.oid 
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND (
          t.typtype = 'e' 
          OR (t.typtype = 'c' AND c.relkind = 'c')
          OR t.typtype = 'd'
        )
    `;
    const typeCount = typeRes[0]?.count || 0;

    const totalObjects = tableCount + viewCount + typeCount;

    if (totalObjects > 0) {
      console.log('=========================================================================');
      console.log(`[EXISTING DATABASE DETECTED] Found ${tableCount} table(s), ${viewCount} view(s), ${typeCount} custom type(s).`);
      console.log('[SAFETY STATUS] Database is already initialized. Schema push and seeding are locked.');
      console.log('=========================================================================');
      exitCode = 10; // Code 10: Existing objects present
    } else {
      console.log('[EMPTY DATABASE] Database contains 0 user objects. Safe for initial development setup.');
      exitCode = 0; // Code 0: Fresh empty database
    }
  } catch (error) {
    console.error('=========================================================================');
    console.error('[DATABASE VERIFICATION ERROR] Could not verify database state:');
    console.error(`  ${error.message}`);
    console.error('[SAFETY STATUS] Fail-closed: Halting setup to prevent data corruption.');
    console.error('=========================================================================');
    exitCode = 1; // Code 1: Unreachable or error
  } finally {
    await prisma.$disconnect();
  }

  process.exit(exitCode);
}

checkDatabaseState();
