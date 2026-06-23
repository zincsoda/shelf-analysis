/**
 * CLI seed script — run after migrations to create the initial admin user.
 * Usage:
 *   npx tsx scripts/seed-admin-cli.ts              # print SQL
 *   npx tsx scripts/seed-admin-cli.ts --apply-local  # insert into local D1
 */
import { execSync } from 'node:child_process';
import { hashPassword } from '../src/lib/password.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@shelfsight.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin12345';
const APPLY_LOCAL = process.argv.includes('--apply-local');

async function main() {
  const hash = await hashPassword(ADMIN_PASSWORD);
  const id = crypto.randomUUID();
  const sql = `INSERT OR IGNORE INTO users (id, email, password_hash, role, is_active) VALUES ('${id}', '${ADMIN_EMAIL}', '${hash}', 'admin', 1);`;

  if (APPLY_LOCAL) {
    execSync(
      `npx wrangler d1 execute shelf-analysis-db --local --command ${JSON.stringify(sql)}`,
      { stdio: 'inherit' },
    );
    console.log(`Seeded admin user in local D1: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    return;
  }

  console.log('-- Run this SQL against your D1 database:');
  console.log();
  console.log(sql);
  console.log();
  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
  console.log();
  console.log('Local: npm run seed:admin:local');
}

main();
