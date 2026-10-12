export type Status = 'open' | 'in_progress' | 'closed';
export type Priority = 'low' | 'medium' | 'high';

export const STATUSES: Status[] = ['open', 'in_progress', 'closed'];
export const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

export const STATUS_LABELS: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
};

export interface Ticket {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  created_at: string;
}

export interface TicketList {
  data: Ticket[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type Stats = Record<Status, number>;

export interface NewTicket {
  title: string;
  description?: string;
  priority: Priority;
}
