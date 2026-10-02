import { database } from './database';
import { currentUser } from './auth';
export const db=()=>database();
export const config=()=>process.env as Record<string,string>;
export async function identity(){const u=await currentUser();return {user:u,admin:!!u&&config().ADMIN_EMAIL?.trim().toLowerCase()===u.email.toLowerCase()};}
export function safeUrl(value:unknown){if(!value)return '';const u=new URL(String(value));if(u.protocol!=='https:')throw new Error('Links must begin with https://');return u.toString();}
export function publicEvent(e:any){const {join_url,...rest}=e;return rest;}
export async function queueReminder(r:any,e:any){if(!e.reminder)return;const due=new Date(new Date(e.starts_at).getTime()-3600000).toISOString();await db().prepare("INSERT INTO mail(id,registration_id,kind,subject,body,due_at,status,error,created_at) VALUES(?,?,'reminder',?,?,?,'queued','',?) ON CONFLICT(registration_id,kind) DO UPDATE SET due_at=excluded.due_at,subject=excluded.subject,body=excluded.body,status=CASE WHEN mail.status='sent' THEN 'sent' ELSE 'queued' END,dispatch_id=CASE WHEN mail.status='sent' THEN mail.dispatch_id ELSE NULL END,error=CASE WHEN mail.status='sent' THEN mail.error ELSE '' END").bind(crypto.randomUUID(),r.id,'Starting soon: '+e.title,'Hello '+r.name+',\n\n'+e.title+' starts at '+new Date(e.starts_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST.\n\nPowered by Edutantr',due,new Date().toISOString()).run();}
