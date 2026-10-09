export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  /** true/false nur, wenn der Benutzer den Online-Status freigibt; sonst null */
  online: boolean | null;
  lastSeenAt: string | null;
  isContact: boolean;
  blockedByMe: boolean;
}
export type Relation = 'self' | 'contact' | 'pending_out' | 'pending_in' | 'none';
export interface UserWithRelation extends PublicUser {
  relation: Relation;
  canRequest: boolean;
  sharedGroups?: { id: string; title: string }[] | null;
  canCall?: boolean;
}

export type Vis3 = 'everyone' | 'contacts' | 'nobody';
export interface Privacy {
  avatarVis: Vis3;
  bioVis: Vis3;
  onlineVis: Vis3;
  lastSeenVis: Vis3;
  statusVis: 'contacts' | 'nobody';
  groupsVis: Vis3;
  contactRequests: 'everyone' | 'nobody';
  dmFrom: 'everyone' | 'contacts';
  callsFrom: Vis3;
  groupAddFrom: 'everyone' | 'contacts';
  discoverable: boolean;
  readReceipts: boolean;
}
export interface Settings {
  theme: 'system' | 'light' | 'dark';
  accent: string;
  language: 'de' | 'en';
  enterToSend: boolean;
  notify: { messages: boolean; requests: boolean; calls: boolean; groups: boolean; status: boolean; hidePreviews: boolean };
}
export interface Me {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  createdAt: string;
  privacy: Privacy;
  settings: Settings;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  description: string;
  avatarUrl: string | null;
  peer: PublicUser | null;
  memberCount: number;
  myRole: 'owner' | 'admin' | 'member';
  lastSeq: number;
  lastMessageAt: string | null;
  lastMessage: Message | null;
  unreadCount: number;
  archived: boolean;
  pinnedAt: string | null;
  mutedUntil: string | null;
  sendAdminsOnly: boolean;
  infoAdminsOnly: boolean;
  addAdminsOnly: boolean;
  createdAt: string;
}
export interface Member extends PublicUser {
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  deliveredSeq: number;
  readSeq: number | null;
}

export interface Media {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  mime: string;
  size: number;
  name: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  url: string;
  thumbUrl: string | null;
}
export type MessageKind = 'text' | 'image' | 'video' | 'audio' | 'voice' | 'file' | 'system';
export interface Message {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string | null;
  clientMsgId: string | null;
  kind: MessageKind;
  body: string;
  media: Media | null;
  replyTo: { id: string; senderId: string | null; kind: MessageKind; body: string; deleted: boolean } | null;
  forwarded: boolean;
  system: Record<string, any> | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reactions: { userId: string; emoji: string }[];
}
/** Lokale, noch nicht bestätigte Nachricht. */
export interface LocalMessage extends Message {
  local?: { status: 'sending' | 'failed'; error?: string; progress?: number };
}

export interface BackgroundParams {
  zoom: number;
  x: number;
  y: number;
  brightness: number;
  overlay: number;
  blur: number;
}
export interface Background {
  conversationId: string | null;
  url: string;
  mediaId: string;
  sourceMediaId: string | null;
  sourceUrl: string | null;
  params: BackgroundParams;
  updatedAt: string;
}

export interface StatusItem {
  id: string;
  userId: string;
  kind: 'text' | 'image' | 'video';
  body: string;
  style: { bg?: string; color?: string; font?: 'sans' | 'serif' | 'mono' | 'hand'; emoji?: string; align?: 'left' | 'center' | 'right' };
  media: Media | null;
  visibility?: 'contacts' | 'only' | 'except';
  audienceIds?: string[];
  createdAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  viewed?: boolean;
  myReaction?: string | null;
  viewCount?: number;
  reactionCount?: number;
}
export interface StatusGroup {
  user: PublicUser;
  statuses: StatusItem[];
  allViewed: boolean;
  latestAt: string;
}

export interface CallRecord {
  id: string;
  kind: 'audio' | 'video';
  direction: 'incoming' | 'outgoing';
  state: string;
  endReason: string | null;
  missed: boolean;
  createdAt: string;
  durationSeconds: number;
  peer: PublicUser | null;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
