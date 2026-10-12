# Mini Ticket Tracker

A small ticket tracker: Express + PostgreSQL (plain `pg`) backend, Next.js (App Router) frontend.

```
backend/    Express API, schema.sql, node:test integration tests
frontend/   Next.js single page UI (TypeScript)
db/         init script that creates the test database
docker-compose.yml
```

## Setup and run

Requirements: Node 22+, Docker (for Postgres).

```bash
# 1. Postgres (creates databases "tickets" and "tickets_test" on first boot)
docker compose up -d
# If port 5432 is taken: POSTGRES_PORT=5433 docker compose up -d, and adjust the URLs in backend/.env

# 2. Backend on http://localhost:4000 (applies schema.sql on startup)
cd backend
cp .env.example .env      # optional, defaults are the same
npm install
npm start

# 3. Frontend on http://localhost:3000 (in another terminal)
cd frontend
cp .env.example .env      # optional; BACKEND_URL defaults to http://localhost:4000
npm install
npm run dev
```

Tests and checks:

```bash
cd backend && npm test                                    # 8 integration tests, needs the test database
cd frontend && npx tsc --noEmit && npx next build
```

Configuration (env vars): `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT` (backend); `BACKEND_URL` (frontend).
The browser only calls `/api/*`; a Next.js rewrite proxies it to Express, so no CORS setup is needed.

## API reference

Errors are JSON. Validation errors are `400 { "error": "Validation failed", "details": { "field": "reason" } }`.

```bash
# Create (201). title required, max 200 chars, not blank. description and priority optional.
curl -X POST localhost:4000/tickets -H 'Content-Type: application/json' \
  -d '{"title":"Printer broken","description":"Floor 2","priority":"high"}'

# List, newest first. status, page (default 1), limit (default 20, max 100)
curl 'localhost:4000/tickets?status=open&page=1&limit=10'
# -> { "data": [...], "page": 1, "limit": 10, "total": 3, "totalPages": 1 }

# Update status and/or priority only (any other field or an empty body is 400, unknown id is 404)
curl -X PATCH localhost:4000/tickets/<id> -H 'Content-Type: application/json' \
  -d '{"status":"in_progress"}'

# Counts by status, always all three keys
curl localhost:4000/tickets/stats
# -> { "open": 2, "in_progress": 0, "closed": 1 }
```

## Decisions & Tradeoffs

I used TEXT columns with CHECK constraints instead of native Postgres enums, because adding a value to a CHECK is a simple constraint swap while enum changes are more awkward, and the API validates the same lists so errors are friendly rather than raw constraint failures. Lists use LIMIT/OFFSET for simplicity and random page access; keyset pagination would be faster and more stable on large or fast-changing tables. Two indexes back the list query, `(status, created_at DESC, id DESC)` for the filter and `(created_at DESC, id DESC)` for the unfiltered view, with `id` as a tiebreaker so pages do not shuffle. I made some judgment calls where the brief was silent: POST rejects unknown fields (including `status`) so new tickets always start open, invalid `page`/`limit` values return 400 while a `limit` above 100 is clamped, and malformed UUIDs return 404 like unknown ids. The schema is applied from an idempotent `schema.sql` on startup rather than a migration tool, which is fine for one table but I would adopt a real migration tool (and versioned migrations) as soon as the schema needs to change. There is no auth, rate limiting or request logging, and the title is trimmed server-side. The frontend refetches the list and stats after every mutation instead of updating optimistically, trading a little latency for always-correct counts and pagination; the status dropdown is controlled by server data, so a failed update reverts naturally and shows the error. The page size is small (5) so pagination is visible with little data. With more time I would add frontend component tests and an end-to-end test, a cancel/debounce layer for requests, and run the backend tests in CI against a Postgres service container.
