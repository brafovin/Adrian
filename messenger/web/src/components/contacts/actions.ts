import { errorMessage } from '../../api';
import { useChats } from '../../store/chats';
import { useContacts } from '../../store/contacts';
import { startCall } from '../../store/calls';
import { confirmDialog, toast } from '../../store/ui';
import type { PublicUser } from '../../types';

type Named = Pick<PublicUser, 'id' | 'username' | 'displayName'>;

/** Öffnet (oder erstellt) den 1:1-Chat mit dem Nutzer. */
export async function openDirectChat(userId: string, navigate: (to: string) => void): Promise<void> {
  try {
    const conv = await useChats.getState().startDirect(userId);
    navigate(`/chats/${conv.id}`);
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

export async function requestContact(u: Named): Promise<boolean> {
  try {
    const status = await useContacts.getState().sendRequest(u.id);
    toast(status === 'accepted' ? `Du und ${u.displayName} seid jetzt Kontakte.` : `Anfrage an ${u.displayName} gesendet.`, 'success');
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}

/** Nimmt eine eingehende Anfrage des Nutzers an (Fallback: Gegenanfrage, die der Server automatisch annimmt). */
export async function acceptFrom(u: Named): Promise<boolean> {
  const req = useContacts.getState().incoming.find((r) => r.user.id === u.id);
  if (!req) return requestContact(u);
  try {
    await useContacts.getState().respond(req.id, 'accept');
    toast(`Du und ${u.displayName} seid jetzt Kontakte.`, 'success');
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}

export async function declineFrom(u: Named): Promise<boolean> {
  const req = useContacts.getState().incoming.find((r) => r.user.id === u.id);
  if (!req) return false;
  try {
    await useContacts.getState().respond(req.id, 'decline');
    toast('Anfrage abgelehnt.');
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}

export async function withdrawTo(u: Named): Promise<boolean> {
  const req = useContacts.getState().outgoing.find((r) => r.user.id === u.id);
  if (!req) return false;
  try {
    await useContacts.getState().cancel(req.id);
    toast('Anfrage zurückgezogen.');
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}

export async function removeContact(u: Named): Promise<boolean> {
  const ok = await confirmDialog({
    title: 'Kontakt entfernen?',
    message: `${u.displayName} wird aus deinen Kontakten entfernt. Bestehende Chats bleiben erhalten.`,
    confirmLabel: 'Entfernen',
    danger: true,
  });
  if (!ok) return false;
  try {
    await useContacts.getState().remove(u.id);
    toast('Kontakt entfernt.');
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}

export async function blockUser(u: Named): Promise<boolean> {
  const ok = await confirmDialog({
    title: `${u.displayName} blockieren?`,
    message: 'Ihr könnt euch gegenseitig nicht mehr finden, keine Anfragen senden und nicht anrufen. Der Kontakt wird entfernt. Du kannst die Sperre jederzeit aufheben.',
    confirmLabel: 'Blockieren',
    danger: true,
  });
  if (!ok) return false;
  try {
    await useContacts.getState().block(u.id);
    toast(`${u.displayName} blockiert.`);
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}

export async function unblockUser(u: Named): Promise<boolean> {
  const ok = await confirmDialog({
    title: `${u.displayName} entblocken?`,
    message: 'Die Person kann dich danach wieder finden und dir Anfragen senden.',
    confirmLabel: 'Entblocken',
  });
  if (!ok) return false;
  try {
    await useContacts.getState().unblock(u.id);
    toast(`${u.displayName} entblockt.`, 'success');
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}

export function callUser(u: PublicUser, kind: 'audio' | 'video') {
  startCall(u, kind);
}

export function profileLink(username: string): string {
  return `${location.origin}/contacts/@${username}`;
}

export async function copyProfileLink(username: string): Promise<void> {
  const link = profileLink(username);
  try {
    await navigator.clipboard.writeText(link);
    toast('Profil-Link kopiert.', 'success');
  } catch {
    // Fallback für Browser ohne Clipboard-Zugriff
    try {
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      toast(ok ? 'Profil-Link kopiert.' : link, ok ? 'success' : 'info');
    } catch {
      toast(link);
    }
  }
}
