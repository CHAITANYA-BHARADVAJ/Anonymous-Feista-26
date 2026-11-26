import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getJwtSecret } from './env';

export interface JwtPayload {
  sub: number;
  role: 'team' | 'admin';
  jti: string;
}

export function signToken(sub: number, role: 'team' | 'admin'): { token: string; jti: string } {
  const jti = uuidv4();
  const token = jwt.sign({ sub, role, jti }, getJwtSecret(), { expiresIn: '12h' });
  return { token, jti };
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as unknown as JwtPayload;
}
