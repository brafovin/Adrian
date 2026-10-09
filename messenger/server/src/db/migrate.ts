import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Db } from './pool.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Wendet alle noch nicht eingespielten *.sql-Dateien in Reihenfolge an (je Datei eine Transaktion). */
export async function migrate(db: Db, log: (m: string) => void = () => {}): Promise<string[]> {
  const client = await db.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock(727001)');
    await client.query(`create table if not exists schema_migrations (
      version text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const done = new Map<string, string>(
      (await client.query('select version, checksum from schema_migrations')).rows.map((r) => [r.version, r.checksum]),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = await readFile(path.join(dir, f), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prev = done.get(f);
      if (prev) {
        if (prev !== checksum) throw new Error(`Migration ${f} wurde nach dem Einspielen verändert`);
        continue;
      }
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations(version, checksum) values ($1,$2)', [f, checksum]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Migration ${f} fehlgeschlagen: ${(e as Error).message}`);
      }
      applied.push(f);
      log(`migration angewendet: ${f}`);
    }
    return applied;
  } finally {
    await client.query('select pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}
