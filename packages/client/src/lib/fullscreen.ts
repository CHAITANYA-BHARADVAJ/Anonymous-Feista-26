// Fullscreen API helper with cross-browser compatibility and gesture triggers

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as any;
  return !!(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

export async function requestFullscreen(element: Element = document.documentElement): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isFullscreen()) return true;

  const el = element as any;
  const requestFn =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.webkitRequestFullScreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen;

  if (!requestFn) return false;

  try {
    const res = requestFn.call(el);
    if (res instanceof Promise) {
      await res;
    }
    return true;
  } catch {
    // Browser may block if not invoked within a direct user interaction
    return false;
  }
}

export async function exitFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (!isFullscreen()) return true;

  const doc = document as any;
  const exitFn =
    doc.exitFullscreen ||
    doc.webkitExitFullscreen ||
    doc.mozCancelFullScreen ||
    doc.msExitFullscreen;

  if (!exitFn) return false;

  try {
    const res = exitFn.call(doc);
    if (res instanceof Promise) {
      await res;
    }
    return true;
  } catch {
    return false;
  }
}

export async function toggleFullscreen(element: Element = document.documentElement): Promise<boolean> {
  if (isFullscreen()) {
    return exitFullscreen();
  } else {
    return requestFullscreen(element);
  }
}

/**
 * Attaches a one-time global user gesture listener (pointerdown / touchstart / click)
 * so that the user's very first tap on the screen immediately requests fullscreen.
 */
export function enableAutoFullscreenOnFirstGesture(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (isFullscreen()) return () => {};

  const handleGesture = () => {
    requestFullscreen().catch(() => {});
    cleanup();
  };

  const cleanup = () => {
    window.removeEventListener('pointerdown', handleGesture);
    window.removeEventListener('touchstart', handleGesture);
    window.removeEventListener('click', handleGesture);
  };

  window.addEventListener('pointerdown', handleGesture, { passive: true, once: true });
  window.addEventListener('touchstart', handleGesture, { passive: true, once: true });
  window.addEventListener('click', handleGesture, { passive: true, once: true });

  return cleanup;
}
