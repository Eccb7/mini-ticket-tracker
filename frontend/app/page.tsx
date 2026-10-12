'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, createTicket, getStats, listTickets, updateTicket } from '@/lib/api';
import {
  PRIORITIES,
  STATUSES,
  STATUS_LABELS,
  type Priority,
  type Stats,
  type Status,
  type TicketList,
} from '@/lib/types';

const PAGE_SIZE = 5;

export default function Home() {
  const [filter, setFilter] = useState<Status | ''>('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<TicketList | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Ignore responses from superseded requests (fast filter or page changes).
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const [tickets, counts] = await Promise.all([
        listTickets({ status: filter || undefined, page, limit: PAGE_SIZE }),
        getStats(),
      ]);
      if (id !== requestId.current) return;
      if (tickets.data.length === 0 && page > 1 && tickets.totalPages > 0) {
        setPage(tickets.totalPages); // the last row on this page went away; effect reloads
        return;
      }
      setList(tickets);
      setStats(counts);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setError(null);
    try {
      await createTicket({ title, description: description || undefined, priority });
      setTitle('');
      setDescription('');
      setPriority('medium');
      // Newest tickets are on page 1; if already there, load() has to be called directly.
      if (page === 1) await load();
      else setPage(1);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.details);
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onStatusChange(id: string, status: Status) {
    setUpdatingId(id);
    setError(null);
    try {
      await updateTicket(id, { status });
      await load();
    } catch (err) {
      // The select is controlled by the stored ticket, so not updating it reverts the dropdown.
      setError(err instanceof Error ? `Could not update ticket: ${err.message}` : 'Update failed');
    } finally {
      setUpdatingId(null);
    }
  }

  const tickets = list?.data ?? [];
  const totalPages = Math.max(list?.totalPages ?? 1, 1);

  return (
    <main className="container">
      <h1>Mini Ticket Tracker</h1>

      <section className="stats" aria-label="Ticket counts">
        {STATUSES.map((s) => (
          <div key={s} className="stat">
            <span className="stat-count">{stats ? stats[s] : '-'}</span>
            <span className="stat-label">{STATUS_LABELS[s]}</span>
          </div>
        ))}
      </section>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <section className="card">
        <h2>New ticket</h2>
        <form onSubmit={onCreate} className="form">
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              aria-invalid={Boolean(fieldErrors.title)}
            />
            {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
          </label>
          <label>
            Description (optional)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            {fieldErrors.description && <span className="field-error">{fieldErrors.description}</span>}
          </label>
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create ticket'}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="list-header">
          <h2>Tickets</h2>
          <label className="inline">
            Status
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as Status | '');
                setPage(1);
              }}
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && !list ? (
          <p className="muted">Loading...</p>
        ) : tickets.length === 0 ? (
          <p className="muted">{filter ? 'No tickets with this status.' : 'No tickets yet. Create one above.'}</p>
        ) : (
          <ul className={loading ? 'tickets dim' : 'tickets'}>
            {tickets.map((t) => (
              <li key={t.id} className="ticket">
                <div className="ticket-main">
                  <strong>{t.title}</strong>
                  {t.description && <p className="desc">{t.description}</p>}
                  <span className="muted small">{new Date(t.created_at).toLocaleString()}</span>
                </div>
                <div className="ticket-meta">
                  <span className={`badge priority-${t.priority}`}>{t.priority}</span>
                  <select
                    aria-label={`Status of ${t.title}`}
                    value={t.status}
                    disabled={updatingId === t.id}
                    onChange={(e) => onStatusChange(t.id, e.target.value as Status)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="pager">
          <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || loading}>
            Previous
          </button>
          <span>
            Page {list?.page ?? page} of {totalPages}
          </span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages || loading}>
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
