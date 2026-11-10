// Creates the first account, which everyone else is then invited from. The setup page
// at /setup does the same in the browser on a fresh install.
// Usage: npm run founder:create -- --name "Full Name" --email you@company.com --password "a password"
// Stop npm run dev first: only one program can open the database folder at a time.
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import { createFounder } from '../src/server/auth/founderSetup';
import { defaultDatabaseOptions, openDatabase } from '../src/server/database/localDatabase';

try {
  loadEnvFile('.env.local');
} catch {
  // Optional. The defaults work without it.
}

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    email: { type: 'string' },
    password: { type: 'string' },
  },
});

async function createFounderAccount() {
  const name = values.name?.trim();
  const email = values.email?.trim().toLowerCase();
  const password = values.password ?? '';

  if (!name || !email) throw new Error('Provide --name and --email.');
  if (password.length < 10 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
    throw new Error('Provide a --password of at least 10 characters, with letters and numbers.');
  }

  const db = await openDatabase(defaultDatabaseOptions());
  try {
    await createFounder(db, { name, email, password });
  } finally {
    await db.close();
  }
  console.log(`Founder account created for ${email}.`);
}

createFounderAccount()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
