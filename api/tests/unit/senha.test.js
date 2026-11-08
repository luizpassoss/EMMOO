import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { createAuthService, MENSAGEM_ESQUECI, VALIDADE_DO_LINK_MS } from '../../src/modules/auth/auth.service.js';
import { ConflictError, TooManyRequestsError, UnauthorizedError, ValidationError } from '../../src/shared/errors.js';
import { aguardarTick, hasherFake, reposDaEscolaDemo, tokenServiceFake } from '../helpers/fakes.js';

const INICIO = Date.parse('2026-10-07T13:00:00.000Z');

let base;
let escola;
let repos;
let agora;
let enviados;
let falharEnvio;
let logs;
const mailer = {
  configurado: true,
  async enviar(mensagem) {
    if (falharEnvio) throw new Error('SMTP fora do ar');
    enviados.push(mensagem);
  },
};
const criar = (extra = {}) =>
  createAuthService({
    escolas: base.escolas,
    paraEscola: base.paraEscola,
    passwordHasher: hasherFake,
    tokenService: tokenServiceFake,
    redefinicoesDeSenha: base.redefinicoesDeSenha,
    mailer,
    appUrl: 'https://app.emmoo.com.br/',
    logger: { error: (mensagem) => logs.push(mensagem) },
    agora: () => agora,
    ...extra,
  });
/** O token do link do último e-mail enviado. */
const tokenDoEmail = () => enviados.at(-1).texto.match(/redefinir-senha\?token=([A-Za-z0-9_-]+)/)[1];
const noCampo = (campo) => (erro) => {
  assert.ok(erro instanceof ValidationError, erro.message);
  assert.equal(erro.details[0].campo, campo);
  return true;
};

beforeEach(async () => {
  ({ base, escola, repos } = await reposDaEscolaDemo({ hoje: '2026-10-07' }));
  agora = INICIO;
  enviados = [];
  falharEnvio = false;
  logs = [];
});

describe('trocar a própria senha', () => {
  it('com a senha atual: grava a nova, encerra as outras sessões e devolve a sessão nova', async () => {
    const auth = criar();
    const { token, usuario } = await auth.trocarSenha({ id: 2, escolaId: escola.id }, { senhaAtual: 'Luiz123', novaSenha: 'violao2026' });
    assert.equal(token, `token:2:professor:${escola.id}:1`); // versão da sessão 1
    assert.equal(usuario.nome, 'Luiz');
    const luiz = await repos.usuarios.findById(2);
    assert.deepEqual([luiz.senhaHash, luiz.versaoSessao], ['hash:violao2026', 1]);
    assert.equal(await auth.validarSessao({ usuarioId: 2, escolaId: escola.id, versao: 0 }), null); // o token antigo caiu
    assert.equal((await auth.login({ escola: 'emmoo', login: 'luiz', senha: 'violao2026' })).usuario.id, 2);
  });

  it('confere a senha atual e as regras da nova', async () => {
    const auth = criar();
    const luiz = { id: 2, escolaId: escola.id };
    await assert.rejects(auth.trocarSenha(luiz, { novaSenha: 'violao2026' }), noCampo('senhaAtual'));
    await assert.rejects(auth.trocarSenha(luiz, { senhaAtual: 'Luiz123', novaSenha: '123' }), noCampo('novaSenha'));
    await assert.rejects(auth.trocarSenha(luiz, { senhaAtual: 'errada', novaSenha: 'violao2026' }), (erro) => {
      assert.equal(erro.details[0].mensagem, 'A senha atual não confere.');
      return true;
    });
    await assert.rejects(auth.trocarSenha(luiz, { senhaAtual: 'Luiz123', novaSenha: 'Luiz123' }), (erro) => {
      assert.equal(erro.details[0].mensagem, 'A nova senha precisa ser diferente da atual.');
      return true;
    });
    await assert.rejects(auth.trocarSenha({ id: 99, escolaId: escola.id }, { senhaAtual: 'x', novaSenha: 'violao2026' }), /não encontrado/);
  });

  it('5 senhas atuais erradas em 15 minutos bloqueiam a troca por um tempo', async () => {
    const auth = criar();
    const luiz = { id: 2, escolaId: escola.id };
    for (let i = 0; i < 5; i += 1) {
      await assert.rejects(auth.trocarSenha(luiz, { senhaAtual: 'errada', novaSenha: 'violao2026' }), ValidationError);
    }
    await assert.rejects(auth.trocarSenha(luiz, { senhaAtual: 'Luiz123', novaSenha: 'violao2026' }), {
      name: TooManyRequestsError.name,
      message: 'Muitas tentativas. Tente novamente em 15 minutos.',
    });
    agora += 15 * 60 * 1000 + 1;
    assert.ok((await auth.trocarSenha(luiz, { senhaAtual: 'Luiz123', novaSenha: 'violao2026' })).token);
  });
});

