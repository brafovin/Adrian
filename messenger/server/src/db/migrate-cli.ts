import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { migrate } from './migrate.js';

const cfg = loadConfig();
const db = createPool(cfg.DATABASE_URL);
try {
  const applied = await migrate(db, console.log);
  console.log(applied.length ? `${applied.length} Migration(en) angewendet.` : 'Datenbank ist aktuell.');
} finally {
  await db.end();
}
