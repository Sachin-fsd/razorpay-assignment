const bcrypt = require('bcryptjs');
const pool = require('../src/db');

async function seedData() {
  const email = 'cfo@org.com';
  const password = 'CFO#ORG@April2026';
  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password = EXCLUDED.password,
        role = EXCLUDED.role
    `,
    ['CFO', email, passwordHash, 'CFO']
  );

  console.log(`Seeded CFO user ${email}`);
}

seedData()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
