import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'warn' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'amber' | 'danger' | 'emerald';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface UiStoreState {
  toasts: ToastItem[];
  confirmState: PendingConfirm | null;
  toast: (message: string, kind?: ToastKind, durationMs?: number) => void;
  dismissToast: (id: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (value: boolean) => void;
}

export const useUiStore = create<UiStoreState>((set, get) => ({
  toasts: [],
  confirmState: null,

  toast: (message, kind = 'info', durationMs = 3400) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind }] }));
    if (durationMs > 0) {
      setTimeout(() => {
        get().dismissToast(id);
      }, durationMs);
    }
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      const existing = get().confirmState;
      if (existing) existing.resolve(false);
      set({ confirmState: { ...options, resolve } });
    }),

  resolveConfirm: (value) => {
    const current = get().confirmState;
    if (current) current.resolve(value);
    set({ confirmState: null });
  },
}));
