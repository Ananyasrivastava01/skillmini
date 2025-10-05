import { get, run } from '../db.js';

export async function idempotencyMiddleware(req, res, next) {
  if (req.method !== 'POST') return next();
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  try {
    const existing = await get('SELECT * FROM idempotency_keys WHERE key = ?', [key]);
    if (existing) {
      res.status(existing.status || 200).set('x-idempotent', 'true').json(JSON.parse(existing.response_body));
      return;
    }

    // capture res.json to persist response
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      try {
        await run(
          'INSERT INTO idempotency_keys(key, method, path, user_id, response_body, status, created_at) VALUES (?,?,?,?,?,?,?)',
          [key, req.method, req.path, req.user ? req.user.id : null, JSON.stringify(body), res.statusCode, new Date().toISOString()]
        );
      } catch (e) {
        // ignore persistence errors
      }
      return originalJson(body);
    };

    next();
  } catch (e) {
    next();
  }
}


