import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
  action?: { label: string; onClick: () => void };
}
let toastId = 0;
export const useToasts = create<{ toasts: Toast[]; dismiss(id: number): void }>((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
export function toast(text: string, kind: Toast['kind'] = 'info', action?: Toast['action']) {
  const id = ++toastId;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind, action }] }));
  setTimeout(() => useToasts.getState().dismiss(id), action ? 7000 : 4000);
}
export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error');

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Wenn gesetzt, muss ein Text eingegeben werden (z. B. Passwort); der Wert wird zurückgegeben. */
  input?: { label: string; type?: 'text' | 'password'; placeholder?: string };
}
export const useConfirm = create<{ current: (ConfirmOptions & { resolve: (v: string | boolean) => void }) | null }>(() => ({ current: null }));
/** Bestätigungsdialog. Ergibt `true/false`, bei `input` den eingegebenen Text oder `false`. */
export function confirmDialog(opts: ConfirmOptions & { input: NonNullable<ConfirmOptions['input']> }): Promise<string | false>;
export function confirmDialog(opts: ConfirmOptions): Promise<boolean>;
export function confirmDialog(opts: ConfirmOptions): Promise<string | boolean> {
  return new Promise((resolve) => useConfirm.setState({ current: { ...opts, resolve } }));
}

export interface SheetItem {
  label: string;
  icon?: string;
  danger?: boolean;
  onClick: () => void | Promise<void>;
}
export const useSheet = create<{ title?: string; items: SheetItem[] | null; emojis?: string[]; onEmoji?: (e: string) => void }>(() => ({ items: null }));
/** Aktionsmenü (Bottom-Sheet auf dem Handy). */
export function actionSheet(items: SheetItem[], title?: string, extra?: { emojis?: string[]; onEmoji?: (e: string) => void }) {
  useSheet.setState({ items, title, ...extra });
}
export const closeSheet = () => useSheet.setState({ items: null, emojis: undefined, onEmoji: undefined });
