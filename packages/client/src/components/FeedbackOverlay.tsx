import { useEffect } from 'react';
import { useUiStore } from '../stores/uiStore';
import { AlertTriangleIcon, CheckIcon, RadarIcon, XIcon } from './Icons';

export default function FeedbackOverlay() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);
  const confirmState = useUiStore((s) => s.confirmState);
  const resolveConfirm = useUiStore((s) => s.resolveConfirm);

  // Allow Escape key to cancel active confirmation dialog
  useEffect(() => {
    if (!confirmState) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        resolveConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmState, resolveConfirm]);

  const confirmToneStyles: Record<string, { badge: string; btn: string }> = {
    default: {
      badge: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
      btn: 'bg-zinc-100 hover:bg-white text-zinc-950',
    },
    emerald: {
      badge: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
      btn: 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950',
    },
    amber: {
      badge: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
      btn: 'bg-amber-400 hover:bg-amber-300 text-zinc-950',
    },
    danger: {
      badge: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
      btn: 'bg-rose-600 hover:bg-rose-500 text-white',
    },
  };

  return (
    <>
      {/* Unified Non-Blocking Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9990] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto pointer-events-none">
          {toasts.map((t) => {
            const styles =
              t.kind === 'success'
                ? 'bg-zinc-950/95 border-emerald-500/40 text-emerald-200 shadow-emerald-950/30'
                : t.kind === 'error'
                ? 'bg-zinc-950/95 border-rose-500/45 text-rose-200 shadow-rose-950/30'
                : t.kind === 'warn'
                ? 'bg-zinc-950/95 border-amber-500/45 text-amber-200 shadow-amber-950/30'
                : 'bg-zinc-950/95 border-cyan-500/35 text-zinc-100 shadow-black/60';

            return (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto animate-slide-down backdrop-blur-2xl border rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-center gap-2.5 text-xs font-medium ${styles}`}
              >
                <span className="shrink-0">
                  {t.kind === 'success' ? (
                    <CheckIcon className="w-4 h-4 text-emerald-400" />
                  ) : t.kind === 'error' || t.kind === 'warn' ? (
                    <AlertTriangleIcon className={`w-4 h-4 ${t.kind === 'error' ? 'text-rose-400' : 'text-amber-400'}`} />
                  ) : (
                    <RadarIcon className="w-4 h-4 text-cyan-400" />
                  )}
                </span>
                <span className="flex-1 leading-snug">{t.message}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  aria-label="Dismiss notification"
                  className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Unified In-App Confirmation Dialog */}
      {confirmState && (
        <div
          onClick={() => resolveConfirm(false)}
          className="fixed inset-0 z-[9995] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="obsidian-surface rounded-3xl p-5 max-w-sm w-full flex flex-col gap-4 animate-scale-in text-zinc-100"
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                  confirmToneStyles[confirmState.tone ?? 'default'].badge
                }`}
              >
                <AlertTriangleIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white tracking-tight">{confirmState.title}</h3>
                <p className="text-xs text-zinc-300 leading-relaxed mt-1 whitespace-pre-line font-sans">
                  {confirmState.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                className="px-3.5 py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all min-h-[38px]"
              >
                {confirmState.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 min-h-[38px] shadow-lg ${
                  confirmToneStyles[confirmState.tone ?? 'default'].btn
                }`}
              >
                {confirmState.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
