const express = require('express');
const { STATUSES, parseCreate, parsePatch, parseListQuery, isUuid } = require('./validation');

const COLUMNS = 'id, title, description, status, priority, created_at';

function validationError(res, details) {
  return res.status(400).json({ error: 'Validation failed', details });
}

function createApp(pool) {
  const app = express();
  app.use(express.json());

  app.post('/tickets', async (req, res) => {
    const { value, details } = parseCreate(req.body);
    if (details) return validationError(res, details);

    const { rows } = await pool.query(
      `INSERT INTO tickets (title, description, priority) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
      [value.title, value.description, value.priority],
    );
    res.status(201).json(rows[0]);
  });

  app.get('/tickets', async (req, res) => {
    const { value, details } = parseListQuery(req.query);
    if (details) return validationError(res, details);

    const { status, page, limit } = value;
    const where = status ? 'WHERE status = $1' : '';
    const filterParams = status ? [status] : [];
    const n = filterParams.length;

    const [count, list] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total FROM tickets ${where}`, filterParams),
      pool.query(
        `SELECT ${COLUMNS} FROM tickets ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT $${n + 1} OFFSET $${n + 2}`,
        [...filterParams, limit, (page - 1) * limit],
      ),
    ]);

    const total = count.rows[0].total;
    res.json({ data: list.rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  // Must be declared before /tickets/:id so "stats" is not treated as an id.
  app.get('/tickets/stats', async (req, res) => {
    const { rows } = await pool.query('SELECT status, count(*)::int AS count FROM tickets GROUP BY status');
    const stats = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const row of rows) stats[row.status] = row.count;
    res.json(stats);
  });

  app.patch('/tickets/:id', async (req, res) => {
    // Unknown and malformed ids are both 404; checking first avoids a pg cast error.
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Ticket not found' });

    const { value, details } = parsePatch(req.body);
    if (details) return validationError(res, details);

    // Column names come from the validated allowlist (status/priority), values are parameters.
    const fields = Object.keys(value);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `UPDATE tickets SET ${setClause} WHERE id = $${fields.length + 1} RETURNING ${COLUMNS}`,
      [...fields.map((f) => value[f]), req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json(rows[0]);
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON', details: { body: 'could not be parsed as JSON' } });
    }
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
