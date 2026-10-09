import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, errorMessage, get, post } from '../api';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/ui';
import { useSession } from '../store/session';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <main className="auth-card">
        <div className="auth-logo"><img src="/icon.svg" alt="" /><b>Adrian</b></div>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete, hint, name }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string; name?: string }) {
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="pw-wrap">
        <input name={name} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
        <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Passwort verbergen' : 'Passwort anzeigen'}>
          <Icon name={show ? 'eye-off' : 'eye'} size={20} />
        </button>
      </div>
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resent, setResent] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setNeedsVerify(false);
    try {
      await useSession.getState().login(identifier.trim(), password);
      const to = sessionStorage.getItem('adrian:redirect') ?? '/chats';
      sessionStorage.removeItem('adrian:redirect');
      navigate(to, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_not_verified') setNeedsVerify(true);
      setError(errorMessage(err));
    } finally { setBusy(false); }
  }
  async function resend() {
    try { await post('/api/auth/resend-verification', { email: identifier.trim() }); setResent(true); } catch (e) { setError(errorMessage(e)); }
  }
  return (
    <Card title="Willkommen zurück">
      {params.get('verified') && <div className="form-ok">E-Mail bestätigt – du kannst dich jetzt anmelden.</div>}
      {params.get('reset') && <div className="form-ok">Passwort geändert – bitte neu anmelden.</div>}
      <form className="col" onSubmit={submit}>
        <label className="field">
          <span>E-Mail oder @Benutzername</span>
          <input name="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" required autoFocus />
        </label>
        <PasswordField name="password" label="Passwort" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <div className="form-error" role="alert">{error}</div>}
        {needsVerify && (resent ? <div className="form-ok">Neue Bestätigungs-E-Mail gesendet.</div> :
          <button type="button" className="btn btn-secondary" onClick={resend} disabled={!identifier.includes('@')}>Bestätigungs-E-Mail erneut senden{identifier.includes('@') ? '' : ' (E-Mail eingeben)'}</button>)}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <Spinner size={18} /> : 'Anmelden'}</button>
      </form>
      <div className="auth-links"><Link to="/forgot">Passwort vergessen?</Link><Link to="/register">Konto erstellen</Link></div>
    </Card>
  );
}

function Register() {
  const [f, setF] = useState({ email: '', username: '', displayName: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [avail, setAvail] = useState<null | boolean>(null);
  const honey = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  useEffect(() => {
    setAvail(null);
    if (!/^[A-Za-z0-9_]{3,30}$/.test(f.username)) return;
    const t = setTimeout(() => {
      get<{ available: boolean }>(`/api/auth/username-available?username=${encodeURIComponent(f.username)}`).then((r) => setAvail(r.available)).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [f.username]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await post<{ verificationRequired: boolean }>('/api/auth/register', { ...f, website: honey.current?.value ?? '' });
      if (r.verificationRequired) setDone(true);
      else { await useSession.getState().init(); }
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  if (done) {
    return (
      <Card title="Fast geschafft!">
        <div className="empty-icon" style={{ alignSelf: 'center' }}><Icon name="mail" size={34} /></div>
        <p className="muted-text">Wir haben dir eine E-Mail an <b>{f.email}</b> geschickt. Klicke auf den Link darin, um dein Konto zu aktivieren.</p>
        <Link className="btn btn-primary" to="/login">Zur Anmeldung</Link>
      </Card>
    );
  }
  return (
    <Card title="Konto erstellen">
      <p className="muted-text" style={{ marginTop: -8 }}>Keine Telefonnummer nötig – nur E-Mail und ein Benutzername.</p>
      <form className="col" onSubmit={submit}>
        <label className="field"><span>Anzeigename</span>
          <input name="displayName" value={f.displayName} onChange={(e) => set('displayName')(e.target.value)} maxLength={60} required autoComplete="name" autoFocus /></label>
        <label className="field"><span>Benutzername</span>
          <input name="username" value={f.username} onChange={(e) => set('username')(e.target.value.replace(/^@/, ''))} pattern="[A-Za-z0-9_]{3,30}" title="3–30 Zeichen: Buchstaben, Ziffern, Unterstrich" required autoCapitalize="none" autoComplete="username" />
          {avail === true && <small style={{ color: 'var(--success)' }}>@{f.username} ist frei</small>}
          {avail === false && <small className="err">@{f.username} ist bereits vergeben</small>}
        </label>
        <label className="field"><span>E-Mail</span>
          <input name="email" type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} required autoComplete="email" /></label>
        <PasswordField name="password" label="Passwort" value={f.password} onChange={set('password')} autoComplete="new-password" hint="Mindestens 10 Zeichen." />
        <input ref={honey} className="hp" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || avail === false}>{busy ? <Spinner size={18} /> : 'Registrieren'}</button>
      </form>
      <div className="auth-links"><span>Schon ein Konto?</span><Link to="/login">Anmelden</Link></div>
    </Card>
  );
}

function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'busy' | 'ok' | 'err'>('busy');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('err'); setMsg('Link unvollständig.'); return; }
    post('/api/auth/verify-email', { token }).then(() => setState('ok')).catch((e) => { setState('err'); setMsg(errorMessage(e)); });
  }, [params]);
  return (
    <Card title="E-Mail bestätigen">
      {state === 'busy' && <Spinner />}
      {state === 'ok' && <><div className="form-ok">Deine E-Mail-Adresse ist bestätigt.</div><Link className="btn btn-primary" to="/login?verified=1">Jetzt anmelden</Link></>}
      {state === 'err' && <><div className="form-error">{msg}</div><Link className="btn btn-secondary" to="/login">Zur Anmeldung</Link></>}
    </Card>
  );
}

function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await post('/api/auth/forgot', { email }); setSent(true); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Card title="Passwort zurücksetzen">
      {sent ? <div className="form-ok">Falls ein Konto mit dieser Adresse existiert, haben wir dir einen Link geschickt (1 Stunde gültig).</div> : (
        <form className="col" onSubmit={submit}>
          <label className="field"><span>E-Mail</span><input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner size={18} /> : 'Link senden'}</button>
        </form>
      )}
      <div className="auth-links"><Link to="/login">Zurück zur Anmeldung</Link></div>
    </Card>
  );
}

function Reset() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await post('/api/auth/reset', { token: params.get('token'), password }); navigate('/login?reset=1', { replace: true }); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return (
    <Card title="Neues Passwort">
      <form className="col" onSubmit={submit}>
        <PasswordField name="password" label="Neues Passwort" value={password} onChange={setPassword} autoComplete="new-password" hint="Mindestens 10 Zeichen. Alle Geräte werden abgemeldet." />
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner size={18} /> : 'Passwort speichern'}</button>
      </form>
    </Card>
  );
}

export function AuthRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset-password" element={<Reset />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
