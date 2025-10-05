HelpDesk Mini
=============

Simple ticketing API with SLA timers, assignments, threaded comments, searchable timeline, optimistic locking, pagination, idempotency, and rate limits. Includes minimal UI pages.

Quick Start
-----------

1. Install deps

```bash
npm install
```

2. Run migrations and seed

```bash
npm run migrate
npm run seed
```

3. Start server

```bash
npm run dev
```

Open `http://localhost:3000/tickets`.

Authentication
--------------

- JWT Bearer tokens. Endpoints: `POST /api/register`, `POST /api/login`.
- Roles: `user`, `agent`, `admin`.
- Attach header: `Authorization: Bearer <token>`.

Rate Limits
-----------

- 60 requests/minute per user (or IP if unauthenticated). On exceed:

```json
{ "error": { "code": "RATE_LIMIT" } }
```

Idempotency
-----------

- All POST endpoints accept `Idempotency-Key` header and will return the first response for duplicate keys.

Pagination
----------

- Use `?limit=&offset=`. Responses return `{ items, next_offset }`.

SLA
---

- SLA due is computed from ticket `priority` at creation or when priority changes:
  - low: +72h, medium: +48h, high: +24h, urgent: +4h
- Breached tickets: `GET /api/tickets?breached=1` (compares `sla_due_at` to now).

Search
------

- `GET /api/tickets?search=...` matches `title`, `description`, and the latest comment body.

Optimistic Locking
------------------

- `PATCH /api/tickets/:id` requires `version` field. If stale, returns `409` with:

```json
{ "error": { "code": "CONFLICT", "message": "Stale update" } }
```

API Summary
-----------

- `POST /api/register` → `{ user, token }`
- `POST /api/login` → `{ user, token }`
- `POST /api/tickets` → `{ ticket }`
- `GET /api/tickets?search=&status=&breached=1&limit=&offset=` → `{ items, next_offset }`
- `GET /api/tickets/:id` → `{ ticket, comments, timeline }`
- `PATCH /api/tickets/:id` → `{ ticket }` (requires `version`)
- `POST /api/tickets/:id/comments` → `{ comment }`

Example Requests
----------------

Register

```bash
curl -X POST http://localhost:3000/api/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"new@ex.com","password":"password","role":"user"}'
```

Login

```bash
curl -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password"}'
```

Create Ticket (idempotent)

```bash
curl -X POST http://localhost:3000/api/tickets \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Idempotency-Key: 123e4567-e89b-12d3-a456-426614174000' \
  -d '{"title":"Issue","description":"It broke","priority":"high"}'
```

List Tickets (pagination)

```bash
curl 'http://localhost:3000/api/tickets?limit=10&offset=0&search=Issue'
```

Get Ticket

```bash
curl 'http://localhost:3000/api/tickets/1' -H 'Authorization: Bearer <TOKEN>'
```

Update Ticket (optimistic locking)

```bash
curl -X PATCH 'http://localhost:3000/api/tickets/1' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"status":"in_progress","version":2}'
```

Add Comment (idempotent)

```bash
curl -X POST 'http://localhost:3000/api/tickets/1/comments' \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 123e4567-e89b-12d3-a456-426614174001' \
  -d '{"body":"Looking into this"}'
```

RBAC
----

- `user`: can create tickets, view own tickets, edit own title/description, comment on own tickets.
- `agent`: can view all tickets, edit status/assignee/priority, comment.
- `admin`: same as agent.

UI Pages
--------

- `/tickets`: list tickets (quick login button seeds token)
- `/tickets/new`: create ticket
- `/tickets/:id`: view, comment, and edit with optimistic version

Error Format
------------

Always:

```json
{ "error": { "code": "FIELD_REQUIRED", "field": "email", "message": "Email is required" } }
```

Test Credentials
----------------

- user@example.com / password (role: user)
- agent@example.com / password (role: agent)
- admin@example.com / password (role: admin)

Seed Data
---------

Use `npm run seed` to create the above users.

Notes
-----

- CORS is open during judging.
- Idempotency applies to POST endpoints.
- Pagination returns `next_offset` for easy iteration.