describe('limite de tentativas de login', () => {
  it('5 senhas erradas na mesma conta bloqueiam só essa conta por 15 minutos; a certa limpa a contagem', async () => {
    const auth = criar();
    const errar = () => auth.login({ escola: 'emmoo', login: 'luiz', senha: 'errada' }, { ip: '10.0.0.1' });
    for (let i = 0; i < 4; i += 1) await assert.rejects(errar(), UnauthorizedError);
    await auth.login({ escola: 'emmoo', login: 'luiz', senha: 'Luiz123' }, { ip: '10.0.0.1' }); // zera a conta
    for (let i = 0; i < 5; i += 1) await assert.rejects(errar(), UnauthorizedError);
    await assert.rejects(auth.login({ escola: 'emmoo', login: 'LUIZ', senha: 'Luiz123' }, { ip: '10.0.0.2' }), {
      name: TooManyRequestsError.name,
      message: 'Muitas tentativas. Tente novamente em 15 minutos.',
    });
    assert.ok(await auth.login({ escola: 'emmoo', login: 'admin', senha: 'admin' }, { ip: '10.0.0.1' })); // outra conta entra
    agora += 10 * 60 * 1000;
    await assert.rejects(auth.login({ escola: 'emmoo', login: 'luiz', senha: 'Luiz123' }), /em 5 minutos/);
    agora += 5 * 60 * 1000;
    assert.ok(await auth.login({ escola: 'emmoo', login: 'luiz', senha: 'Luiz123' }));
  });

  it('30 erros do mesmo endereço (contas diferentes) bloqueiam o endereço', async () => {
    const auth = criar();
    for (let i = 0; i < 30; i += 1) {
      await assert.rejects(auth.login({ escola: 'emmoo', login: `pessoa${i}`, senha: 'x' }, { ip: '10.0.0.9' }), UnauthorizedError);
    }
    await assert.rejects(auth.login({ escola: 'emmoo', login: 'admin', senha: 'admin' }, { ip: '10.0.0.9' }), TooManyRequestsError);
    assert.ok(await auth.login({ escola: 'emmoo', login: 'admin', senha: 'admin' }, { ip: '10.0.0.10' }));
  });
});

