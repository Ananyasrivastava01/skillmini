import express from 'express';
import bcrypt from 'bcryptjs';
import { get, run } from '../db.js';
import { apiError } from '../utils/errors.js';
import { authenticate, signToken } from '../middleware/auth.js';

export const router = express.Router();

router.use(authenticate);

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    if (!email) throw apiError('FIELD_REQUIRED', 'Email is required', { field: 'email' });
    if (!password) throw apiError('FIELD_REQUIRED', 'Password is required', { field: 'password' });
    const userRole = ['user', 'agent', 'admin'].includes(role) ? role : 'user';
    const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) throw apiError('CONFLICT', 'Email already registered');
    const password_hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const result = await run('INSERT INTO users(email, password_hash, role, created_at) VALUES (?,?,?,?)', [email, password_hash, userRole, now]);
    const user = { id: result.id, email, role: userRole };
    const token = signToken(user);
    res.json({ user, token });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email) throw apiError('FIELD_REQUIRED', 'Email is required', { field: 'email' });
    if (!password) throw apiError('FIELD_REQUIRED', 'Password is required', { field: 'password' });
    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) throw apiError('UNAUTHORIZED', 'Invalid credentials');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw apiError('UNAUTHORIZED', 'Invalid credentials');
    const token = signToken(user);
    res.json({ user: { id: user.id, email: user.email, role: user.role }, token });
  } catch (e) { next(e); }
});

export default router;


