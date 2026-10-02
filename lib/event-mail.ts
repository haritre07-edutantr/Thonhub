import { config, db } from './hub';

export type MailScope = {
  eventId: string;
  kind?: string;
  recipientStatus?: string;
  query?: string;
  deliveryStatus?: string;
  messageType?: string;
};
const registrationStatuses = ['confirmed', 'awaiting_payment', 'payment_review'];
const deliveryStatuses = ['queued', 'failed', 'sent', 'sending', 'expired', 'cancelled', 'review'];
const joins = ' FROM mail m JOIN registrations r ON r.id=m.registration_id JOIN events e ON e.id=r.event_id';
const fields = 'm.*,r.name,r.email,r.status AS registration_status,r.event_id,e.title AS event_title,e.published,e.join_url,e.starts_at';
const eligible = "(m.requires_confirmation=0 OR (r.status='confirmed' AND e.published=1)) AND (m.kind!='reminder' OR e.starts_at>?)";

function filters(scope: Partial<MailScope>) {
  const clauses: string[] = [], values: string[] = [];
  if (scope.eventId) { clauses.push('r.event_id=?'); values.push(scope.eventId); }
  if (scope.kind) { clauses.push('m.kind=?'); values.push(scope.kind); }
  if (scope.recipientStatus && scope.recipientStatus !== 'all') {
    if (!registrationStatuses.includes(scope.recipientStatus)) throw new Error('Select a valid attendee status.');
    clauses.push('r.status=?'); values.push(scope.recipientStatus);
  }
  if (scope.deliveryStatus && scope.deliveryStatus !== 'all') {
    if (!deliveryStatuses.includes(scope.deliveryStatus)) throw new Error('Select a valid delivery status.');
    clauses.push('m.status=?'); values.push(scope.deliveryStatus);
  }
  if (scope.messageType && scope.messageType !== 'all') {
    if (!['reminder', 'bulk'].includes(scope.messageType)) throw new Error('Select a valid message type.');
    clauses.push(scope.messageType === 'reminder' ? "m.kind='reminder'" : "m.kind LIKE 'bulk-%'");
  }
  const query = String(scope.query || '').trim().toLowerCase().slice(0, 200);
  if (query) {
    clauses.push("instr(lower(r.name || ' ' || r.email || ' ' || r.phone || ' ' || r.organization || ' ' || m.subject),?)>0"); values.push(query);
  }
  return { where: clauses.length ? clauses.join(' AND ') : '1=1', values };
}

export async function listMessages(scope: Partial<MailScope>, requestedPage = 1) {
  const { where, values } = filters(scope), now = new Date().toISOString();
  const total = Number((await db().prepare('SELECT COUNT(*) AS n' + joins + ' WHERE ' + where).bind(...values).first<any>())?.n || 0);
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), Math.max(1, Math.ceil(total / 50)));
  const outbox = (await db().prepare('SELECT ' + fields + joins + ' WHERE ' + where + ' ORDER BY m.created_at DESC,m.id LIMIT 50 OFFSET ?').bind(...values, (page - 1) * 50).all()).results;
  const sendableCount = Number((await db().prepare('SELECT COUNT(*) AS n' + joins + ' WHERE ' + where + " AND m.status IN ('queued','failed') AND m.due_at<=? AND " + eligible).bind(...values, now, now).first<any>())?.n || 0);
  return { outbox, total, page, pages: Math.max(1, Math.ceil(total / 50)), sendableCount };
}

function payloadFor(rows: any[], sender: string) {
  return rows.map(m => ({ from: sender, to: [m.email], subject: m.subject,
    text: m.body + (m.include_join_link ? (m.join_url ? '\n\nJoin your event: ' + m.join_url : '\n\nYour joining link will appear in My events when available.') : '') }));
}
async function dispatchRows(id: string) {
  return (await db().prepare('SELECT ' + fields + joins + ' WHERE m.dispatch_id=? ORDER BY m.id').bind(id).all()).results as any[];
}
async function setDispatchStatus(id: string, status: string, error = '') {
  const now = new Date().toISOString();
  await db().batch([
    db().prepare('UPDATE mail_dispatches SET status=?,error=?,updated_at=? WHERE id=?').bind(status, error, now, id),
    db().prepare("UPDATE mail SET status=?,error=? WHERE dispatch_id=? AND status!='sent'").bind(status, error, id),
  ]);
}

