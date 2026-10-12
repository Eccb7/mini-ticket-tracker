const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createPool, applySchema, DEFAULT_TEST_DATABASE_URL } = require('../src/db');

let pool;
let server;
let base;

before(async () => {
  pool = createPool(process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL);
  await applySchema(pool);
  server = createApp(pool).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE tickets');
});

async function call(method, path, body, rawBody) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  return { status: res.status, body: await res.json() };
}

const create = (title, extra = {}) => call('POST', '/tickets', { title, ...extra });

test('POST /tickets creates a ticket with defaults', async () => {
  const res = await create('  Printer is on fire  ');
  assert.equal(res.status, 201);
  assert.equal(res.body.title, 'Printer is on fire');
  assert.equal(res.body.status, 'open');
  assert.equal(res.body.priority, 'medium');
  assert.equal(res.body.description, null);
  assert.match(res.body.id, /^[0-9a-f-]{36}$/);
  assert.ok(!Number.isNaN(Date.parse(res.body.created_at)));
});

test('POST /tickets rejects invalid input with field details', async () => {
  const blank = await create('   ');
  assert.equal(blank.status, 400);
  assert.equal(blank.body.details.title, 'must not be blank');

  const long = await create('x'.repeat(201));
  assert.equal(long.status, 400);
  assert.ok(long.body.details.title);

  const bad = await create('ok', { priority: 'urgent', status: 'closed' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.details.priority);
  assert.ok(bad.body.details.status);

  const malformed = await call('POST', '/tickets', undefined, '{"title": ');
  assert.equal(malformed.status, 400);
  assert.ok(malformed.body.error);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM tickets');
  assert.equal(rows[0].n, 0);
});

test('database CHECK constraints reject bad enum values', async () => {
  await assert.rejects(
    pool.query("INSERT INTO tickets (title, status) VALUES ('x', 'bogus')"),
    { code: '23514' },
  );
});

test('GET /tickets lists newest first and filters by status', async () => {
  const a = await create('first');
  await create('second');
  await create('third');
  await call('PATCH', `/tickets/${a.body.id}`, { status: 'closed' });

  const all = await call('GET', '/tickets');
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.data.map((t) => t.title), ['third', 'second', 'first']);
  assert.equal(all.body.total, 3);
  assert.equal(all.body.page, 1);
  assert.equal(all.body.limit, 20);

  const closed = await call('GET', '/tickets?status=closed');
  assert.deepEqual(closed.body.data.map((t) => t.title), ['first']);
  assert.equal(closed.body.total, 1);

  const bad = await call('GET', '/tickets?status=nope');
  assert.equal(bad.status, 400);
  assert.ok(bad.body.details.status);
});

test('GET /tickets paginates and validates page and limit', async () => {
  for (let i = 1; i <= 5; i++) await create(`t${i}`);

  const p1 = await call('GET', '/tickets?page=1&limit=2');
  assert.deepEqual(p1.body.data.map((t) => t.title), ['t5', 't4']);
  assert.equal(p1.body.totalPages, 3);
  assert.equal(p1.body.total, 5);

  const p3 = await call('GET', '/tickets?page=3&limit=2');
  assert.deepEqual(p3.body.data.map((t) => t.title), ['t1']);

  const beyond = await call('GET', '/tickets?page=9&limit=2');
  assert.deepEqual(beyond.body.data, []);

  const clamped = await call('GET', '/tickets?limit=1000');
  assert.equal(clamped.body.limit, 100);

  const invalid = await call('GET', '/tickets?page=0&limit=abc');
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.details.page);
  assert.ok(invalid.body.details.limit);
});

test('PATCH /tickets/:id updates status and priority', async () => {
  const { body: t } = await create('fix me');

  const one = await call('PATCH', `/tickets/${t.id}`, { status: 'in_progress' });
  assert.equal(one.status, 200);
  assert.equal(one.body.status, 'in_progress');
  assert.equal(one.body.priority, 'medium');

  const both = await call('PATCH', `/tickets/${t.id}`, { status: 'closed', priority: 'high' });
  assert.equal(both.body.status, 'closed');
  assert.equal(both.body.priority, 'high');
  assert.equal(both.body.title, 'fix me');
});

test('PATCH /tickets/:id rejects bad bodies and returns 404 for unknown ids', async () => {
  const { body: t } = await create('target');

  const empty = await call('PATCH', `/tickets/${t.id}`, {});
  assert.equal(empty.status, 400);

  const extra = await call('PATCH', `/tickets/${t.id}`, { title: 'renamed' });
  assert.equal(extra.status, 400);
  assert.equal(extra.body.details.title, 'cannot be updated');

  const mixed = await call('PATCH', `/tickets/${t.id}`, { status: 'closed', description: 'x' });
  assert.equal(mixed.status, 400);

  const badValue = await call('PATCH', `/tickets/${t.id}`, { status: 'done' });
  assert.equal(badValue.status, 400);

  const notObject = await call('PATCH', `/tickets/${t.id}`, [1]);
  assert.equal(notObject.status, 400);

  const unknown = await call('PATCH', '/tickets/00000000-0000-4000-8000-000000000000', { status: 'closed' });
  assert.equal(unknown.status, 404);

  const malformedId = await call('PATCH', '/tickets/not-a-uuid', { status: 'closed' });
  assert.equal(malformedId.status, 404);

  const unchanged = await call('GET', '/tickets');
  assert.equal(unchanged.body.data[0].title, 'target');
  assert.equal(unchanged.body.data[0].status, 'open');
});

test('GET /tickets/stats counts every status, including zeros', async () => {
  assert.deepEqual((await call('GET', '/tickets/stats')).body, { open: 0, in_progress: 0, closed: 0 });

  const a = await create('a');
  await create('b');
  await create('c');
  await call('PATCH', `/tickets/${a.body.id}`, { status: 'closed' });

  const stats = await call('GET', '/tickets/stats');
  assert.equal(stats.status, 200);
  assert.deepEqual(stats.body, { open: 2, in_progress: 0, closed: 1 });
});
