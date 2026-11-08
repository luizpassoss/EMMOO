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
      cadastroEscolas: true,
      rotinas: true,
      smtpUrl: null,
      emailRemetente: 'EMMOO <nao-responda@emmoo.app>',
      corsOrigin: ['http://localhost:5173'],
      appUrl: 'http://localhost:5173',
      trustProxy: false,
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
  it('cadastro de escolas: aberto em desenvolvimento, fechado em produção, configurável', () => {
    assert.equal(loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'forte' }).cadastroEscolas, false);
    assert.equal(loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'forte', CADASTRO_ESCOLAS: 'Aberto' }).cadastroEscolas, true);
    assert.equal(loadEnv({ CADASTRO_ESCOLAS: 'fechado' }).cadastroEscolas, false);
    assert.throws(() => loadEnv({ CADASTRO_ESCOLAS: 'sim' }), /CADASTRO_ESCOLAS inválido/);
  });
  it('rotinas automáticas: ligadas, salvo nos testes; configuráveis', () => {
    assert.equal(loadEnv({ NODE_ENV: 'test' }).rotinas, false);
    assert.equal(loadEnv({ ROTINAS: 'Desligadas' }).rotinas, false);
    assert.equal(loadEnv({ NODE_ENV: 'test', ROTINAS: 'ligadas' }).rotinas, true);
    assert.throws(() => loadEnv({ ROTINAS: 'talvez' }), /ROTINAS inválido/);
  });
  it('e-mail dos alertas: SMTP opcional e remetente configurável', () => {
    const env = loadEnv({ SMTP_URL: 'smtps://u:s@smtp.exemplo.com:465', EMAIL_REMETENTE: 'Escola <oi@escola.com>' });
    assert.equal(env.smtpUrl, 'smtps://u:s@smtp.exemplo.com:465');
    assert.equal(env.emailRemetente, 'Escola <oi@escola.com>');
  });
  it('APP_URL: o endereço do front nos links de e-mail (padrão: a primeira origem do CORS)', () => {
    assert.equal(loadEnv({ CORS_ORIGIN: 'https://escola.com.br, http://localhost:5173' }).appUrl, 'https://escola.com.br');
    assert.equal(loadEnv({ APP_URL: 'https://app.escola.com.br/' }).appUrl, 'https://app.escola.com.br');
    assert.equal(loadEnv({ CORS_ORIGIN: '*' }).appUrl, 'http://localhost:5173');
    assert.throws(() => loadEnv({ APP_URL: 'escola.com.br' }), /APP_URL inválida/);
  });
  it('TRUST_PROXY: booleano, número de proxies ou a lista do Express', () => {
    assert.equal(loadEnv({}).trustProxy, false);
    assert.equal(loadEnv({ TRUST_PROXY: 'TRUE' }).trustProxy, true);
    assert.equal(loadEnv({ TRUST_PROXY: 'false' }).trustProxy, false);
    assert.equal(loadEnv({ TRUST_PROXY: '1' }).trustProxy, 1);
    assert.equal(loadEnv({ TRUST_PROXY: 'loopback, 10.0.0.0/8' }).trustProxy, 'loopback, 10.0.0.0/8');
    assert.throws(() => loadEnv({ TRUST_PROXY: 'sim!' }), /TRUST_PROXY inválido/);
  });
});
