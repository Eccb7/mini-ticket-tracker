const STATUSES = ['open', 'in_progress', 'closed'];
const PRIORITIES = ['low', 'medium', 'high'];
const TITLE_MAX = 200;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Every parser returns { value } on success or { details } (field -> reason) on failure.

function parseCreate(body) {
  if (!isPlainObject(body)) return { details: { body: 'must be a JSON object' } };
  const details = {};
  const allowed = ['title', 'description', 'priority'];
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) details[key] = 'is not allowed';
  }

  let title;
  if (typeof body.title !== 'string') {
    details.title = 'is required and must be a string';
  } else {
    title = body.title.trim();
    if (title.length === 0) details.title = 'must not be blank';
    else if (title.length > TITLE_MAX) details.title = `must be at most ${TITLE_MAX} characters`;
  }

  let description = null;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') details.description = 'must be a string';
    else description = body.description;
  }

  let priority = 'medium';
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) details.priority = `must be one of: ${PRIORITIES.join(', ')}`;
    else priority = body.priority;
  }

  if (Object.keys(details).length) return { details };
  return { value: { title, description, priority } };
}

function parsePatch(body) {
  if (!isPlainObject(body)) return { details: { body: 'must be a JSON object' } };
  const keys = Object.keys(body);
  if (keys.length === 0) return { details: { body: 'must include status and/or priority' } };

  const details = {};
  for (const key of keys) {
    if (key !== 'status' && key !== 'priority') details[key] = 'cannot be updated';
  }
  if ('status' in body && !STATUSES.includes(body.status)) {
    details.status = `must be one of: ${STATUSES.join(', ')}`;
  }
  if ('priority' in body && !PRIORITIES.includes(body.priority)) {
    details.priority = `must be one of: ${PRIORITIES.join(', ')}`;
  }

  if (Object.keys(details).length) return { details };
  return { value: body };
}

function parsePositiveInt(raw, field, fallback, details) {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1) {
    details[field] = 'must be a positive integer';
    return fallback;
  }
  return Number(raw);
}

// Garbage values are rejected with 400. A limit above the maximum is clamped, not rejected.
function parseListQuery(query) {
  const details = {};

  let status;
  if (query.status !== undefined && query.status !== '') {
    if (typeof query.status !== 'string' || !STATUSES.includes(query.status)) {
      details.status = `must be one of: ${STATUSES.join(', ')}`;
    } else {
      status = query.status;
    }
  }

  const page = parsePositiveInt(query.page, 'page', DEFAULT_PAGE, details);
  const limit = Math.min(parsePositiveInt(query.limit, 'limit', DEFAULT_LIMIT, details), MAX_LIMIT);

  if (Object.keys(details).length) return { details };
  return { value: { status, page, limit } };
}

const isUuid = (id) => UUID_RE.test(id);

module.exports = { STATUSES, PRIORITIES, parseCreate, parsePatch, parseListQuery, isUuid };
