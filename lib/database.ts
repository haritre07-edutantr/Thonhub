import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client';

let client: Client | undefined;
export function sqlClient(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error('Event storage has not been configured.');
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'number' });
  }
  return client;
}
function records<T>(result: ResultSet): T[] {
  return result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])) as T);
}
class Statement {
  constructor(readonly sql: string, readonly args: InValue[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.sql, values.map(value => value === undefined ? null : value as InValue)); }
  async first<T = Record<string, any>>() { return records<T>(await sqlClient().execute({ sql: this.sql, args: this.args }))[0] ?? null; }
  async all<T = Record<string, any>>() { return { results: records<T>(await sqlClient().execute({ sql: this.sql, args: this.args })) }; }
  async run() { const result = await sqlClient().execute({ sql: this.sql, args: this.args }); return { meta: { changes: result.rowsAffected } }; }
}
const adapter = {
  prepare(sql: string) { return new Statement(sql); },
  async batch(statements: Statement[]) {
    return (await sqlClient().batch(statements.map(statement => ({ sql: statement.sql, args: statement.args })), 'write')).map(result => ({ results: records(result), meta: { changes: result.rowsAffected } }));
  },
};
export const database = () => adapter;
