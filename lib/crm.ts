import { database, RequestError, SERVICES, type Service } from './inquiries';
import { INQUIRY_SOURCES } from './inquiry-attribution';

export const STAGES = { new: 'New', contacted: 'Contacted', discovery: 'Discovery', proposal: 'Proposal', won: 'Won', lost: 'Lost', archived: 'Archived' } as const;
export const MANUAL_SOURCES = { manual: 'Manual entry', referral: 'Referral', outreach: 'Outreach', event: 'Event', other: 'Other' } as const;
export const SOURCES = { ...INQUIRY_SOURCES, ...MANUAL_SOURCES } as const;
export const SERVICE_NAMES: Record<Service, string> = { calls: 'AI receptionist & lead response', leads: 'Lead response', website: 'Websites & chatbots', reviews: 'Local SEO & Google reviews', marketing: 'Marketing', brain: 'Company knowledge', audit: 'Chatbot integration & auditing', coding: 'Custom software & workflow automation', time: 'Save time', growth: 'Business growth', general: 'General inquiry' };
export type Stage = keyof typeof STAGES;
export type Lead = { id: string; inquiryId: string | null; name: string; business: string; email: string; phone: string; service: Service; preferredContact: string; source: keyof typeof SOURCES; stage: Stage; monthlyCents: number; setupCents: number; revision: number; createdAt: string; updatedAt: string; message: string; consentAt: string };
export type Task = { id: string; leadId: string | null; leadName: string | null; title: string; dueDate: string; completedAt: string | null; revision: number; createdAt: string };
export type Activity = { id: string; leadId: string; kind: string; body: string; createdAt: string };
export type Settings = { businessName: string; ownerName: string; replyEmail: string; replyPhone: string; timezone: string; setupComplete: number; revision: number };
export const DEFAULT_SETTINGS: Settings = { businessName: 'Schurr Automations', ownerName: 'Gavin Schurr', replyEmail: 'gavin@schurrautomations.com', replyPhone: '(985) 232-8337', timezone: 'America/Denver', setupComplete: 0, revision: 1 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// The union makes historical and future website inquiries immediately visible.
// Editable contact details live in a separate overlay; original consent and
// submission digests are never changed by CRM edits.
const LEADS = `WITH leads AS (
 SELECT i.id, i.id AS inquiryId, COALESCE(c.name,i.name) AS name,
 COALESCE(c.business,i.business) AS business, COALESCE(c.email,i.email) AS email,
 COALESCE(c.phone,i.phone) AS phone, COALESCE(c.service,i.service) AS service,
 COALESCE(c.preferred_contact,i.preferred_contact) AS preferredContact,
 COALESCE(c.source,'website') AS source, COALESCE(c.stage,'new') AS stage,
 COALESCE(c.monthly_cents,0) AS monthlyCents, COALESCE(c.setup_cents,0) AS setupCents,
 COALESCE(c.revision,1) AS revision, i.created_at AS createdAt,
 COALESCE(c.updated_at,i.created_at) AS updatedAt, i.message, i.consent_at AS consentAt
 FROM inquiries i LEFT JOIN crm_leads c ON c.inquiry_id = i.id
 UNION ALL
 SELECT c.id, NULL, c.name, c.business, c.email, c.phone, c.service, c.preferred_contact,
 c.source, c.stage, c.monthly_cents, c.setup_cents, c.revision, c.created_at,
 c.updated_at, '', '' FROM crm_leads c WHERE c.inquiry_id IS NULL
)`;

export function validId(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new RequestError(400, 'Choose a valid record.', { [field]: 'Choose a valid record.' });
  return value.toLowerCase();
}
export function dayInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
}
export function cursorEncode(first: string, id: string): string { return btoa(JSON.stringify([first, id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function cursorDecode(value: string | undefined, dateOnly = false): [string, string] | null {
  if (!value) return null;
  try {
    if (value.length > 200 || !/^[\w-]+$/.test(value)) throw Error();
    const pair = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !(dateOnly ? DATE : ISO).test(pair[0]) || !Number.isFinite(Date.parse(pair[0])) || typeof pair[1] !== 'string' || !UUID.test(pair[1])) throw Error();
    return pair as [string,string];
  } catch { throw new RequestError(400, 'This page link is invalid. Return to the first page.'); }
}
export type LeadFilters = { q?: string; stage?: string; source?: string; cursor?: string };
function leadWhere(filters: LeadFilters) {
  const where: string[] = []; const args: (string | number)[] = [];
  if (filters.q) {
    if (filters.q.length > 120) throw new RequestError(400, 'Search using 120 characters or fewer.');
    where.push('(instr(lower(name),lower(?))>0 OR instr(lower(business),lower(?))>0 OR instr(lower(email),lower(?))>0 OR instr(phone,?)>0)');
    args.push(filters.q, filters.q, filters.q, filters.q);
  }
  if (filters.stage && filters.stage !== 'all') {
    if (filters.stage === 'open') where.push("stage IN ('new','contacted','discovery','proposal')");
    else { if (!Object.hasOwn(STAGES,filters.stage)) throw new RequestError(400, 'Choose a valid stage.'); where.push('stage = ?'); args.push(filters.stage); }
  }
  if (filters.source && filters.source !== 'all') {
    if (!Object.hasOwn(SOURCES,filters.source)) throw new RequestError(400, 'Choose a valid source.');
    where.push('source = ?'); args.push(filters.source);
  }
  return { where, args };
}
export async function listLeads(filters: LeadFilters = {}, limit = 50) {
  const { where, args } = leadWhere(filters);
  const boundary = cursorDecode(filters.cursor);
  if (boundary) { where.push('(createdAt, id) < (?, ?)'); args.push(...boundary); }
  const size = Math.min(100, Math.max(1, limit));
  const rows = (await database().prepare(`${LEADS} SELECT * FROM leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY createdAt DESC, id DESC LIMIT ?`).bind(...args, size + 1).all<Lead>()).results;
  const items = rows.slice(0, size); const last = items.at(-1);
  return { items, nextCursor: rows.length > size && last ? cursorEncode(last.createdAt, last.id) : null };
}
export async function getLead(id: string): Promise<Lead | null> { return database().prepare(`${LEADS} SELECT * FROM leads WHERE id = ?`).bind(validId(id)).first<Lead>(); }
export async function getSettings(): Promise<Settings> {
  return await database().prepare('SELECT business_name AS businessName, owner_name AS ownerName, reply_email AS replyEmail, reply_phone AS replyPhone, timezone, setup_complete AS setupComplete, revision FROM crm_settings WHERE id = ?').bind('main').first<Settings>() || { ...DEFAULT_SETTINGS };
}
export async function getOverview(today: string) {
  const db = database();
  const [stageRows, taskCounts] = await Promise.all([
    db.prepare(`${LEADS} SELECT stage, count(*) AS count, sum(monthlyCents) AS monthlyCents, sum(setupCents) AS setupCents FROM leads GROUP BY stage`).all<{ stage: Stage; count: number; monthlyCents: number; setupCents: number }>(),
    db.prepare('SELECT count(*) AS open, sum(CASE WHEN due_date < ? THEN 1 ELSE 0 END) AS overdue, sum(CASE WHEN due_date = ? THEN 1 ELSE 0 END) AS today FROM crm_tasks WHERE completed_at IS NULL').bind(today, today).first<{ open: number; overdue: number; today: number }>(),
  ]);
  return { stages: stageRows.results, tasks: taskCounts || { open: 0, overdue: 0, today: 0 } };
}
export async function listTasks(options: { status?: string; leadId?: string; cursor?: string; today?: string; limit?: number } = {}) {
  const where: string[] = []; const args: (string | number)[] = [];
  const status = options.status || 'open';
  if (!['open', 'done', 'overdue', 'today', 'all'].includes(status)) throw new RequestError(400, 'Choose a valid task filter.');
  if (status !== 'all') where.push(status === 'done' ? 't.completed_at IS NOT NULL' : 't.completed_at IS NULL');
  if (status === 'today' || status === 'overdue') { where.push(`t.due_date ${status === 'today' ? '=' : '<'} ?`); args.push(options.today || dayInTimezone('America/Denver')); }
  if (options.leadId) { where.push('t.lead_id = ?'); args.push(validId(options.leadId)); }
  const boundary = cursorDecode(options.cursor, true);
  if (boundary) { where.push('(t.due_date, t.id) > (?, ?)'); args.push(...boundary); }
  const size = Math.min(100, Math.max(1, options.limit || 50));
  const rows = (await database().prepare(`${LEADS} SELECT t.id, t.lead_id AS leadId, l.name AS leadName, t.title, t.due_date AS dueDate, t.completed_at AS completedAt, t.revision, t.created_at AS createdAt FROM crm_tasks t LEFT JOIN leads l ON l.id = t.lead_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.due_date, t.id LIMIT ?`).bind(...args, size + 1).all<Task>()).results;
  const items = rows.slice(0, size); const last = items.at(-1);
  return { items, nextCursor: rows.length > size && last ? cursorEncode(last.dueDate, last.id) : null };
}
export async function listActivity(leadId: string, cursor?: string) {
  const boundary = cursorDecode(cursor); const args = [validId(leadId), ...(boundary || [])];
  const rows = (await database().prepare(`SELECT id, lead_id AS leadId, kind, body, created_at AS createdAt FROM crm_events WHERE lead_id = ? ${boundary ? 'AND (created_at,id) < (?, ?)' : ''} ORDER BY created_at DESC, id DESC LIMIT 51`).bind(...args).all<Activity>()).results;
  const items = rows.slice(0, 50); const last = items.at(-1);
  return { items, nextCursor: rows.length > 50 && last ? cursorEncode(last.createdAt, last.id) : null };
}

function text(input: Record<string, unknown>, key: string, max: number, required = false, multiline = false): string {
  const raw = input[key] ?? '';
  if (typeof raw !== 'string') throw new RequestError(400, 'Please check the form.', { [key]: 'Enter text.' });
  const value = raw.trim().replace(/\r\n?/g, '\n');
  if ((required && !value) || value.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value) || (!multiline && /[\n\t]/.test(value))) throw new RequestError(400, 'Please check the form.', { [key]: required && !value ? 'Complete this field.' : `Use valid text, up to ${max} characters.` });
  return value;
}
function enumField<T extends string>(input: Record<string, unknown>, key: string, values: readonly T[]): T {
  const value = text(input, key, 40, true);
  if (!values.includes(value as T)) throw new RequestError(400, 'Please check the form.', { [key]: 'Choose an option from the list.' });
  return value as T;
}
function revision(input: Record<string, unknown>): number {
  const value = input.revision;
  if (!(typeof value === 'string' || typeof value === 'number') || !/^[1-9]\d{0,9}$/.test(String(value)) || Number(value) > 2147483646) throw new RequestError(400, 'Refresh this record before editing it.');
  return Number(value);
}
function money(input: Record<string, unknown>, key: string): number {
  const value = text(input, key, 14) || '0';
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) throw new RequestError(400, 'Please check the amounts.', { [key]: 'Enter a positive dollar amount with up to two decimal places.' });
  const cents = Math.round(Number(value) * 100);
  if (cents > 1000000000) throw new RequestError(400, 'Please check the amounts.', { [key]: 'Use $10,000,000 or less.' });
  return cents;
}
function contact(input: Record<string, unknown>) {
  const name = text(input, 'name', 100, true), business = text(input, 'business', 160);
  const email = text(input, 'email', 254).toLowerCase(), phone = text(input, 'phone', 40);
  const preferredContact = enumField(input, 'preferredContact', ['email', 'phone', 'text']);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError(400, 'Please check the email.', { email: 'Enter a valid email address.' });
  if (phone && (!/^[+()\d\s.\-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15)) throw new RequestError(400, 'Please check the phone.', { phone: 'Enter a valid phone number.' });
  if (preferredContact === 'email' && !email) throw new RequestError(400, 'Add a reply address.', { email: 'Email is required for the selected contact method.' });
  if (preferredContact !== 'email' && !phone) throw new RequestError(400, 'Add a reply number.', { phone: 'Phone is required for the selected contact method.' });
  return { name, business, email, phone, preferredContact, service: enumField(input, 'service', SERVICES), stage: enumField(input, 'stage', Object.keys(STAGES)), monthlyCents: money(input, 'monthlyValue'), setupCents: money(input, 'setupValue') };
}
const fields: Record<string, string[]> = {
  createLead: ['name','business','email','phone','preferredContact','service','stage','monthlyValue','setupValue','source','note'],
  updateLead: ['leadId','revision','name','business','email','phone','preferredContact','service','stage','monthlyValue','setupValue'],
  stage: ['leadId','revision','stage'], deleteLead: ['leadId','revision','confirmation'],
  addNote: ['leadId','kind','body'], deleteNote: ['leadId','noteId'],
  createTask: ['leadId','title','dueDate'], updateTask: ['taskId','revision','title','dueDate'],
  taskStatus: ['taskId','revision','status'], deleteTask: ['taskId','revision','confirmation'],
  settings: ['revision','businessName','ownerName','replyEmail','replyPhone','timezone'],
};
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join('');
}
export async function mutateCrm(input: Record<string, unknown>): Promise<{ redirect: string }> {
  const action = text(input, 'action', 30, true);
  if (!Object.hasOwn(fields, action) || Object.keys(input).some(key => !['action','mutationId', ...fields[action]].includes(key))) throw new RequestError(400, 'This action is not supported.');
  const key = validId(input.mutationId, 'mutationId');
  const hash = await digest(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))));
  const db = database(); const now = new Date().toISOString(); const attempt = crypto.randomUUID();
  const receipt = async () => db.prepare('SELECT request_hash AS requestHash, redirect FROM crm_mutations WHERE id = ?').bind(key).first<{ requestHash: string; redirect: string }>();
  const existing = await receipt();
  if (existing) { if (existing.requestHash !== hash) throw new RequestError(409, 'This form was already saved. Refresh before making another change.'); return { redirect: existing.redirect }; }
  const statements: ReturnType<typeof db.prepare>[] = [];
  let destination = '/manage';
  const addReceipt = (guard = '1', args: (string | number | null)[] = []) => statements.push(db.prepare(`INSERT INTO crm_mutations (id,request_hash,redirect,created_at,attempt_id) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO NOTHING`).bind(key, hash, destination, now, attempt, ...args));
  const event = (leadId: string, kind: string, body: string) => statements.push(db.prepare('INSERT INTO crm_events (id,lead_id,kind,body,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_mutations WHERE id = ? AND request_hash = ? AND attempt_id = ?) ON CONFLICT(id) DO NOTHING').bind(key, leadId, kind, body, now, key,hash,attempt));
  const ensureLead = async (id: string) => {
    const lead = await getLead(id);
    if (!lead) throw new RequestError(404, 'This lead no longer exists.');
    if (lead.inquiryId) statements.push(db.prepare(`INSERT INTO crm_leads (id,inquiry_id,name,business,email,phone,service,preferred_contact,source,created_at,updated_at)
      SELECT id,id,name,business,email,phone,service,preferred_contact,'website',created_at,created_at FROM inquiries WHERE id = ? ON CONFLICT(id) DO NOTHING`).bind(id));
    return lead;
  };
  if (action === 'createLead') {
    const c = contact(input); const source = enumField(input, 'source', Object.keys(MANUAL_SOURCES)); const note = text(input, 'note', 6000, false, true);
    destination = `/manage/leads/${key}?saved=created`;
    addReceipt('NOT EXISTS(SELECT 1 FROM crm_leads WHERE id=?) AND NOT EXISTS(SELECT 1 FROM inquiries WHERE id=?)',[key,key]);
    statements.push(db.prepare(`INSERT INTO crm_leads (id,name,business,email,phone,service,preferred_contact,source,stage,monthly_cents,setup_cents,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?) ON CONFLICT(id) DO NOTHING`).bind(key, c.name, c.business, c.email, c.phone, c.service, c.preferredContact, source, c.stage, c.monthlyCents, c.setupCents, now, now,key,hash,attempt));
    event(key, note?'note':'system', note||'Lead created.');
  } else if (['updateLead','stage','deleteLead','addNote','deleteNote'].includes(action)) {
    const id = validId(input.leadId, 'leadId'); await ensureLead(id);
    destination = `/manage/leads/${id}?saved=updated`;
    if (action === 'updateLead' || action === 'stage') {
      const rev = revision(input);
      const c = action === 'updateLead' ? contact(input) : null;
      const stage = c?.stage || enumField(input, 'stage', Object.keys(STAGES));
      addReceipt('EXISTS(SELECT 1 FROM crm_leads WHERE id = ? AND revision = ?)', [id, rev]);
      if (c) statements.push(db.prepare(`UPDATE crm_leads SET name=?,business=?,email=?,phone=?,service=?,preferred_contact=?,stage=?,monthly_cents=?,setup_cents=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)`).bind(c.name,c.business,c.email,c.phone,c.service,c.preferredContact,stage,c.monthlyCents,c.setupCents,now,id,rev,key,hash,attempt));
      else statements.push(db.prepare('UPDATE crm_leads SET stage=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)').bind(stage,now,id,rev,key,hash,attempt));
      event(id, 'system', action === 'stage' ? `Stage changed to ${STAGES[stage as Stage]}.` : `Contact and opportunity updated. Stage: ${STAGES[stage as Stage]}.`);
    } else if (action === 'deleteLead') {
      if (input.confirmation !== 'DELETE') throw new RequestError(400, 'Type DELETE to confirm permanent removal.', { confirmation: 'Type DELETE exactly.' });
      const rev = revision(input); destination = '/manage/leads?saved=deleted';
      addReceipt('EXISTS(SELECT 1 FROM crm_leads WHERE id = ? AND revision = ?)', [id, rev]);
      statements.push(db.prepare(`INSERT INTO voice_call_controls (call_sid,stopped_at)
        SELECT substr(source_key,6),? FROM response_jobs WHERE lead_id=? AND source_key LIKE 'call:%'
        AND EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)
        ON CONFLICT(call_sid) DO NOTHING`).bind(now,id,key,hash,attempt));
      statements.push(db.prepare('DELETE FROM inquiries WHERE id=? AND EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)').bind(id,key,hash,attempt));
      statements.push(db.prepare('DELETE FROM crm_leads WHERE id=? AND EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)').bind(id,key,hash,attempt));
    } else if (action === 'addNote') {
      const kind = enumField(input, 'kind', ['note','call','email','text','meeting']); const body = text(input,'body',6000,true,true);
      addReceipt('EXISTS(SELECT 1 FROM crm_leads WHERE id = ?)', [id]); event(id,kind,body);
    } else {
      const noteId = validId(input.noteId,'noteId');
      addReceipt("EXISTS(SELECT 1 FROM crm_events WHERE id=? AND lead_id=? AND kind <> 'system')",[noteId,id]);
      statements.push(db.prepare('DELETE FROM crm_events WHERE id=? AND lead_id=? AND EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)').bind(noteId,id,key,hash,attempt));
    }
  } else if (['createTask','updateTask','taskStatus','deleteTask'].includes(action)) {
    destination = '/manage/tasks?saved=updated';
    if (action === 'createTask') {
      const leadId = input.leadId ? validId(input.leadId,'leadId') : null;
      if (leadId) { await ensureLead(leadId); destination = `/manage/leads/${leadId}?saved=task`; }
      const title = text(input,'title',200,true), dueDate = text(input,'dueDate',10,true);
      if (!DATE.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(`${dueDate}T12:00:00Z`).toISOString().slice(0,10) !== dueDate || dueDate < '2000-01-01' || dueDate > '2100-12-31') throw new RequestError(400,'Choose a valid due date.',{dueDate:'Choose a calendar date from 2000 through 2100.'});
      addReceipt('NOT EXISTS(SELECT 1 FROM crm_tasks WHERE id=?)'+(leadId?' AND EXISTS(SELECT 1 FROM crm_leads WHERE id=?)':''),leadId?[key,leadId]:[key]);
      statements.push(db.prepare('INSERT INTO crm_tasks (id,lead_id,title,due_date,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?) ON CONFLICT(id) DO NOTHING').bind(key,leadId,title,dueDate,now,now,key,hash,attempt));
      if (leadId) event(leadId,'system',`Follow-up scheduled: ${title}. Due ${dueDate}.`);
    } else {
      const id = validId(input.taskId,'taskId'), rev = revision(input);
      const task = await db.prepare('SELECT lead_id AS leadId FROM crm_tasks WHERE id=?').bind(id).first<{leadId:string|null}>();
      if (!task) throw new RequestError(404,'This task no longer exists.');
      let title='',dueDate='',done=false;
      if (action==='updateTask') {
        title=text(input,'title',200,true); dueDate=text(input,'dueDate',10,true);
        if (!DATE.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(`${dueDate}T12:00:00Z`).toISOString().slice(0,10)!==dueDate || dueDate<'2000-01-01' || dueDate>'2100-12-31') throw new RequestError(400,'Choose a valid due date.',{dueDate:'Choose a valid calendar date.'});
      } else if (action==='taskStatus') done=enumField(input,'status',['open','done'])==='done';
      else if (input.confirmation!=='DELETE') throw new RequestError(400,'Confirm task deletion.');
      addReceipt('EXISTS(SELECT 1 FROM crm_tasks WHERE id=? AND revision=?)',[id,rev]);
      const guard='id=? AND revision=? AND EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)';
      if (action==='updateTask') statements.push(db.prepare(`UPDATE crm_tasks SET title=?,due_date=?,updated_at=?,revision=revision+1 WHERE ${guard}`).bind(title,dueDate,now,id,rev,key,hash,attempt));
      else if (action==='taskStatus') statements.push(db.prepare(`UPDATE crm_tasks SET completed_at=?,updated_at=?,revision=revision+1 WHERE ${guard}`).bind(done?now:null,now,id,rev,key,hash,attempt));
      else statements.push(db.prepare(`DELETE FROM crm_tasks WHERE ${guard}`).bind(id,rev,key,hash,attempt));
      if(task.leadId) event(task.leadId,'system',action==='deleteTask'?'Follow-up deleted.':action==='updateTask'?'Follow-up updated.':done?'Follow-up completed.':'Follow-up reopened.');
    }
  } else if (action==='settings') {
    const rev=revision(input), business=text(input,'businessName',160,true), owner=text(input,'ownerName',100,true), email=text(input,'replyEmail',254), phone=text(input,'replyPhone',40), timezone=text(input,'timezone',64,true);
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError(400,'Enter a valid business email.',{replyEmail:'Enter a valid email address.'});
    if(phone&&(!/^[+()\d\s.\-]+$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15)) throw new RequestError(400,'Enter a valid business phone.',{replyPhone:'Enter a valid phone number.'});
    try { new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(); } catch { throw new RequestError(400,'Choose a valid timezone.',{timezone:'Use a timezone such as America/Denver.'}); }
    destination='/manage/settings?saved=settings';
    statements.push(db.prepare("INSERT INTO crm_settings (id,business_name,owner_name,reply_email,reply_phone,timezone,revision,updated_at) VALUES ('main',?,?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING").bind(DEFAULT_SETTINGS.businessName,DEFAULT_SETTINGS.ownerName,'',DEFAULT_SETTINGS.replyPhone,DEFAULT_SETTINGS.timezone,now));
    addReceipt("EXISTS(SELECT 1 FROM crm_settings WHERE id='main' AND revision=?)",[rev]);
    statements.push(db.prepare("UPDATE crm_settings SET business_name=?,owner_name=?,reply_email=?,reply_phone=?,timezone=?,setup_complete=1,revision=revision+1,updated_at=? WHERE id='main' AND revision=? AND EXISTS(SELECT 1 FROM crm_mutations WHERE id=? AND request_hash=? AND attempt_id=?)").bind(business,owner,email,phone,timezone,now,rev,key,hash,attempt));
  }
  await db.batch(statements);
  const saved=await receipt();
  if(!saved) throw new RequestError(409,'This record changed in another tab or was removed. Refresh to see the latest version before saving again.');
  if(saved.requestHash!==hash) throw new RequestError(409,'This form was already saved with different details. Refresh before editing again.');
  return {redirect:saved.redirect};
}

export function csvCell(value: string | number): string {
  const text=String(value); const safe=/^\s*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text)?`'${text}`:text;
  return `"${safe.replace(/"/g,'""')}"`;
}
export function leadCsvRow(lead: Lead): string {
  return [lead.id,lead.name,lead.business,lead.email,lead.phone,lead.preferredContact,SERVICE_NAMES[lead.service],SOURCES[lead.source],STAGES[lead.stage],(lead.monthlyCents/100).toFixed(2),(lead.setupCents/100).toFixed(2),lead.createdAt,lead.updatedAt].map(csvCell).join(',')+'\r\n';
}
