'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, Mail, RefreshCw, Search, Send, Users, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { NativeSelect } from '../components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';

type RecordData = Record<string, any>;
export type MailTarget = { eventId: string; registrationIds?: string[]; recipientStatus?: string; query?: string };
const attendeeStatuses = [['all', 'All attendees'], ['confirmed', 'Confirmed'], ['awaiting_payment', 'Awaiting payment'], ['payment_review', 'Payment review']];
const label = (status: string) => status.replaceAll('_', ' ');
const moment = (value: string) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const matchesAttendee = (r: RecordData, query: string) => [r.name, r.email, r.phone, r.organization].join(' ').toLowerCase().includes(query.trim().toLowerCase());
const pause = () => new Promise(resolve => setTimeout(resolve, 600));
async function mailRequest(body: RecordData) {
  const response = await fetch('/api/hub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result: RecordData = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not send. Please try again.');
  return result;
}
function Status({ value }: { value: string }) { return <span className={'status ' + value}>{label(value)}</span>; }
function EventOptions({ events }: { events: RecordData[] }) { return <>{events.map(e => <option key={e.id} value={e.id}>{e.title}{e.published ? '' : ' · Draft'}</option>)}</>; }
function exportAttendees(rows: RecordData[], events: RecordData[], eventId: string) {
  const cells = [['Event', 'Name', 'Email', 'Phone', 'Organization', 'Status', 'Payment reference', 'Registered'], ...rows.map(r => [events.find(e => e.id === r.event_id)?.title, r.name, r.email, r.phone, r.organization, r.status, r.payment_ref, r.created_at])];
  const csv = cells.map(row => row.map(value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url;
  const title = events.find(e => e.id === eventId)?.title || 'all-events';
  a.download = 'thon-hub-' + title.replace(/[^a-z0-9]+/gi, '-').slice(0, 60) + '-attendees.csv';
  a.click(); URL.revokeObjectURL(url);
}

export function AdminCommunications({ tab, data, eventId, onEventChange, onCompose, onAction, busy, onComplete }: {
  tab: string; data: RecordData; eventId: string; onEventChange: (id: string) => void;
  onCompose: (target: MailTarget) => void; onAction: (body: RecordData) => Promise<boolean>; busy: boolean;
  onComplete: (message: string, eventId?: string) => Promise<void> | void;
}) {
  const [attendeeStatus, setAttendeeStatus] = useState('all'), [attendeeQuery, setAttendeeQuery] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('all'), [recipientStatus, setRecipientStatus] = useState('all');
  const [messageType, setMessageType] = useState('all'), [messageQuery, setMessageQuery] = useState(''), [page, setPage] = useState(1);
  const [messages, setMessages] = useState<RecordData>({ outbox: [], total: 0, page: 1, pages: 1, sendableCount: 0 });
  const [fetching, setFetching] = useState(true), [error, setError] = useState(''), [sending, setSending] = useState(false), [progress, setProgress] = useState(''), [refresh, setRefresh] = useState(0);
  const scope = { eventId, deliveryStatus, recipientStatus, messageType, query: messageQuery };
  useEffect(() => {
    if (tab !== 'Messages') return;
    const controller = new AbortController(); setFetching(true); setError('');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ scope: 'admin', section: 'messages', ...scope, page: String(page) });
        const response = await fetch('/api/hub?' + params, { signal: controller.signal });
        const result: RecordData = await response.json(); if (!response.ok) throw new Error(result.error);
        setMessages(result);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load messages.'); }
      finally { if (!controller.signal.aborted) setFetching(false); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tab, eventId, deliveryStatus, recipientStatus, messageType, messageQuery, page, refresh, data]);
  const attendees = (data.registrations as RecordData[]).filter(r => (!eventId || r.event_id === eventId) && (attendeeStatus === 'all' || r.status === attendeeStatus) && matchesAttendee(r, attendeeQuery));
  const event = data.events.find((e: RecordData) => e.id === eventId);
  const changeEvent = (id: string) => { onEventChange(id); setPage(1); setProgress(''); };
  async function sendPending() {
    if (!eventId || sending) return;
    setSending(true); setError(''); let sent = 0;
    try {
      let result;
      do {
        result = await mailRequest({ action: 'dispatchEventMail', ...scope }); sent += result.sent;
        setProgress(sent + ' emails accepted by the provider…');
        if (result.hasMore && !result.failed && result.sent > 0) await pause();
        else break;
      } while (result.hasMore);
      const message = result.failed ? (sent ? sent + ' emails accepted. ' : '') + result.message : sent ? sent + ' emails accepted for ' + event.title + '.' : result.message;
      setProgress(message); await onComplete(message); setRefresh(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Delivery paused. Retry from this event’s Messages view.'); setRefresh(v => v + 1); }
    finally { setSending(false); }
  }
  function reset() {
    onEventChange(''); setAttendeeStatus('all'); setAttendeeQuery(''); setDeliveryStatus('all'); setRecipientStatus('all'); setMessageType('all'); setMessageQuery(''); setPage(1); setProgress('');
  }
  return <section className="mail-workspace" aria-label={tab + ' management'}>
    <div className="mail-section-heading"><div><p className="eyebrow">{tab === 'Attendees' ? 'FIND YOUR PEOPLE' : 'KEEP EVERY EVENT IN THE LOOP'}</p><h2>{tab === 'Attendees' ? 'Attendees' : 'Event messages'}</h2><p>{tab === 'Attendees' ? 'Filter the list, export it, or email an event’s selected attendees.' : 'Compose updates whenever you need them and track each recipient’s send status.'}</p></div><Button className="primary" disabled={!data.events.length || sending} onClick={() => onCompose({ eventId })}><Mail size={17} />Compose event email</Button></div>
    {tab === 'Messages' && <div className={'mail-service-note ' + (data.emailConfigured ? 'connected' : '')}><Mail size={24} /><div><h3>{data.emailConfigured ? 'Email delivery connected' : 'Email delivery needs a sender connection'}</h3><p>{data.emailConfigured ? 'Sending from ' + data.emailSender + '. Each attendee receives a separate email. “Sent” means accepted by the provider.' : 'You can compose and queue event emails now. Connect a verified sender and an email-service key before sending. Saved messages stay here until you send them.'}</p>{!data.emailConfigured && <details><summary>How to connect delivery</summary><p>In this Site’s environment settings, add <code>RESEND_API_KEY</code> as a secret and <code>EMAIL_FROM</code> as your verified sender, then publish. Return here, choose an event and send its due messages.</p><a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">Verify your sender domain <span aria-hidden="true">↗</span></a></details>}</div></div>}
    <div className="mail-filter-panel"><fieldset disabled={sending}><div className={'mail-filters ' + (tab === 'Messages' ? 'message-filters' : '')}>
      <label>Event<NativeSelect value={eventId} onChange={e => changeEvent(e.target.value)}><option value="">All events</option><EventOptions events={data.events} /></NativeSelect></label>
      <label>{tab === 'Attendees' ? 'Attendee status' : 'Recipient status'}<NativeSelect value={tab === 'Attendees' ? attendeeStatus : recipientStatus} onChange={e => { tab === 'Attendees' ? setAttendeeStatus(e.target.value) : setRecipientStatus(e.target.value); setPage(1); }}>{attendeeStatuses.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</NativeSelect></label>
      {tab === 'Messages' && <><label>Delivery<NativeSelect value={deliveryStatus} onChange={e => { setDeliveryStatus(e.target.value); setPage(1); }}><option value="all">All delivery statuses</option>{['queued', 'sent', 'failed', 'sending', 'expired', 'cancelled', 'review'].map(s => <option key={s} value={s}>{label(s)}</option>)}</NativeSelect></label><label>Message type<NativeSelect value={messageType} onChange={e => { setMessageType(e.target.value); setPage(1); }}><option value="all">All messages</option><option value="bulk">Event email</option><option value="reminder">Reminder</option></NativeSelect></label></>}
      <label className="mail-search">{tab === 'Attendees' ? 'Search attendees' : 'Find a recipient or subject'}<div><Search size={17} /><Input type="search" placeholder={tab === 'Attendees' ? 'Name, email, phone or organization' : 'Name, email or email subject'} value={tab === 'Attendees' ? attendeeQuery : messageQuery} onChange={e => { tab === 'Attendees' ? setAttendeeQuery(e.target.value) : setMessageQuery(e.target.value); setPage(1); }} /></div></label>
    </div><Button className="mail-reset" onClick={reset}>Reset filters</Button></fieldset></div>
    <div className="mail-results-bar"><span role="status">{tab === 'Attendees' ? attendees.length + ' attendees' : fetching ? 'Loading messages…' : messages.total + ' messages'}{event ? ' · ' + event.title : ' · All events'}</span><div className="button-row">{tab === 'Attendees' ? <><Button className="outline" disabled={!attendees.length} onClick={() => exportAttendees(attendees, data.events, eventId)}><Download size={16} />Export filtered CSV</Button><Button className="outline" disabled={!eventId || !attendees.length} title={!eventId ? 'Choose one event to email its filtered attendees' : undefined} onClick={() => onCompose({ eventId, registrationIds: attendees.map(r => r.id), recipientStatus: attendeeStatus, query: attendeeQuery })}><Send size={16} />Email filtered attendees</Button></> : <Button className="outline" disabled={sending || fetching || !eventId || !data.emailConfigured || !messages.sendableCount} title={!eventId ? 'Choose one event to send its messages' : !data.emailConfigured ? 'Connect email delivery first' : undefined} onClick={sendPending}><RefreshCw size={16} />{sending ? 'Sending…' : 'Send due in this view'}</Button>}</div></div>
    {tab === 'Messages' && !eventId && <p className="mail-hint">Choose an event to send or retry its due emails.</p>}
    {(progress || error) && <p className="inline-notice" role="status">{error || progress}</p>}
    {tab === 'Attendees' ? <div className="table-wrap"><Table className="mail-table"><TableHeader><TableRow><TableHead>Attendee</TableHead><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Payment reference</TableHead><TableHead>Action</TableHead></TableRow></TableHeader><TableBody>{attendees.map(r => <TableRow key={r.id}><TableCell><b>{r.name}</b><small>{r.email}</small>{r.phone && <small>{r.phone}</small>}{r.organization && <small>{r.organization}</small>}</TableCell><TableCell>{data.events.find((e: RecordData) => e.id === r.event_id)?.title}</TableCell><TableCell><Status value={r.status} /></TableCell><TableCell>{r.payment_ref || '—'}</TableCell><TableCell>{r.status === 'payment_review' ? <Button className="outline" disabled={busy} onClick={() => onAction({ action: 'verifyPayment', registrationId: r.id })}><Check size={16} />Verify payment</Button> : '—'}</TableCell></TableRow>)}</TableBody></Table>{!attendees.length && <div className="empty"><Users size={32} /><h3>No attendees in this view</h3><p>Try another event or clear your filters.</p></div>}</div> : fetching ? <div className="loading">Loading event messages…</div> : error ? <Button className="outline" onClick={() => setRefresh(v => v + 1)}>Reload messages</Button> : <><div className="table-wrap"><Table className="mail-table"><TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Event & message</TableHead><TableHead>Due / sent (IST)</TableHead><TableHead>Send status</TableHead></TableRow></TableHeader><TableBody>{messages.outbox.map((m: RecordData) => <TableRow key={m.id}><TableCell><b>{m.name}</b><small>{m.email}</small><small>{label(m.registration_status)}</small></TableCell><TableCell><span className="mail-event-name">{m.event_title}</span><b>{m.subject}</b><small>{m.kind === 'reminder' ? 'One-hour reminder' : 'Event email'}{m.include_join_link ? ' · Joining link included' : ''}</small><details className="mail-message-details"><summary>View message</summary><pre>{m.body}</pre></details></TableCell><TableCell>{moment(m.due_at)}{m.sent_at && <small>Sent {moment(m.sent_at)}</small>}</TableCell><TableCell><Status value={m.status} />{m.requires_confirmation && m.registration_status !== 'confirmed' && m.status === 'queued' && <small>Waiting for attendee confirmation</small>}{m.error && <small className="mail-error">{m.error}</small>}</TableCell></TableRow>)}</TableBody></Table>{!messages.total && <div className="empty"><Mail size={32} /><h3>No messages in this view</h3><p>Compose an event email or clear the filters to see other messages.</p></div>}</div>{messages.pages > 1 && <div className="mail-pagination"><Button className="outline" disabled={messages.page <= 1 || sending} onClick={() => setPage(messages.page - 1)}><ChevronLeft size={16} />Previous</Button><span>Page {messages.page} of {messages.pages}</span><Button className="outline" disabled={messages.page >= messages.pages || sending} onClick={() => setPage(messages.page + 1)}>Next<ChevronRight size={16} /></Button></div>}</>}
  </section>;
}

export function BulkMailDialog({ target, data, onClose, onComplete }: {
  target: MailTarget; data: RecordData; onClose: () => void; onComplete: (message: string, eventId?: string) => Promise<void> | void;
}) {
  const [eventId, setEventId] = useState(target.eventId), [status, setStatus] = useState(target.recipientStatus || 'all'), [query, setQuery] = useState(target.query || '');
  const [selection, setSelection] = useState<Set<string> | null>(target.registrationIds ? new Set(target.registrationIds) : null);
  const [includeLink, setIncludeLink] = useState(false), [subject, setSubject] = useState(target.eventId ? 'Update: ' + data.events.find((e: RecordData) => e.id === target.eventId)?.title : ''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const requestId = useRef('');
  const event = data.events.find((e: RecordData) => e.id === eventId);
  const audience = (data.registrations as RecordData[]).filter(r => r.event_id === eventId && (status === 'all' || r.status === status) && (!includeLink || r.status === 'confirmed') && matchesAttendee(r, query));
  const recipients = audience.filter(r => selection === null || selection.has(r.id));
  const allChecked = audience.length > 0 && recipients.length === audience.length;
  const linkReady = !!event?.published && !!event?.join_url;
  const preview = 'Hello ' + (recipients[0]?.name || 'attendee') + ',\n\n' + (message || 'Your event update will appear here.') + '\n\nPowered by Edutantr' + (includeLink && event?.join_url ? '\n\nJoin your event: ' + event.join_url : '');
  const changeAudience = () => { setSelection(null); requestId.current = ''; setError(''); };
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || !eventId || !recipients.length) return;
    setBusy(true); setError(''); setProgress('Saving ' + recipients.length + ' event emails…');
    if (!requestId.current) requestId.current = crypto.randomUUID();
    let sent = 0;
    try {
      let result = await mailRequest({ action: 'bulkSend', eventId, registrationIds: recipients.map(r => r.id), subject, message, includeJoinLink: includeLink, requestId: requestId.current });
      sent += result.sent;
      while (result.configured && result.hasMore && !result.failed && result.sent > 0) {
        setProgress(sent + ' of ' + recipients.length + ' emails accepted. Keep this window open while sending…');
        await pause();
        result = await mailRequest({ action: 'dispatchEventMail', eventId, kind: result.kind || 'bulk-' + requestId.current });
        sent += result.sent;
      }
      const summary = !result.configured ? result.message : result.failed ? (sent ? sent + ' emails accepted. ' : '') + result.message : sent ? sent + ' emails accepted for ' + event.title + '.' : result.message;
      await onComplete(summary, eventId); onClose();
    } catch (e) { setError((sent ? sent + ' emails accepted. ' : '') + (e instanceof Error ? e.message : 'Sending paused. Retry from Messages.')); setProgress('Messages already saved can be continued from this event’s Messages view.'); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="mail-dialog" showCloseButton={false} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => e.preventDefault()}><Button className="icon-button mail-dialog-close" disabled={busy} aria-label="Close email composer" onClick={onClose}><X size={22} /></Button><DialogHeader><p className="eyebrow"><Mail size={16} />EVENT COMMUNICATIONS</p><DialogTitle>One event. Your message.</DialogTitle><DialogDescription>Choose the attendees, write your update, and review it before sending.</DialogDescription></DialogHeader>
    <form onSubmit={submit}><fieldset disabled={busy}><div className="mail-compose-grid"><div className="mail-compose-fields">
      <label>Event<NativeSelect required value={eventId} onChange={e => { setEventId(e.target.value); setSubject('Update: ' + data.events.find((event: RecordData) => event.id === e.target.value)?.title); setIncludeLink(false); changeAudience(); }}><option value="">Choose an event</option><EventOptions events={data.events} /></NativeSelect></label>
      <div className="mail-audience-filters"><label>Attendees<NativeSelect value={status} onChange={e => { setStatus(e.target.value); changeAudience(); }} disabled={includeLink}>{attendeeStatuses.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</NativeSelect></label><label>Search attendees<Input type="search" placeholder="Name or email…" value={query} onChange={e => { setQuery(e.target.value); changeAudience(); }} /></label></div>
      <div className="mail-recipient-heading"><label className="mail-check-label"><Checkbox className="mail-checkbox" checked={allChecked ? true : recipients.length ? 'indeterminate' : false} disabled={!audience.length} onCheckedChange={checked => { setSelection(checked ? null : new Set()); requestId.current = ''; }} />Select all matches</label><span>{recipients.length} of {audience.length} selected</span></div>
      <div className="mail-recipients" aria-label="Choose email recipients">{audience.map(r => <label className="mail-recipient" key={r.id}><Checkbox className="mail-checkbox" checked={selection === null || selection.has(r.id)} onCheckedChange={checked => { const next = new Set(selection === null ? audience.map(r => r.id) : selection); checked ? next.add(r.id) : next.delete(r.id); setSelection(next); requestId.current = ''; }} /><span><b>{r.name}</b><small>{r.email}</small></span><Status value={r.status} /></label>)}{!audience.length && <p>{eventId ? 'No attendees match these filters.' : 'Choose an event to see its attendees.'}</p>}</div>
      <label>Subject<Input required maxLength={150} value={subject} placeholder="An update about your event" onChange={e => { setSubject(e.target.value); requestId.current = ''; }} /></label>
      <label>Message<Textarea required maxLength={5000} rows={6} value={message} placeholder="Share event updates, instructions, reminders or a thank-you…" onChange={e => { setMessage(e.target.value); requestId.current = ''; }} /><small>A personal greeting and the Edutantr signature are added automatically.</small></label>
      <label className="mail-check-label"><Checkbox className="mail-checkbox" checked={includeLink} disabled={!linkReady} onCheckedChange={checked => { setIncludeLink(!!checked); if (checked) setStatus('confirmed'); changeAudience(); }} />Include the event joining link</label><p className="mail-hint">{includeLink ? 'Joining links are sent to confirmed attendees only.' : linkReady ? 'Turn this on to add the joining link for confirmed attendees.' : 'Add a joining link to the published event to enable this option.'}</p>
    </div><aside className="mail-preview"><div className="mail-preview-heading"><span>EMAIL PREVIEW</span><Mail size={20} /></div><dl><div><dt>Event</dt><dd>{event?.title || 'Choose an event'}</dd></div><div><dt>To</dt><dd>{recipients.length} selected {recipients.length === 1 ? 'attendee' : 'attendees'}</dd></div><div><dt>Subject</dt><dd>{subject || 'Add a subject'}</dd></div></dl><pre>{preview}</pre><p>Each attendee receives a separate email with their own greeting.</p>{!data.emailConfigured && <div className="mail-queue-note"><b>Delivery is not connected</b><p>This email will be saved in the queue. Connect the sender, then send it from Messages.</p></div>}</aside></div></fieldset>
      {(error || progress) && <p className="inline-notice" role="status" aria-live="polite">{error || progress}</p>}
      <div className="mail-compose-footer"><span><Users size={17} />{recipients.length} recipients · {event?.title || 'Choose an event'}</span><div className="button-row"><Button type="button" className="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" className="primary" disabled={busy || !eventId || !recipients.length || recipients.length > 10000}><Send size={17} />{busy ? 'Preparing…' : data.emailConfigured ? 'Send to ' + recipients.length + ' attendees' : 'Queue ' + recipients.length + ' emails'}</Button></div></div>
    </form></DialogContent></Dialog>;
}
