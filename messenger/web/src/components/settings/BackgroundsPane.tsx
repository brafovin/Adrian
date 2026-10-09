import { useMemo, useState } from 'react';
import { convTitle } from '../../lib/chat';
import { backgroundLayers, useBackgrounds } from '../../store/backgrounds';
import { useChats } from '../../store/chats';
import { confirmDialog, toast, toastError } from '../../store/ui';
import type { Background } from '../../types';
import { BackgroundEditor } from '../BackgroundEditor';
import { Icon } from '../Icon';
import { Group, PaneShell } from './parts';

/** Miniatur eines Hintergrunds im Look des Chats (inkl. Helligkeit, Abdunkeln, Weichzeichnen). */
function Thumb({ bg }: { bg: Background | null }) {
  const layers = backgroundLayers(bg);
  return (
    <span className="set-bgthumb" aria-hidden="true">
      {layers ? (
        <>
          <span className="set-bgthumb-img" style={{ backgroundImage: layers.image, filter: `brightness(${bg!.params.brightness}) blur(${bg!.params.blur / 8}px)` }} />
          <span className="set-bgthumb-ov" style={{ opacity: layers.overlay }} />
        </>
      ) : <Icon name="image" size={20} />}
    </span>
  );
}

type EditorTarget = { id: string | null; title?: string } | null;

export function BackgroundsPane({ onBack }: { onBack: () => void }) {
  const list = useBackgrounds((s) => s.list);
  const loaded = useBackgrounds((s) => s.loaded);
  const convs = useChats((s) => s.conversations);
  const [editor, setEditor] = useState<EditorTarget>(null);

  const def = list.find((b) => b.conversationId === null) ?? null;
  const perChat = useMemo(
    () => list
      .filter((b) => b.conversationId !== null)
      .map((b) => ({ bg: b, conv: convs.find((c) => c.id === b.conversationId) }))
      .filter((x) => !!x.conv)
      .sort((a, b) => convTitle(a.conv!).localeCompare(convTitle(b.conv!), 'de')),
    [list, convs],
  );

  async function reset(target: string | 'default', what: string) {
    const ok = await confirmDialog({
      title: 'Hintergrund zurücksetzen?',
      message: target === 'default' ? 'Der Standard-Hintergrund wird entfernt.' : `Der Hintergrund von „${what}“ wird entfernt.`,
      confirmLabel: 'Zurücksetzen', danger: true,
    });
    if (!ok) return;
    try { await useBackgrounds.getState().clear(target); toast('Hintergrund zurückgesetzt', 'success'); } catch (e) { toastError(e); }
  }

  return (
    <PaneShell title="Chat-Hintergründe" onBack={onBack}>
      <p className="set-lead"><Icon name="lock" size={18} /><span>Deine Hintergründe sind <b>nur für dich sichtbar</b> – andere Teilnehmer sehen sie nicht und werden nicht benachrichtigt.</span></p>

      <Group title="Standard-Hintergrund" note="Gilt für alle Chats, die keinen eigenen Hintergrund haben.">
        <div className="settings-row" data-testid="bg-default">
          <Thumb bg={def} />
          <div className="label"><span>Alle Chats</span><small>{def ? 'Eigenes Bild festgelegt' : loaded ? 'Kein Bild – es gilt die normale Chatfarbe' : 'Lädt…'}</small></div>
          <div className="set-row-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setEditor({ id: null })}>{def ? 'Ändern' : 'Festlegen'}</button>
            {def && <button className="btn btn-ghost btn-sm btn-text-danger" onClick={() => void reset('default', 'Alle Chats')}>Zurücksetzen</button>}
          </div>
        </div>
      </Group>

      <Group title="Hintergründe einzelner Chats" note="Einen neuen Chat-Hintergrund legst du im jeweiligen Chat über das Menü „Chat-Hintergrund ändern“ fest.">
        {perChat.length === 0 && <div className="settings-row muted-text">Noch keine Chats mit eigenem Hintergrund.</div>}
        {perChat.map(({ bg, conv }) => {
          const title = convTitle(conv!);
          return (
            <div className="settings-row" key={bg.conversationId!}>
              <Thumb bg={bg} />
              <div className="label"><span className="ellipsis" style={{ display: 'block' }}>{title}</span><small>{conv!.type === 'group' ? 'Gruppe' : 'Einzelchat'}</small></div>
              <div className="set-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditor({ id: bg.conversationId, title })} aria-label={`Hintergrund von ${title} ändern`}>Ändern</button>
                <button className="btn btn-ghost btn-sm btn-text-danger" onClick={() => void reset(bg.conversationId!, title)} aria-label={`Hintergrund von ${title} zurücksetzen`}>Zurücksetzen</button>
              </div>
            </div>
          );
        })}
      </Group>

      {editor && <BackgroundEditor conversationId={editor.id} conversationTitle={editor.title} onClose={() => setEditor(null)} />}
    </PaneShell>
  );
}
