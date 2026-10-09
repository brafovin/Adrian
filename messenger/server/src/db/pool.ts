import pg from 'pg';

// bigint (seq, size) als Number zurückgeben – Werte bleiben weit unter 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = Pick<pg.Pool, 'query'>;

export function createPool(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 20, idleTimeoutMillis: 30_000 });
}

export async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
