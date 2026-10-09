import { create } from 'zustand';
import { del, get, post } from '../api';
import type { PublicUser, Relation, UserWithRelation } from '../types';

export type ContactUser = PublicUser & { relation: Relation; canRequest: boolean };
export interface RequestItem {
  id: string;
  createdAt: string;
  user: ContactUser;
}
export interface BlockedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface ContactsState {
  contacts: ContactUser[];
  incoming: RequestItem[];
  outgoing: RequestItem[];
  blocked: BlockedUser[];
  loaded: boolean;
  load(): Promise<void>;
  loadBlocked(): Promise<void>;
  sendRequest(userId: string): Promise<'pending' | 'accepted'>;
  respond(requestId: string, action: 'accept' | 'decline'): Promise<void>;
  cancel(requestId: string): Promise<void>;
  remove(userId: string): Promise<void>;
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;
  search(q: string): Promise<UserWithRelation[]>;
  reset(): void;
}

export const useContacts = create<ContactsState>((set, getState) => ({
  contacts: [],
  incoming: [],
  outgoing: [],
  blocked: [],
  loaded: false,
  async load() {
    const [c, r] = await Promise.all([
      get<{ contacts: ContactUser[] }>('/api/contacts'),
      get<{ incoming: RequestItem[]; outgoing: RequestItem[] }>('/api/contact-requests'),
    ]);
    set({ contacts: c.contacts, incoming: r.incoming, outgoing: r.outgoing, loaded: true });
  },
  async loadBlocked() {
    const { blocked } = await get<{ blocked: BlockedUser[] }>('/api/blocks');
    set({ blocked });
  },
  async sendRequest(userId) {
    const r = await post<{ status: 'pending' | 'accepted' }>('/api/contact-requests', { userId });
    await getState().load();
    return r.status;
  },
  async respond(requestId, action) {
    await post(`/api/contact-requests/${requestId}/${action}`);
    await getState().load();
  },
  async cancel(requestId) {
    await del(`/api/contact-requests/${requestId}`);
    await getState().load();
  },
  async remove(userId) {
    await del(`/api/contacts/${userId}`);
    await getState().load();
  },
  async block(userId) {
    await post('/api/blocks', { userId });
    await Promise.all([getState().load(), getState().loadBlocked()]);
  },
  async unblock(userId) {
    await del(`/api/blocks/${userId}`);
    await Promise.all([getState().load(), getState().loadBlocked()]);
  },
  async search(q) {
    const { users } = await get<{ users: UserWithRelation[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
    return users;
  },
  reset() {
    set({ contacts: [], incoming: [], outgoing: [], blocked: [], loaded: false });
  },
}));
