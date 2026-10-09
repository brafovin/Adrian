import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ContactTabs, ContactsPanel, RequestsPanel, SearchPanel, TabPanel } from '../components/contacts/Lists';
import { ProfilePane } from '../components/contacts/Profile';
import { useContactsUi } from '../components/contacts/state';
import { EmptyState, PaneHeader } from '../components/ui';
import { useConnection } from '../realtime';
import { useContacts } from '../store/contacts';
import './contacts.css';

export function ContactsScreen() {
  const { userId } = useParams();
  const tab = useContactsUi((s) => s.tab);
  const setTab = useContactsUi((s) => s.setTab);
  const incoming = useContacts((s) => s.incoming.length);
  const conn = useConnection((s) => s.state);

  useEffect(() => {
    if (!useContacts.getState().loaded) void useContacts.getState().load().catch(() => {});
  }, []);

  return (
    <div className={`split ${userId ? 'has-detail' : ''}`}>
      <div className="pane-list ct-list">
        <PaneHeader title="Kontakte" />
        {conn === 'offline' && <div className="conn-banner" role="status">Keine Verbindung – verbinde neu…</div>}
        <ContactTabs tab={tab} onChange={setTab} badge={incoming} />
        <div className="pane-body">
          <TabPanel id={tab}>
            {tab === 'contacts' && <ContactsPanel activeKey={userId} />}
            {tab === 'requests' && <RequestsPanel activeKey={userId} />}
            {tab === 'search' && <SearchPanel activeKey={userId} />}
          </TabPanel>
        </div>
      </div>
      <div className="pane-detail">
        {userId ? (
          <ProfilePane key={userId} userKey={userId} />
        ) : (
          <div className="placeholder-pane">
            <EmptyState icon="users" title="Kontakte">
              Wähle einen Kontakt aus, um das Profil zu sehen, oder suche im Tab „Suchen“ nach neuen Personen.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
