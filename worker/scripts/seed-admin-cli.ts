/**
 * CLI seed script — run after migrations to create the initial admin user.
 * Usage: npx tsx scripts/seed-admin-cli.ts
 */
import { hashPassword } from '../src/lib/password.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@shelfsight.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin12345';

async function main() {
  const hash = await hashPassword(ADMIN_PASSWORD);
  const id = crypto.randomUUID();

  console.log('-- Run this SQL against your D1 database:');
  console.log();
  console.log(
    `INSERT OR IGNORE INTO users (id, email, password_hash, role, is_active) VALUES ('${id}', '${ADMIN_EMAIL}', '${hash}', 'admin', 1);`,
  );
  console.log();
  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
  console.log();
  console.log('Local: npx wrangler d1 execute shelf-analysis-db --local --command "<SQL above>"');
}

main();