// A saved payload and provider idempotency key make an interrupted request retryable.
// Every delivery request contains one event and one campaign, with private recipient envelopes.
export async function sendEventQueue(scope: MailScope) {
  if (!scope.eventId) throw new Error('Choose an event before sending emails.');
  const { where, values } = filters(scope), conf = config(), now = new Date().toISOString();
  if (!conf.RESEND_API_KEY || !conf.EMAIL_FROM) return { configured: false, sent: 0, failed: 0, hasMore: false, message: 'Email service is not connected. Your messages are saved in the queue.' };
  await db().prepare("UPDATE mail SET status='expired' WHERE dispatch_id IS NULL AND kind='reminder' AND status IN ('queued','failed') AND due_at<=? AND registration_id IN (SELECT r.id FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.event_id=? AND e.starts_at<=?)").bind(now, scope.eventId, now).run();
  const stale = new Date(Date.now() - 60000).toISOString();
  let dispatch = await db().prepare('SELECT d.* FROM mail_dispatches d WHERE d.id IN (SELECT m.dispatch_id' + joins + ' WHERE ' + where + ") AND (d.status IN ('queued','failed') OR (d.status IN ('preparing','sending') AND d.updated_at<?)) ORDER BY d.created_at LIMIT 1").bind(...values, stale).first<any>();
  if (dispatch) {
    const rows = await dispatchRows(dispatch.id);
    const matching = Number((await db().prepare('SELECT COUNT(*) AS n' + joins + ' WHERE m.dispatch_id=? AND ' + where).bind(dispatch.id, ...values).first<any>())?.n);
    if (matching !== rows.length) return { configured: true, sent: 0, failed: matching, hasMore: false, message: 'This retry belongs to a saved delivery batch. Clear attendee and delivery filters to retry the full batch for this event.' };
    if (dispatch.status !== 'preparing' && Date.now() - new Date(dispatch.created_at).getTime() >= 23 * 3600000) {
      await setDispatchStatus(dispatch.id, 'review', 'Delivery is uncertain. Check the email provider before composing another message.');
      return { configured: true, sent: 0, failed: rows.length, hasMore: false, message: 'This old delivery attempt needs review in the email provider before it can be resent.' };
    }
    const safe = rows.every(m => (!m.requires_confirmation || (m.registration_status === 'confirmed' && m.published)) && (m.kind !== 'reminder' || m.starts_at > now));
    if (!safe || (dispatch.status !== 'preparing' && dispatch.payload !== JSON.stringify(payloadFor(rows, JSON.parse(dispatch.payload)[0]?.from || conf.EMAIL_FROM)))) {
      await setDispatchStatus(dispatch.id, 'cancelled', 'Event access or recipient details changed. Compose a new email for the current attendees.');
      return { configured: true, sent: 0, failed: 0, hasMore: false, message: 'The saved batch was cancelled because event access or recipient details changed. Compose a new email for the current attendees.' };
    }
    if (dispatch.status === 'preparing') {
      dispatch.payload = JSON.stringify(payloadFor(rows, conf.EMAIL_FROM));
      await db().prepare("UPDATE mail_dispatches SET payload=?,status='queued',updated_at=? WHERE id=?").bind(dispatch.payload, now, dispatch.id).run();
    }
  } else {
    const first = await db().prepare('SELECT m.kind' + joins + ' WHERE ' + where + " AND m.status IN ('queued','failed') AND m.dispatch_id IS NULL AND m.due_at<=? AND " + eligible + ' ORDER BY m.due_at,m.id LIMIT 1').bind(...values, now, now).first<any>();
    if (!first) return { configured: true, sent: 0, failed: 0, hasMore: false, message: 'No eligible emails are due in this view. Sent emails will not be resent.' };
    const candidates = (await db().prepare('SELECT m.id' + joins + ' WHERE ' + where + " AND m.kind=? AND m.status IN ('queued','failed') AND m.dispatch_id IS NULL AND m.due_at<=? AND " + eligible + ' ORDER BY m.id LIMIT 100').bind(...values, first.kind, now, now).all()).results as any[];
    const id = crypto.randomUUID();
    await db().batch([
      db().prepare("INSERT INTO mail_dispatches(id,payload,status,error,created_at,updated_at) VALUES(?,'[]','preparing','',?,?)").bind(id, now, now),
      db().prepare("UPDATE mail SET status='sending',dispatch_id=? WHERE id IN (SELECT value FROM json_each(?)) AND dispatch_id IS NULL AND status IN ('queued','failed')").bind(id, JSON.stringify(candidates.map(m => m.id))),
    ]);
    const rows = await dispatchRows(id);
    if (!rows.length) { await setDispatchStatus(id, 'cancelled'); return { configured: true, sent: 0, failed: 0, hasMore: false, message: 'Another send is already handling these messages.' }; }
    const payload = JSON.stringify(payloadFor(rows, conf.EMAIL_FROM));
    await db().prepare("UPDATE mail_dispatches SET payload=?,status='queued',updated_at=? WHERE id=?").bind(payload, now, id).run();
    dispatch = { id, payload };
  }
  const claim = await db().prepare("UPDATE mail_dispatches SET status='sending',updated_at=? WHERE id=? AND (status IN ('queued','failed') OR (status='sending' AND updated_at<?))").bind(now, dispatch.id, stale).run();
  if (!claim.meta.changes) return { configured: true, sent: 0, failed: 0, hasMore: false, message: 'This delivery batch is already being sent.' };
  const rows = await dispatchRows(dispatch.id);
  try {
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + conf.RESEND_API_KEY, 'Content-Type': 'application/json', 'User-Agent': 'ThonHub/1.0', 'Idempotency-Key': dispatch.id },
      body: dispatch.payload,
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'The email provider limit was reached. Retry later from Messages.' : 'The email provider rejected this batch (HTTP ' + response.status + '). Check the sender and service settings.');
    const result: any = await response.json();
    if (!Array.isArray(result.data) || result.data.length !== rows.length || result.data.some((r: any) => !r.id)) throw new Error('The email provider returned an incomplete result. Retry this saved batch from Messages.');
    const sentAt = new Date().toISOString();
    const providerIds = JSON.stringify(Object.fromEntries(rows.map((m, i) => [m.id, String(result.data[i].id)])));
    await db().batch([
      db().prepare("UPDATE mail SET status='sent',error='',provider_id=(SELECT value FROM json_each(?) WHERE key=mail.id),sent_at=? WHERE dispatch_id=?").bind(providerIds, sentAt, dispatch.id),
      db().prepare("UPDATE mail_dispatches SET status='sent',error='',updated_at=? WHERE id=?").bind(sentAt, dispatch.id),
    ]);
    const pending = await listMessages(scope);
    return { configured: true, sent: rows.length, failed: 0, hasMore: pending.sendableCount > 0, message: rows.length + ' emails accepted by the email provider.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email delivery failed. Retry the saved batch from Messages.';
    await setDispatchStatus(dispatch.id, 'failed', message.slice(0, 300));
    return { configured: true, sent: 0, failed: rows.length, hasMore: false, message };
  }
}

