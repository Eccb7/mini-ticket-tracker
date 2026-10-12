import type { NewTicket, Priority, Stats, Status, Ticket, TicketList } from './types';

const BASE = '/api';

export class ApiError extends Error {
  details: Record<string, string>;

  constructor(message: string, details: Record<string, string> = {}) {
    super(message);
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the server');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, body?.details ?? {});
  }
  return body as T;
}

export function listTickets(params: { status?: Status; page: number; limit: number }) {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.status) query.set('status', params.status);
  return request<TicketList>(`/tickets?${query}`);
}

export const getStats = () => request<Stats>('/tickets/stats');

export const createTicket = (ticket: NewTicket) =>
  request<Ticket>('/tickets', { method: 'POST', body: JSON.stringify(ticket) });

export const updateTicket = (id: string, patch: { status?: Status; priority?: Priority }) =>
  request<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
