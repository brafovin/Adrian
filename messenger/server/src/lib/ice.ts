import { createHmac } from 'node:crypto';
import type { Config } from '../config.js';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * STUN + (optional) TURN mit zeitlich begrenzten Zugangsdaten (coturn `use-auth-secret`, "TURN REST API").
 * Ohne TURN-Server funktionieren Anrufe nur, wenn beide Seiten direkt (oder per STUN) erreichbar sind.
 */
export function iceServers(cfg: Config, userId: string): IceServer[] {
  const list: IceServer[] = [];
  const stun = cfg.STUN_URLS.split(',').map((s) => s.trim()).filter(Boolean);
  if (stun.length) list.push({ urls: stun });
  if (cfg.TURN_URLS && cfg.TURN_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + cfg.TURN_TTL_SECONDS}:${userId}`;
    const credential = createHmac('sha1', cfg.TURN_SECRET).update(username).digest('base64');
    list.push({ urls: cfg.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean), username, credential });
  }
  return list;
}
