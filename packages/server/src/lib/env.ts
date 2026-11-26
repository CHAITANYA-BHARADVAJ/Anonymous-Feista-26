const WEAK_JWT_SECRETS = new Set([
  'dev-secret',
  'change-me',
  'change-me-in-production-use-32-char-random-string',
  'tactical-sdmcet-secret-key-2026',
  'tactical_sdmcet_secret_key_2026_change_me',
]);

const WEAK_ADMIN_PASSWORDS = new Set([
  'admin',
  'admin123',
  'password',
  '123456',
  'changeme',
]);

export function getProductionEnvErrors(env: Record<string, string | undefined> = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const errors: string[] = [];

  const jwtSecret = (env.JWT_SECRET || '').trim();
  if (!jwtSecret || jwtSecret.length < 16 || WEAK_JWT_SECRETS.has(jwtSecret)) {
    errors.push('JWT_SECRET must be set to a strong unique secret (>= 16 chars) in production.');
  }

  const adminPass = (env.ADMIN_PASSWORD || '').replace(/['"]/g, '').trim();
  if (!adminPass || adminPass.length < 8 || WEAK_ADMIN_PASSWORDS.has(adminPass.toLowerCase())) {
    errors.push('ADMIN_PASSWORD must be set to a strong password (>= 8 chars, non-default) in production.');
  }

  return errors;
}

export function validateProductionEnv(): void {
  const errors = getProductionEnvErrors(process.env);
  if (errors.length > 0) {
    console.error('❌ FATAL PRODUCTION CONFIGURATION ERROR:');
    for (const err of errors) {
      console.error(`   - ${err}`);
    }
    process.exit(1);
  }
}

export function getJwtSecret(): string {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 16 || WEAK_JWT_SECRETS.has(secret))) {
    throw new Error('Invalid or missing JWT_SECRET in production');
  }
  return secret || 'dev-secret';
}
