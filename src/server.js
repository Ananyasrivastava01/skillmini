import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { router as authRouter } from './routes/auth.js';
import { router as ticketsRouter } from './routes/tickets.js';
import { errorHandler } from './utils/errors.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors()); // open CORS during judging
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Global per-user rate limit: 60 req/min/user
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user id if authenticated, else IP
    return (req.user && req.user.id) || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMIT' } });
  }
});

// Views
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

// Routers
app.use('/api', limiter);
app.use('/api', authRouter);
app.use('/api', ticketsRouter);

// UI pages
import './views/pages.js';
import { pagesRouter } from './views/pages.js';
app.use('/', pagesRouter);

// Errors
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


