import express from 'express';
import { all, get, run } from '../db.js';
import { apiError } from '../utils/errors.js';
import { authenticate, requireAuth, requireRole } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';

export const router = express.Router();

router.use(authenticate);

// Helper: compute SLA due based on priority
function computeSlaDueAt(priority) {
  const now = new Date();
  const hours = { low: 72, medium: 48, high: 24, urgent: 4 }[priority] || 48;
  now.setHours(now.getHours() + hours);
  return now.toISOString();
}

// Helper: role-based visibility
async function canViewTicket(user, ticket) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'agent') return true; // agents see all tickets for simplicity
  return ticket.requester_id === user.id;
}

// Search helper: matches title, description, latest comment
async function searchWhereClauseAndParams(query) {
  if (!query) return { where: '', params: [] };
  // latest comment: join subquery for latest comment per ticket
  const where = `WHERE (
    t.title LIKE ? OR t.description LIKE ? OR EXISTS (
      SELECT 1 FROM comments c WHERE c.ticket_id = t.id AND c.id = (
        SELECT id FROM comments c2 WHERE c2.ticket_id = t.id ORDER BY c2.created_at DESC LIMIT 1
      ) AND c.body LIKE ?
    )
  )`;
  const pattern = `%${query}%`;
  return { where, params: [pattern, pattern, pattern] };
}

// POST /api/tickets (idempotent)
router.post('/tickets', requireAuth, idempotencyMiddleware, async (req, res, next) => {
  try {
    const { title, description, priority = 'medium', assignee_id } = req.body;
    if (!title) throw apiError('FIELD_REQUIRED', 'Title is required', { field: 'title' });
    if (!description) throw apiError('FIELD_REQUIRED', 'Description is required', { field: 'description' });
    const now = new Date().toISOString();
    const sla_due_at = computeSlaDueAt(priority);
    const result = await run(
      `INSERT INTO tickets(title, description, status, priority, requester_id, assignee_id, sla_due_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [title, description, 'open', priority, req.user.id, assignee_id || null, sla_due_at, now, now]
    );
    await run('INSERT INTO timeline(ticket_id, actor_id, action, details, created_at) VALUES (?,?,?,?,?)', [result.id, req.user.id, 'ticket.created', JSON.stringify({ priority, assignee_id: assignee_id || null }), now]);
    const ticket = await get('SELECT * FROM tickets WHERE id = ?', [result.id]);
    res.json({ ticket });
  } catch (e) { next(e); }
});

// GET /api/tickets?search=&status=&limit=&offset=&breached=1
router.get('/tickets', requireAuth, async (req, res, next) => {
  try {
    const { search, status, limit = 20, offset = 0, breached } = req.query;
    const { where, params } = await searchWhereClauseAndParams(search);
    const extra = [];
    if (status) {
      extra.push('t.status = ?');
      params.push(status);
    }
    if (breached === '1') {
      extra.push('t.sla_due_at < ?');
      params.push(new Date().toISOString());
    }
    let finalWhere = where;
    if (extra.length) {
      finalWhere += (finalWhere ? ' AND ' : 'WHERE ') + extra.join(' AND ');
    }

    // visibility: user sees own, agent/admin see all.
    if (req.user.role === 'user') {
      finalWhere += (finalWhere ? ' AND ' : 'WHERE ') + 't.requester_id = ?';
      params.push(req.user.id);
    }

    const items = await all(
      `SELECT t.* FROM tickets t ${finalWhere} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const nextOffset = items.length < Number(limit) ? null : Number(offset) + Number(limit);
    res.json({ items, next_offset: nextOffset });
  } catch (e) { next(e); }
});

// GET /api/tickets/:id
router.get('/tickets/:id', requireAuth, async (req, res, next) => {
  try {
    const ticket = await get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!ticket) throw apiError('NOT_FOUND', 'Ticket not found');
    if (!(await canViewTicket(req.user, ticket))) throw apiError('FORBIDDEN', 'Not allowed');
    const comments = await all('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC', [ticket.id]);
    const timeline = await all('SELECT * FROM timeline WHERE ticket_id = ? ORDER BY created_at ASC', [ticket.id]);
    res.json({ ticket, comments, timeline });
  } catch (e) { next(e); }
});

// PATCH /api/tickets/:id with optimistic locking
router.patch('/tickets/:id', requireAuth, async (req, res, next) => {
  try {
    const { title, description, status, priority, assignee_id, version } = req.body;
    if (version === undefined) throw apiError('FIELD_REQUIRED', 'Version is required', { field: 'version' });
    const ticket = await get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!ticket) throw apiError('NOT_FOUND', 'Ticket not found');
    if (!(await canViewTicket(req.user, ticket))) throw apiError('FORBIDDEN', 'Not allowed');
    if (ticket.version !== Number(version)) throw apiError('CONFLICT', 'Stale update');

    // Only agent/admin can reassign or change status; requester can edit title/description
    const now = new Date().toISOString();
    const next = {
      title: title ?? ticket.title,
      description: description ?? ticket.description,
      status: status ?? ticket.status,
      priority: priority ?? ticket.priority,
      assignee_id: assignee_id ?? ticket.assignee_id
    };

    if (req.user.role === 'user') {
      next.status = ticket.status;
      next.assignee_id = ticket.assignee_id;
      next.priority = ticket.priority;
    }

    if (next.priority !== ticket.priority) {
      next.sla_due_at = computeSlaDueAt(next.priority);
    }

    const fields = ['title','description','status','priority','assignee_id','sla_due_at'];
    const setClause = fields.filter(f => next[f] !== undefined).map(f => `${f} = ?`).join(', ');
    const values = fields.filter(f => next[f] !== undefined).map(f => next[f]);
    values.push(now, ticket.id, ticket.version); // updated_at, id, version in WHERE

    const updateRes = await run(`UPDATE tickets SET ${setClause}, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`, values);
    if (updateRes.changes === 0) throw apiError('CONFLICT', 'Stale update');

    // timeline
    await run('INSERT INTO timeline(ticket_id, actor_id, action, details, created_at) VALUES (?,?,?,?,?)', [ticket.id, req.user.id, 'ticket.updated', JSON.stringify({ before: ticket, after: next }), now]);

    const updated = await get('SELECT * FROM tickets WHERE id = ?', [ticket.id]);
    res.json({ ticket: updated });
  } catch (e) { next(e); }
});

// POST /api/tickets/:id/comments (idempotent)
router.post('/tickets/:id/comments', requireAuth, idempotencyMiddleware, async (req, res, next) => {
  try {
    const { body, parent_id } = req.body;
    if (!body) throw apiError('FIELD_REQUIRED', 'Body is required', { field: 'body' });
    const ticket = await get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
    if (!ticket) throw apiError('NOT_FOUND', 'Ticket not found');
    if (!(await canViewTicket(req.user, ticket))) throw apiError('FORBIDDEN', 'Not allowed');
    const now = new Date().toISOString();
    const result = await run('INSERT INTO comments(ticket_id, author_id, body, parent_id, created_at) VALUES (?,?,?,?,?)', [ticket.id, req.user.id, body, parent_id || null, now]);
    await run('INSERT INTO timeline(ticket_id, actor_id, action, details, created_at) VALUES (?,?,?,?,?)', [ticket.id, req.user.id, 'comment.created', JSON.stringify({ comment_id: result.id }), now]);
    const comment = await get('SELECT * FROM comments WHERE id = ?', [result.id]);
    res.json({ comment });
  } catch (e) { next(e); }
});

export default router;


