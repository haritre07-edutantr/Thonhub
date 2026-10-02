import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(project, '.mail-test-'));
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const file of (await readdir(path.join(project, 'drizzle'))).filter(f => f.endsWith('.sql')).sort()) sqlite.exec(await readFile(path.join(project, 'drizzle', file), 'utf8'));
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  first() { return Promise.resolve(sqlite.prepare(this.sql).get(...this.values) ?? null); }
  all() { return Promise.resolve({ results: sqlite.prepare(this.sql).all(...this.values) }); }
  runSync() { const result = sqlite.prepare(this.sql).run(...this.values); return { meta: { changes: Number(result.changes) }, success: true }; }
  run() { return Promise.resolve(this.runSync()); }
}
globalThis.__mailEnv = { ADMIN_EMAIL: 'admin@example.test', DB: {
  prepare: sql => new Statement(sql),
  async batch(statements) { sqlite.exec('BEGIN'); try { const results = statements.map(s => s.runSync()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
} };
globalThis.__mailUser = null;
const calls = [];
const originalError = console.error;
console.error = () => {}; // Expected rejected requests are asserted below.
let provider = 'success';
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.resend.com/emails/batch', 'Tests never send to a real email provider');
  const payload = JSON.parse(options.body); assert.ok(payload.length <= 100); assert.ok(payload.every(e => e.to.length === 1));
  assert.equal(options.headers['User-Agent'], 'ThonHub/1.0');
  calls.push({ key: options.headers['Idempotency-Key'], body: options.body, payload });
  if (provider === 'network') throw new Error('Simulated connection interruption');
  if (provider === 'reject') return Response.json({ message: 'Rate limited' }, { status: 429 });
  return Response.json({ data: provider === 'incomplete' ? [] : payload.map((_, i) => ({ id: 'provider-' + calls.length + '-' + i })) });
};
async function compile(source, name, replace) {
  let code = await readFile(path.join(project, source), 'utf8'); code = replace(code);
  const out = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const destination = path.join(temp, name + '.mjs'); await writeFile(destination, out); return pathToFileURL(destination).href;
}
const hub = await compile('lib/hub.ts', 'hub', code => code.replace("import { database } from './database';", 'const database=()=>globalThis.__mailEnv.DB;').replace("import { currentUser } from './auth';", 'const currentUser=async()=>globalThis.__mailUser;').replace('process.env as Record<string,string>', 'globalThis.__mailEnv'));
const mail = await compile('lib/event-mail.ts', 'mail', code => code.replace("from './hub'", 'from ' + JSON.stringify(hub)));
const security = await compile('lib/request-security.ts', 'security', code => code);
const route = await compile('app/api/hub/route.ts', 'route', code => code.replace("from '../../../lib/hub'", 'from ' + JSON.stringify(hub)).replace("from '../../../lib/event-mail'", 'from ' + JSON.stringify(mail)).replace("from '../../../lib/request-security'", 'from ' + JSON.stringify(security)));
const { GET, POST } = await import(route);
const { queueReminder } = await import(hub);
const admin = { userId: 'owner', email: 'admin@example.test', displayName: 'Admin' };
const now = new Date().toISOString(), past = '2020-01-01T00:00:00.000Z';
function run(sql, ...values) { return sqlite.prepare(sql).run(...values); }
function all(sql, ...values) { return sqlite.prepare(sql).all(...values); }
function event(id, published = 1, link = 'https://example.com/private-' + id, starts = '2076-10-01T00:00:00.000Z') {
  run('INSERT INTO events(id,title,category,description,starts_at,duration,mode,venue,speaker,price,capacity,payment_url,join_url,published,reminder,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, 'Event ' + id, 'Webinar', 'Test event description', starts, 120, 'Online', 'Online', 'Host', 500, 10000, '', link, published, 1, now);
}
function registration(id, eventId, status = 'confirmed') { run('INSERT INTO registrations(id,event_id,user_id,name,email,phone,organization,status,payment_ref,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id, eventId, id, 'Person ' + id, id + '@example.com', '', 'Test college', status, '', now); }
function bulk(eventId, ids, extras = {}) { return { action: 'bulkSend', requestId: crypto.randomUUID(), eventId, registrationIds: ids, subject: 'Event update', message: 'Bring your laptop and questions.', includeJoinLink: false, ...extras }; }
async function post(body, origin = 'https://thon.test') {
  const response = await POST(new Request('https://thon.test/api/hub', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: response.status, data: await response.json() };
}
async function get(params) { const response = await GET(new Request('https://thon.test/api/hub?' + new URLSearchParams(params))); return { status: response.status, data: await response.json() }; }
try {
  event('A'); event('B'); event('C', 0, ''); event('old', 1, '', past);
  registration('a1', 'A'); registration('a2', 'A', 'awaiting_payment'); registration('b1', 'B'); registration('c1', 'C'); registration('old1', 'old');
  assert.equal((await get({ scope: 'admin', section: 'messages' })).status, 403);
  assert.equal((await post(bulk('A', ['a1']))).status, 401);
  globalThis.__mailUser = { ...admin, email: 'attendee@example.com' };
  assert.equal((await get({ scope: 'admin' })).status, 403);
  assert.equal((await post(bulk('A', ['a1']))).status, 403);
  globalThis.__mailUser = admin;
  assert.equal((await post(bulk('A', ['a1']), 'https://other.test')).status, 403);
  assert.equal(all('SELECT * FROM mail').length, 0);

  const first = bulk('A', ['a1', 'a2']);
  const queued = await post(first); assert.equal(queued.status, 200); assert.equal(queued.data.configured, false); assert.equal(queued.data.recipients, 2);
  assert.equal(calls.length, 0); assert.equal(all('SELECT * FROM mail').length, 2);
  assert.equal((await post(first)).status, 200); assert.equal(all('SELECT * FROM mail').length, 2, 'Same request does not create duplicates');
  assert.equal((await post({ ...first, subject: 'Changed after saving' })).status, 400);
  assert.equal((await post(bulk('A', ['a1', 'b1']))).status, 400, 'Recipients cannot cross events');
  assert.equal((await post(bulk('A', ['a2'], { includeJoinLink: true }))).status, 400);
  assert.equal((await post(bulk('A', ['a2'], { message: 'Join https://example.com/private-A' }))).status, 400);
  assert.equal((await post(bulk('A', ['a1'], { subject: 'Bad\nsubject' }))).status, 400);
  assert.equal((await post(bulk('A', []))).status, 400);
  const draft = bulk('C', ['c1']); assert.equal((await post(draft)).status, 200, 'General updates work without a joining link or publication');
  assert.equal((await post({ action: 'dispatchEventMail' })).status, 400, 'Dispatch requires an explicit event');

  globalThis.__mailEnv.RESEND_API_KEY = 'test-key-never-a-real-secret'; globalThis.__mailEnv.EMAIL_FROM = 'Thon Hub <events@example.com>';
  const delivered = await post({ action: 'dispatchEventMail', eventId: 'A', kind: queued.data.kind });
  assert.equal(delivered.data.sent, 2); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload.map(e => e.to[0]).sort(), ['a1@example.com', 'a2@example.com']);
  assert.ok(calls[0].payload.every(e => !e.text.includes('private-A')), 'General email never appends a private link');
  assert.equal(all("SELECT * FROM mail WHERE status='sent'").length, 2);
  assert.equal((await post({ action: 'dispatchEventMail', eventId: 'A', kind: queued.data.kind })).data.sent, 0);
  assert.equal(calls.length, 1, 'Already sent rows stay sent');
  assert.equal(all("SELECT m.* FROM mail m JOIN registrations r ON r.id=m.registration_id WHERE r.event_id='C'")[0].status, 'queued', 'Other events are untouched');

  provider = 'reject';
  const failedRequest = bulk('A', ['a1', 'a2'], { subject: 'Second update' });
  const failed = await post(failedRequest); assert.equal(failed.data.sent, 0); assert.equal(failed.data.failed, 2);
  const failedCall = calls.at(-1); const beforePartial = calls.length;
  const partial = await post({ action: 'dispatchEventMail', eventId: 'A', kind: failed.data.kind, recipientStatus: 'confirmed' });
  assert.match(partial.data.message, /full batch/); assert.equal(calls.length, beforePartial, 'Partial filters cannot silently resend other attendees');
  provider = 'success';
  const retried = await post({ action: 'dispatchEventMail', eventId: 'A', kind: failed.data.kind, deliveryStatus: 'failed' });
  assert.equal(retried.data.sent, 2); assert.equal(calls.at(-1).key, failedCall.key); assert.equal(calls.at(-1).body, failedCall.body, 'Retries retain the exact payload and idempotency key');

  const linked = bulk('A', ['a1'], { includeJoinLink: true });
  delete globalThis.__mailEnv.RESEND_API_KEY; const linkQueue = await post(linked);
  run("UPDATE events SET join_url='https://example.com/new-private-A' WHERE id='A'");
  globalThis.__mailEnv.RESEND_API_KEY = 'test-key-never-a-real-secret';
  assert.equal((await post({ action: 'dispatchEventMail', eventId: 'A', kind: linkQueue.data.kind })).data.sent, 1);
  assert.ok(calls.at(-1).payload[0].text.includes('new-private-A'), 'Links are refreshed on first delivery');
  provider = 'network'; const uncertain = await post(bulk('B', ['b1']));
  run('UPDATE mail_dispatches SET created_at=?,updated_at=? WHERE id=?', past, past, calls.at(-1).key);
  const beforeReview = calls.length;
  const review = await post({ action: 'dispatchEventMail', eventId: 'B', kind: uncertain.data.kind });
  assert.match(review.data.message, /needs review/); assert.equal(calls.length, beforeReview, 'Expired provider idempotency windows require review');
  assert.equal(all('SELECT status FROM mail WHERE kind=?', uncertain.data.kind)[0].status, 'review');
  provider = 'success';

  for (let i = 0; i < 105; i++) run("INSERT INTO mail(id,registration_id,kind,subject,body,due_at,status,error,include_join_link,requires_confirmation,created_at) VALUES(?,?,'bulk-list-' || ?,'Batch list','List message',?,'queued','',0,0,?)", 'list-' + i, 'b1', i, now, now);
  const pageOne = await get({ scope: 'admin', section: 'messages', eventId: 'B', query: 'Batch list' });
  assert.equal(pageOne.data.total, 105); assert.equal(pageOne.data.outbox.length, 50); assert.ok(pageOne.data.outbox.every(m => m.event_id === 'B'));
  const pageThree = await get({ scope: 'admin', section: 'messages', eventId: 'B', query: 'Batch list', page: '999' });
  assert.equal(pageThree.data.page, 3); assert.equal(pageThree.data.outbox.length, 5);
  const eventA = await get({ scope: 'admin', section: 'messages', eventId: 'A', deliveryStatus: 'sent', recipientStatus: 'awaiting_payment', query: 'a2@example.com' });
  assert.equal(eventA.data.total, 2); assert.ok(eventA.data.outbox.every(m => m.event_id === 'A' && m.email === 'a2@example.com' && m.status === 'sent'));
  assert.equal((await get({ scope: 'admin', section: 'messages', query: '%' })).data.total, 0, 'Search characters are literal');

  const largeIds = Array.from({ length: 125 }, (_, i) => 'large-' + i); largeIds.forEach(id => registration(id, 'A'));
  const large = await post(bulk('A', largeIds, { subject: 'Large event update' }));
  assert.equal(large.data.sent, 100); assert.equal(large.data.hasMore, true);
  const rest = await post({ action: 'dispatchEventMail', eventId: 'A', kind: large.data.kind });
  assert.equal(rest.data.sent, 25); assert.equal(rest.data.hasMore, false);
  assert.equal(all("SELECT * FROM mail WHERE kind=? AND status='sent'", large.data.kind).length, 125);

  provider = 'incomplete';
  const incomplete = await post(bulk('C', ['c1'], { subject: 'Draft update' }));
  assert.equal(incomplete.data.sent, 0); assert.equal(incomplete.data.failed, 1);
  const incompleteCall = calls.at(-1); provider = 'success';
  assert.equal((await post({ action: 'dispatchEventMail', eventId: 'C', kind: incomplete.data.kind })).data.sent, 1);
  assert.equal(calls.at(-1).key, incompleteCall.key); assert.equal(calls.at(-1).body, incompleteCall.body);

  delete globalThis.__mailEnv.RESEND_API_KEY;
  const concurrentRequest = bulk('A', ['a1', 'a2'], { subject: 'Concurrent request' });
  const concurrentQueue = await post(concurrentRequest); globalThis.__mailEnv.RESEND_API_KEY = 'test-key-never-a-real-secret';
  const beforeConcurrent = calls.length;
  const concurrent = await Promise.all([post({ action: 'dispatchEventMail', eventId: 'A', kind: concurrentQueue.data.kind }), post({ action: 'dispatchEventMail', eventId: 'A', kind: concurrentQueue.data.kind })]);
  assert.equal(calls.length, beforeConcurrent + 1); assert.equal(concurrent.reduce((n, r) => n + r.data.sent, 0), 2, 'Concurrent sends claim a batch once');

  const reminderEvent = sqlite.prepare("SELECT * FROM events WHERE id='A'").get();
  await queueReminder({ id: 'a2', name: 'Person a2' }, reminderEvent);
  run("UPDATE mail SET due_at=? WHERE kind='reminder' AND registration_id='a2'", past);
  const beforeBlocked = calls.length;
  assert.equal((await post({ action: 'dispatchEventMail', eventId: 'A', messageType: 'reminder' })).data.sent, 0);
  assert.equal(calls.length, beforeBlocked, 'Unconfirmed attendees cannot receive a reminder with private access');

  const eOld = sqlite.prepare("SELECT * FROM events WHERE id='old'").get(); await queueReminder({ id: 'old1', name: 'Old attendee' }, eOld);
  const beforeExpiry = calls.length; await post({ action: 'dispatchEventMail', eventId: 'old' });
  assert.equal(all("SELECT status FROM mail WHERE registration_id='old1'")[0].status, 'expired'); assert.equal(calls.length, beforeExpiry);
  const adminData = await get({ scope: 'admin' }); assert.equal(adminData.status, 200);
  assert.ok(!JSON.stringify(adminData.data).includes('test-key-never-a-real-secret'), 'API keys never reach the client');
  globalThis.__mailUser = { ...admin, email: 'another@example.com' };
  assert.equal((await post({ action: 'dispatchEventMail', eventId: 'A' })).status, 403);
  assert.equal((await get({ scope: 'admin', section: 'messages', eventId: 'A' })).status, 403);
  console.log('PASS: real migrations, admin access, event/recipient filters, private links, queue persistence, scoped sending, batching, and safe retries. No real emails sent.');
} finally { console.error = originalError; sqlite.close(); await rm(temp, { recursive: true, force: true }); }
