'use client';

import { useEffect, useRef } from 'react';

type EventRecord = Record<string, any>;
type Filters = { query: string; category: string; fee: string };
type Bridge = {
  events: EventRecord[];
  ready: boolean;
  applyFilters: (filters: Filters) => void;
  openEvent: (event: EventRecord) => void;
};

const categories = ['All events', 'Workshop', 'Webinar', 'Hackathon', 'Event'];
const fees = ['All', 'Free', 'Paid'];

function validateFilters(value: unknown): Filters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Supply an object with optional query, category and fee fields.');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['query', 'category', 'fee'].includes(key))) {
    throw new Error('Unknown filter field.');
  }
  const query = input.query ?? '';
  const category = input.category ?? 'All events';
  const fee = input.fee ?? 'All';
  if (typeof query !== 'string' || query.length > 200 ||
      typeof category !== 'string' || !categories.includes(category) ||
      typeof fee !== 'string' || !fees.includes(fee)) {
    throw new Error('Use a valid query, event category and fee filter.');
  }
  return { query, category, fee };
}

function matches(events: EventRecord[], filters: Filters) {
  return events.filter(event =>
    (filters.category === 'All events' || event.category === filters.category) &&
    `${event.title} ${event.description}`.toLowerCase().includes(filters.query.toLowerCase()) &&
    (filters.fee === 'All' || (filters.fee === 'Free' ? event.price === 0 : event.price > 0))
  );
}

function summarize(events: EventRecord[]) {
  return events.map(event => ({
    id: event.id, title: event.title, category: event.category,
    startsAt: event.starts_at, feeINR: event.price, preview: !!event.preview,
  }));
}

const afterPaint = () => new Promise<void>(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
);

export function useEventTools(enabled: boolean, bridge: Bridge) {
  const current = useRef(bridge);
  current.current = bridge;
  useEffect(() => {
    if (!enabled) return;
    const context = (document as Document & { modelContext?: any }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const filtersSchema = {
      type: 'object', additionalProperties: false,
      properties: {
        query: { type: 'string', maxLength: 200 },
        category: { type: 'string', enum: categories },
        fee: { type: 'string', enum: fees },
      },
    };
    const ready = () => {
      if (!current.current.ready) throw new Error('The event catalog is not available yet.');
      return current.current;
    };
    const tools = [
      {
        name: 'find_events', title: 'Find Thon Hub events',
        description: 'Read matching events from the loaded catalog without changing the page.',
        inputSchema: filtersSchema,
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input: unknown) {
          return { events: summarize(matches(ready().events, validateFilters(input))) };
        },
      },
      {
        name: 'filter_events', title: 'Filter the event catalog',
        description: 'Apply the visible search, category and fee filters. This does not register an attendee.',
        inputSchema: filtersSchema,
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input: unknown) {
          const filters = validateFilters(input);
          const state = ready();
          state.applyFilters(filters);
          await afterPaint();
          return { filters, events: summarize(matches(current.current.events, filters)) };
        },
      },
      {
        name: 'open_event_details', title: 'Open event details',
        description: 'Open an event’s visible detail panel, including any mentor portfolio. No registration is submitted.',
        inputSchema: {
          type: 'object', additionalProperties: false,
          properties: { eventId: { type: 'string', minLength: 1 } }, required: ['eventId'],
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input: unknown) {
          if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new Error('Supply an eventId.');
          }
          const value = input as Record<string, unknown>;
          if (typeof value.eventId !== 'string' || Object.keys(value).some(key => key !== 'eventId')) {
            throw new Error('Supply a valid eventId.');
          }
          const state = ready();
          const event = state.events.find(item => item.id === value.eventId);
          if (!event) throw new Error('Event not found in the current catalog.');
          state.openEvent(event);
          await afterPaint();
          return { eventId: event.id, title: event.title, opened: true, preview: !!event.preview };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal }))
          .catch(() => {});
      } catch { /* Standard UI remains available in unsupported contexts. */ }
    }
    return () => lifecycle.abort();
  }, [enabled]);
}
