import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage, get, post } from '../api';
import { Avatar } from '../components/Avatar';
import { EmptyState, Spinner } from '../components/ui';
import { useChats } from '../store/chats';
import type { Conversation } from '../types';

/** Beitritt über Einladungslink. */
export function JoinScreen() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ title: string; description: string; memberCount: number; avatarUrl: string | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem('adrian:redirect');
    get(`/api/invites/${code}`).then(setInfo).catch((e) => setError(errorMessage(e)));
  }, [code]);

  async function join() {
    setBusy(true);
    try {
      const { conversation } = await post<{ conversation: Conversation }>(`/api/invites/${code}/join`);
      useChats.getState().upsertConversation(conversation);
      navigate(`/chats/${conversation.id}`, { replace: true });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <div className="placeholder-pane" style={{ flex: 1 }}>
      {error ? <EmptyState icon="link" title="Einladung nicht verfügbar">{error}</EmptyState>
        : !info ? <Spinner size={30} />
        : (
          <div className="col" style={{ alignItems: 'center', maxWidth: 360 }}>
            <Avatar name={info.title} src={info.avatarUrl} size={96} />
            <h2>{info.title}</h2>
            <p className="muted-text">{info.description || 'Du wurdest in eine Gruppe eingeladen.'}</p>
            <p className="muted-text">{info.memberCount} Mitglieder</p>
            <button className="btn btn-primary" onClick={join} disabled={busy}>Gruppe beitreten</button>
          </div>
        )}
    </div>
  );
}