export async function queueBulkEmail(body: any) {
  const event = await db().prepare('SELECT * FROM events WHERE id=?').bind(String(body.eventId || '')).first<any>();
  if (!event) throw new Error('Choose an existing event.');
  const subject = String(body.subject || '').trim(), message = String(body.message || '').trim();
  if (!subject || subject.length > 150 || /[\r\n]/.test(subject)) throw new Error('Enter a subject of 1–150 characters on one line.');
  if (!message || message.length > 5000) throw new Error('Enter a message of 1–5,000 characters.');
  if (!Array.isArray(body.registrationIds) || !body.registrationIds.length || body.registrationIds.length > 10000 || body.registrationIds.some((id: any) => typeof id !== 'string' || id.length > 100)) throw new Error('Choose between 1 and 10,000 attendees.');
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(String(body.requestId || ''))) throw new Error('Reopen the email composer and try again.');
  const ids = [...new Set(body.registrationIds as string[])].sort(), includeLink = body.includeJoinLink === true;
  const rows = (await db().prepare('SELECT * FROM registrations WHERE event_id=? AND id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(event.id, JSON.stringify(ids)).all()).results as any[];
  if (rows.length !== ids.length) throw new Error('Every selected attendee must belong to this event. Refresh your attendee list.');
  if (includeLink && (!event.published || !event.join_url || rows.some(r => r.status !== 'confirmed'))) throw new Error('Joining links can only be sent for a published event to confirmed attendees. Add the link in the event editor first.');
  // Guard a pasted private joining link as well as the built-in link option.
  if (event.join_url && (message.includes(event.join_url) || subject.includes(event.join_url)) && rows.some(r => r.status !== 'confirmed')) throw new Error('Remove the joining link or choose confirmed attendees only.');
  const kind = 'bulk-' + body.requestId, now = new Date().toISOString();
  const existing = (await db().prepare('SELECT m.*,r.event_id' + ' FROM mail m JOIN registrations r ON r.id=m.registration_id WHERE m.kind=? ORDER BY m.registration_id').bind(kind).all()).results as any[];
  const personalized = (name: string) => 'Hello ' + name + ',\n\n' + message + '\n\nPowered by Edutantr';
  if (existing.length && (existing.length !== rows.length || existing.some((m, i) => m.event_id !== event.id || m.registration_id !== rows[i].id || m.subject !== subject || m.body !== personalized(rows[i].name) || !!m.include_join_link !== includeLink))) throw new Error('This send request was already saved with different content. Reopen the composer to create a new email.');
  if (!existing.length) {
    await db().prepare("INSERT INTO mail(id,registration_id,kind,subject,body,due_at,status,error,include_join_link,requires_confirmation,created_at) SELECT lower(hex(randomblob(16))),r.id,?,?,'Hello ' || r.name || ',\n\n' || ? || '\n\nPowered by Edutantr',?,'queued','',?,?,? FROM registrations r WHERE r.event_id=? AND r.id IN (SELECT value FROM json_each(?)) ON CONFLICT(registration_id,kind) DO NOTHING").bind(kind, subject, message, now, includeLink ? 1 : 0, includeLink ? 1 : 0, now, event.id, JSON.stringify(ids)).run();
  }
  const delivery = await sendEventQueue({ eventId: event.id, kind });
  return { ok: true, ...delivery, eventId: event.id, kind, recipients: rows.length,
    message: delivery.configured ? delivery.message : rows.length + ' emails saved for ' + event.title + '. Connect email delivery to send them.' };
}
