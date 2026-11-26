import { Request, Response, NextFunction, RequestHandler } from 'express';

export function asyncHandler(
  fn: (req: any, res: Response, next: NextFunction) => Promise<any> | any,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function parsePositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
