import { z } from 'zod';
import type { Queryable } from '../db/pool.js';

export const settingsSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']).default('system'),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6d5efc'),
    language: z.enum(['de', 'en']).default('de'),
    enterToSend: z.boolean().default(true),
    notify: z
      .object({
        messages: z.boolean().default(true),
        requests: z.boolean().default(true),
        calls: z.boolean().default(true),
        groups: z.boolean().default(true),
        status: z.boolean().default(false),
        /** Auf Sperrbildschirmen/Push keine Nachrichteninhalte anzeigen. */
        hidePreviews: z.boolean().default(false),
      })
      .default({ messages: true, requests: true, calls: true, groups: true, status: false, hidePreviews: false }),
  })
  .strip();
export type UserSettings = z.infer<typeof settingsSchema>;

export async function getSettings(db: Queryable, userId: string): Promise<UserSettings> {
  const { rows } = await db.query('select data from user_settings where user_id = $1', [userId]);
  return settingsSchema.parse(rows[0]?.data ?? {});
}
