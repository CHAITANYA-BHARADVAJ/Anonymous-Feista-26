import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  message?: string;
}

export function createRateLimiter({
  windowMs,
  max,
  keyFn,
  message = 'Too many attempts. Please wait a moment and try again.',
}: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits.entries()) {
      if (v.resetAt <= now) hits.delete(k);
    }
  }, Math.max(windowMs, 60_000));
  cleanup.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn ? keyFn(req) : req.ip || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSecs = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSecs));
      res.status(429).json({ error: message, retryAfterSecs });
      return;
    }

    next();
  };
}
