import { run, get } from '../src/db.js';
import bcrypt from 'bcryptjs';

async function seed() {
  const now = new Date().toISOString();

  async function ensureUser(email, role, password) {
    const existing = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (existing) return existing;
    const password_hash = await bcrypt.hash(password, 10);
    const res = await run(
      'INSERT INTO users(email, password_hash, role, created_at) VALUES (?,?,?,?)',
      [email, password_hash, role, now]
    );
    return { id: res.id, email, role };
  }

  // Standard test users
  await ensureUser('user@example.com', 'user', 'password');
  await ensureUser('agent@example.com', 'agent', 'password');
  
  // Demo admin user with specific credentials
  await ensureUser('admin@mail.com', 'admin', 'admin123');

  console.log('Seed completed. Demo Admin: admin@mail.com. Other users: user@example.com, agent@example.com.');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});