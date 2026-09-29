import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEV_JWT_SECRET, loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('aplica padrões de desenvolvimento', () => {
    assert.deepEqual(loadEnv({}), {
      nodeEnv: 'development',
      port: 3333,
      dbDriver: 'memory',
      databaseUrl: null,
      jwtSecret: DEV_JWT_SECRET,
      jwtExpiresIn: '8h',
      corsOrigin: ['http://localhost:5173'],
    });
  });
  it('lê valores informados e separa múltiplas origens de CORS', () => {
    const env = loadEnv({
      PORT: '8080',
      DB_DRIVER: 'MYSQL',
      DATABASE_URL: 'mysql://u:p@db:3306/emmoo',
      JWT_SECRET: 'segredo',
      JWT_EXPIRES_IN: '1h',
      CORS_ORIGIN: 'http://a.com, http://b.com,',
    });
    assert.equal(env.port, 8080);
    assert.equal(env.dbDriver, 'mysql');
    assert.equal(env.jwtExpiresIn, '1h');
    assert.deepEqual(env.corsOrigin, ['http://a.com', 'http://b.com']);
  });
  it('rejeita driver desconhecido', () => {
    assert.throws(() => loadEnv({ DB_DRIVER: 'mongo' }), /DB_DRIVER inválido/);
  });
  it('exige DATABASE_URL no modo mysql', () => {
    assert.throws(() => loadEnv({ DB_DRIVER: 'mysql' }), /DATABASE_URL/);
  });
  it('rejeita porta inválida', () => {
    assert.throws(() => loadEnv({ PORT: 'abc' }), /PORT inválida/);
    assert.throws(() => loadEnv({ PORT: '70000' }), /PORT inválida/);
  });
  it('impede o segredo de desenvolvimento em produção', () => {
    assert.throws(() => loadEnv({ NODE_ENV: 'production' }), /JWT_SECRET/);
    assert.equal(loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'forte' }).jwtSecret, 'forte');
  });
});
