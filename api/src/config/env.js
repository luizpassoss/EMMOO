export const DEV_JWT_SECRET = 'dev-secret-altere-em-producao';
const DRIVERS = ['memory', 'mysql'];

/**
 * Lê e valida as variáveis de ambiente, aplicando padrões seguros para desenvolvimento.
 * Falha cedo (na inicialização) quando a configuração é inválida.
 */
export function loadEnv(source = process.env) {
  const nodeEnv = source.NODE_ENV ?? 'development';
  const dbDriver = (source.DB_DRIVER ?? 'memory').toLowerCase();
  if (!DRIVERS.includes(dbDriver)) {
    throw new Error(`DB_DRIVER inválido: "${dbDriver}". Use "memory" ou "mysql".`);
  }
  if (dbDriver === 'mysql' && !source.DATABASE_URL) {
    throw new Error('DATABASE_URL é obrigatória quando DB_DRIVER=mysql.');
  }

  const port = Number(source.PORT ?? 3333);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT inválida: "${source.PORT}".`);
  }

  const jwtSecret = source.JWT_SECRET ?? DEV_JWT_SECRET;
  if (nodeEnv === 'production' && jwtSecret === DEV_JWT_SECRET) {
    throw new Error('Defina um JWT_SECRET próprio em produção.');
  }

  const corsOrigin = (source.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean);

  return {
    nodeEnv,
    port,
    dbDriver,
    databaseUrl: source.DATABASE_URL ?? null,
    jwtSecret,
    jwtExpiresIn: source.JWT_EXPIRES_IN ?? '8h',
    corsOrigin,
  };
}
