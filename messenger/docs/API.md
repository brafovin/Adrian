# API-Übersicht

Alle Pfade unter `/api`, JSON, Authentifizierung per httpOnly-Cookie `sid` (Browser) oder `Authorization: Bearer <token>` (native Clients, Login mit `returnToken:true`).
Fehlerformat: `{ "error": { "code": "…", "message": "…" } }`. WebSocket: `GET /api/ws` (Ereignisse siehe `ARCHITECTURE.md`).

Die genauen Ein-/Ausgabeformate stehen in den zod-Schemas der Routen (`server/src/routes/*.ts`) und werden durch `server/test/*.test.ts` belegt.

## Authentifizierung
| Methode | Pfad |
|---|---|
| GET | `/api/auth/username-available` |
| POST | `/api/auth/register` |
| POST | `/api/auth/verify-email` |
| POST | `/api/auth/resend-verification` |
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| POST | `/api/auth/logout-all` |
| POST | `/api/auth/forgot` |
| POST | `/api/auth/reset` |

## Profil, Einstellungen, Push, Export, Konto
| Methode | Pfad |
|---|---|
| GET | `/api/me` |
| PATCH | `/api/me` |
| PUT | `/api/me/avatar` |
| DELETE | `/api/me/avatar` |
| PATCH | `/api/me/privacy` |
| PATCH | `/api/me/settings` |
| PUT | `/api/me/password` |
| GET | `/api/me/sessions` |
| DELETE | `/api/me/sessions/:id` |
| GET | `/api/push/config` |
| PUT | `/api/push/subscription` |
| DELETE | `/api/push/subscription` |
| GET | `/api/me/export` |
| DELETE | `/api/me` |

## Medien
| Methode | Pfad |
|---|---|
| POST | `/api/media` |
| GET | `/api/media/:id` |
| DELETE | `/api/media/:id` |

## Kontakte, Suche, Blockieren, Melden
| Methode | Pfad |
|---|---|
| GET | `/api/users/search` |
| GET | `/api/users/:id` |
| GET | `/api/contacts` |
| GET | `/api/contact-requests` |
| POST | `/api/contact-requests` |
| POST | `/api/contact-requests/:id/:action` |
| DELETE | `/api/contact-requests/:id` |
| DELETE | `/api/contacts/:userId` |
| GET | `/api/blocks` |
| POST | `/api/blocks` |
| DELETE | `/api/blocks/:userId` |
| POST | `/api/reports` |

## Unterhaltungen & Gruppen
| Methode | Pfad |
|---|---|
| GET | `/api/conversations` |
| GET | `/api/conversations/:id` |
| POST | `/api/conversations/direct` |
| POST | `/api/conversations/group` |
| PATCH | `/api/conversations/:id` |
| POST | `/api/conversations/:id/members` |
| DELETE | `/api/conversations/:id/members/:userId` |
| PATCH | `/api/conversations/:id/members/:userId` |
| PATCH | `/api/conversations/:id/me` |
| POST | `/api/conversations/:id/read` |
| POST | `/api/conversations/:id/clear` |
| POST | `/api/conversations/:id/invites` |
| GET | `/api/conversations/:id/invites` |
| DELETE | `/api/conversations/:id/invites/:code` |
| GET | `/api/invites/:code` |
| POST | `/api/invites/:code/join` |

## Nachrichten
| Methode | Pfad |
|---|---|
| POST | `/api/conversations/:id/messages` |
| GET | `/api/conversations/:id/messages` |
| GET | `/api/conversations/:id/search` |
| PATCH | `/api/messages/:id` |
| DELETE | `/api/messages/:id` |
| PUT | `/api/messages/:id/reaction` |
| POST | `/api/messages/:id/forward` |

## Chat-Hintergründe (privat)
| Methode | Pfad |
|---|---|
| GET | `/api/chat-backgrounds` |
| PUT | `/api/chat-backgrounds/:target` |
| DELETE | `/api/chat-backgrounds/:target` |

## Status (24 h)
| Methode | Pfad |
|---|---|
| POST | `/api/statuses` |
| PATCH | `/api/statuses/:id` |
| POST | `/api/statuses/:id/publish` |
| DELETE | `/api/statuses/:id` |
| GET | `/api/statuses/mine` |
| GET | `/api/statuses/feed` |
| POST | `/api/statuses/:id/view` |
| GET | `/api/statuses/:id/views` |
| PUT | `/api/statuses/:id/reaction` |

## Anrufverlauf & ICE
| Methode | Pfad |
|---|---|
| GET | `/api/calls/ice` |
| GET | `/api/calls` |
| DELETE | `/api/calls` |

## System
| Methode | Pfad |
|---|---|
| GET | `/api/health` |
| GET | `/api/dev/outbox` |
