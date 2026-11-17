import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMemoryRepositories } from '../../src/infra/memory/memoryRepositories.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createEscolaService } from '../../src/modules/escolas/escola.service.js';
import { ValidationError } from '../../src/shared/errors.js';
import { criarEscola, gerarSenha } from '../../scripts/criar-escola.js';
import { hasherFake, tokenServiceFake } from '../helpers/fakes.js';

function servico() {
  const base = createMemoryRepositories();
  const auth = createAuthService({ ...base, passwordHasher: hasherFake, tokenService: tokenServiceFake });
  return { base, escolas: createEscolaService({ escolas: base.escolas, passwordHasher: hasherFake, auth, cadastroAberto: true }) };
}
const DADOS = { nome: 'Escola de Música EMMOO', codigo: 'EMMOO', responsavel: 'Lucimara', email: 'lucimara@emmoo.com.br' };

describe('npm run escola:criar — a escola de produção, sem usuários de demonstração', () => {
  it('cria a escola e a coordenação; sem --senha, gera uma provisória e a devolve para mostrar', async () => {
    const { base, escolas } = servico();
    const { escola, usuario, senhaGerada } = await criarEscola(escolas, { ...DADOS, login: 'admin' }, { senhaAleatoria: () => 'Provisoria123' });
    assert.deepEqual([escola.codigo, usuario.papel, usuario.login, senhaGerada], ['emmoo', 'coordenacao', 'admin', 'Provisoria123']);
    const gravada = await base.paraEscola(escola.id).usuarios.findByLogin('admin');
    assert.equal(gravada.senhaHash, 'hash:Provisoria123');
    assert.equal((await base.paraEscola(escola.id).usuarios.list()).length, 1); // só ela: nada de demonstração
  });

  it('com --senha, usa a informada e não mostra nenhuma; sem --login, entra pelo e-mail', async () => {
    const { escolas } = servico();
    const { usuario, senhaGerada } = await criarEscola(escolas, { ...DADOS, senha: 'SenhaForte9' });
    assert.deepEqual([usuario.login, usuario.email, senhaGerada], [null, 'lucimara@emmoo.com.br', null]);
  });

  it('segue as regras do cadastro pela tela', async () => {
    const { escolas } = servico();
    await assert.rejects(criarEscola(escolas, { ...DADOS, codigo: 'x', email: 'sem-arroba' }), (erro) => {
      assert.ok(erro instanceof ValidationError);
      assert.deepEqual(erro.details.map((detalhe) => detalhe.campo), ['codigo', 'email']);
      return true;
    });
  });

  it('a senha gerada é aleatória e longa o bastante', () => {
    const senhas = new Set(Array.from({ length: 20 }, gerarSenha));
    assert.equal(senhas.size, 20);
    for (const senha of senhas) assert.match(senha, /^[A-Za-z0-9_-]{14}$/);
  });
});
