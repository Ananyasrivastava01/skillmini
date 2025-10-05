import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { get } from '../db.js';
import { apiError } from '../utils/errors.js';

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    // allow anonymous for some routes; attach no user
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await get('SELECT id, email, role FROM users WHERE id = ?', [decoded.id]);
    if (!user) return next(apiError('UNAUTHORIZED', 'Invalid token'));
    req.user = user;
    next();
  } catch (e) {
    next(apiError('UNAUTHORIZED', 'Invalid token'));
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(apiError('UNAUTHORIZED', 'Login required'));
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(apiError('UNAUTHORIZED', 'Login required'));
    if (!roles.includes(req.user.role)) return next(apiError('FORBIDDEN', 'Insufficient role'));
    next();
  };
}

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}


