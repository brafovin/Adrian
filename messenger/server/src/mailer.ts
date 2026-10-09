import nodemailer from 'nodemailer';
import type { Config } from './config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
  /** Nur für Tests/Entwicklung: zuletzt „gesendete“ Mails. */
  outbox: Mail[];
}

export function createMailer(cfg: Config, log: { info: (o: unknown, m?: string) => void }): Mailer {
  const outbox: Mail[] = [];
  if (cfg.SMTP_URL) {
    const transport = nodemailer.createTransport(cfg.SMTP_URL);
    return {
      outbox,
      async send(mail) {
        await transport.sendMail({ from: cfg.MAIL_FROM, ...mail });
      },
    };
  }
  if (cfg.NODE_ENV === 'production') {
    throw new Error('SMTP_URL muss in Produktion gesetzt sein (E-Mail-Verifizierung, Passwort-Reset).');
  }
  // Entwicklung/Test: keine echte Zustellung. Mail landet in `outbox` und im Log.
  return {
    outbox,
    async send(mail) {
      outbox.push(mail);
      if (cfg.NODE_ENV === 'development') log.info({ mail }, 'E-Mail (nicht versendet, SMTP_URL fehlt)');
    },
  };
}