describe('esqueci minha senha (link por e-mail)', () => {
  it('manda o link (o banco guarda só o hash) e a mesma resposta para quem existe ou não', async () => {
    const auth = criar();
    assert.deepEqual(await auth.esqueciSenha({ escola: 'EMMOO', login: 'luiz' }), { mensagem: MENSAGEM_ESQUECI });
    await aguardarTick();
    assert.equal(enviados.length, 1);
    const [email] = enviados;
    assert.deepEqual([email.para, email.assunto], ['luiz@emmoo.com.br', 'Redefinição de senha — Escola de Música EMMOO']);
    assert.match(email.texto, /https:\/\/app\.emmoo\.com\.br\/redefinir-senha\?token=[A-Za-z0-9_-]{43}\n/);
    const token = tokenDoEmail();
    const pedido = await base.redefinicoesDeSenha.findByTokenHash(createHash('sha256').update(token).digest('hex'));
    assert.deepEqual(
      [pedido.usuarioId, pedido.escolaId, pedido.expiraEm, pedido.usadoEm],
      [2, escola.id, new Date(INICIO + VALIDADE_DO_LINK_MS).toISOString(), null],
    );
    assert.equal(JSON.stringify(pedido).includes(token), false);

    // Escola, usuário ou acesso desativado: mesma resposta, nenhum e-mail.
    await repos.usuarios.update(3, { ativo: false });
    for (const dados of [{ escola: 'outra', login: 'luiz' }, { escola: 'emmoo', login: 'ninguem' }, { escola: 'emmoo', login: 'mary@emmoo.com.br' }]) {
      assert.deepEqual(await auth.esqueciSenha(dados), { mensagem: MENSAGEM_ESQUECI });
    }
    await aguardarTick();
    assert.equal(enviados.length, 1);
  });

  it('sem e-mail configurado na API, avisa para pedir à coordenação; valida os campos', async () => {
    await assert.rejects(criar({ mailer: { configurado: false } }).esqueciSenha({ escola: 'emmoo', login: 'luiz' }), {
      name: ConflictError.name,
      message: /Peça à coordenação/,
    });
    await assert.rejects(criar().esqueciSenha({ escola: 'emmoo' }), noCampo('login'));
  });

  it('falha no envio fica no log, sem mudar a resposta', async () => {
    falharEnvio = true;
    assert.deepEqual(await criar().esqueciSenha({ escola: 'emmoo', login: 'admin' }), { mensagem: MENSAGEM_ESQUECI });
    await aguardarTick();
    assert.match(logs[0], /não foi possível enviar o e-mail de redefinição: SMTP fora do ar/);
  });

  it('3 pedidos por conta (ou 10 por endereço) em 15 minutos', async () => {
    const auth = criar();
    for (let i = 0; i < 3; i += 1) await auth.esqueciSenha({ escola: 'emmoo', login: 'luiz' }, { ip: '1.1.1.1' });
    await assert.rejects(auth.esqueciSenha({ escola: 'emmoo', login: 'luiz' }, { ip: '2.2.2.2' }), TooManyRequestsError);
    for (let i = 0; i < 7; i += 1) await auth.esqueciSenha({ escola: 'emmoo', login: `x${i}` }, { ip: '1.1.1.1' });
    await assert.rejects(auth.esqueciSenha({ escola: 'emmoo', login: 'admin' }, { ip: '1.1.1.1' }), TooManyRequestsError);
  });

  it('redefine com o link: senha nova, sessões encerradas, link usado uma vez só', async () => {
    const auth = criar();
    await auth.esqueciSenha({ escola: 'emmoo', login: 'luiz@emmoo.com.br' });
    await aguardarTick();
    const token = tokenDoEmail();
    await assert.rejects(auth.redefinirSenha({ token, novaSenha: '123' }), noCampo('novaSenha'));
    assert.deepEqual(await auth.redefinirSenha({ token, novaSenha: 'violao2026' }), {
      mensagem: 'Senha redefinida. Entre com a senha nova.',
      escola: 'emmoo',
    });
    const luiz = await repos.usuarios.findById(2);
    assert.deepEqual([luiz.senhaHash, luiz.versaoSessao], ['hash:violao2026', 1]);
    await assert.rejects(auth.redefinirSenha({ token, novaSenha: 'outra-senha' }), noCampo('token'));
  });

  it('só o último link vale, por 1 hora; token adulterado é recusado', async () => {
    const auth = criar();
    await auth.esqueciSenha({ escola: 'emmoo', login: 'admin' });
    await aguardarTick();
    const primeiro = tokenDoEmail();
    await auth.esqueciSenha({ escola: 'emmoo', login: 'admin' });
    await aguardarTick();
    const segundo = tokenDoEmail();
    await assert.rejects(auth.redefinirSenha({ token: primeiro, novaSenha: 'nova-senha' }), /inválido ou já expirou/);
    await assert.rejects(auth.redefinirSenha({ token: 'abc', novaSenha: 'nova-senha' }), noCampo('token'));
    await assert.rejects(auth.redefinirSenha({ novaSenha: 'nova-senha' }), noCampo('token'));
    agora += VALIDADE_DO_LINK_MS;
    await assert.rejects(auth.redefinirSenha({ token: segundo, novaSenha: 'nova-senha' }), noCampo('token'));
  });

  it('trocar a senha (ou redefinir) invalida os links pendentes; acesso desativado não redefine', async () => {
    const auth = criar();
    await auth.esqueciSenha({ escola: 'emmoo', login: 'luiz' });
    await aguardarTick();
    const token = tokenDoEmail();
    await auth.trocarSenha({ id: 2, escolaId: escola.id }, { senhaAtual: 'Luiz123', novaSenha: 'violao2026' });
    await assert.rejects(auth.redefinirSenha({ token, novaSenha: 'outra-senha' }), noCampo('token'));

    await auth.esqueciSenha({ escola: 'emmoo', login: 'admin' });
    await aguardarTick();
    await repos.usuarios.update(1, { ativo: false });
    await assert.rejects(auth.redefinirSenha({ token: tokenDoEmail(), novaSenha: 'outra-senha' }), noCampo('token'));
  });

  it('10 links inválidos do mesmo endereço bloqueiam por um tempo', async () => {
    const auth = criar();
    const invalido = 'A'.repeat(43);
    for (let i = 0; i < 10; i += 1) {
      await assert.rejects(auth.redefinirSenha({ token: invalido, novaSenha: 'nova-senha' }, { ip: '3.3.3.3' }), ValidationError);
    }
    await assert.rejects(auth.redefinirSenha({ token: invalido, novaSenha: 'nova-senha' }, { ip: '3.3.3.3' }), TooManyRequestsError);
  });

  it('pedidos vencidos são apagados no próximo pedido', async () => {
    const auth = criar();
    await auth.esqueciSenha({ escola: 'emmoo', login: 'luiz' });
    agora += VALIDADE_DO_LINK_MS + 1000;
    await auth.esqueciSenha({ escola: 'emmoo', login: 'admin' });
    await aguardarTick();
    assert.equal(await base.redefinicoesDeSenha.removerVencidos(new Date(agora).toISOString()), 0); // já foram
  });
});
