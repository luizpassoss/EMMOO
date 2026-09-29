import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPasswordHasher } from '../../src/infra/security/passwordHasher.js';
import { createTokenService } from '../../src/infra/security/tokenService.js';
import { UnauthorizedError } from '../../src/shared/errors.js';

describe('adaptador de senha (bcrypt)', () => {
  const hasher = createPasswordHasher({ rounds: 4 });
  it('gera hash diferente da senha e confere corretamente', async () => {
    const hash = await hasher.hash('segredo123');
    assert.notEqual(hash, 'segredo123');
    assert.equal(await hasher.compare('segredo123', hash), true);
    assert.equal(await hasher.compare('outra', hash), false);
  });
  it('usa 10 rounds por padrão', () => {
    assert.equal(typeof createPasswordHasher().hash, 'function');
  });
});

describe('adaptador de token (JWT)', () => {
  const tokens = createTokenService({ secret: 'segredo-de-teste', expiresIn: '1h' });
  it('assina e valida o payload', () => {
    const token = tokens.sign({ sub: '1', papel: 'coordenacao' });
    const payload = tokens.verify(token);
    assert.equal(payload.sub, '1');
    assert.equal(payload.papel, 'coordenacao');
  });
  it('rejeita token adulterado ou de outro segredo', () => {
    const outro = createTokenService({ secret: 'outro-segredo' });
    assert.throws(() => tokens.verify('abc.def.ghi'), UnauthorizedError);
    assert.throws(() => tokens.verify(outro.sign({ sub: '1', papel: 'professor' })), UnauthorizedError);
  });
  it('exige segredo', () => {
    assert.throws(() => createTokenService({ secret: '' }), /segredo/);
  });
});
